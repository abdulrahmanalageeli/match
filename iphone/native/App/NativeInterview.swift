import SwiftUI
import WudaynCore

struct NativeInterview: View {
    @EnvironmentObject private var store: NativeStore
    @State private var snapshot: JSONValue = .null
    @State private var answer = ""
    @State private var consent = false
    @State private var share = false
    @State private var choices: JSONValue = .object([:])
    @State private var requestID = UUID().uuidString.lowercased()
    @State private var deleting = false
    @State private var ready = false
    private var document: JSONValue { snapshot["document"] }
    var body: some View {
        Form {
            if !ready { ProgressView() }
            else if document.isNull {
                Section {
                    Text("حوار يساعدك على صياغة تفضيلاتك. راجع كل اقتراح قبل اعتماده؛ لا يُنشر كلامك تلقائيًا.")
                    Toggle("أوافق على معالجة إجاباتي لإعداد جلسة التوافق", isOn: $consent)
                    NativeAction(title: "بدء الجلسة") { try await call("start", ["consentVersion": .string("wudayn-interview-v1"), "hybrid": .bool(true)]) }.disabled(!consent)
                }
            } else {
                ForEach(document["turns"].rows) { row in Section { Text(row.value["question"].string).font(.headline); Text(row.value["answer"].string).textSelection(.enabled) } }
                if document["status"].string == "active" {
                    Section(document["currentQuestion"]["text"].string) {
                        TextField("إجابتك", text: $answer, axis: .vertical).lineLimit(3...10).onChange(of: answer) { _ in requestID = UUID().uuidString.lowercased() }
                        NativeAction(title: "إرسال") { try await call("answer", ["answer": .string(answer), "skip": .bool(false), "hybrid": .bool(true), "requestId": .string(requestID)]); answer = document["draftAnswer"].string }.disabled(answer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || document["pendingAnalysis"].bool)
                        NativeAction(title: "حفظ المسودة") { try await call("draft", ["answer": .string(answer)]) }
                        NativeAction(title: "تخطي السؤال") { try await call("answer", ["answer": .string(""), "skip": .bool(true), "hybrid": .bool(true), "requestId": .string(requestID)]); requestID = UUID().uuidString.lowercased() }
                    }
                    if document["pendingAnalysis"].bool { NativeAction(title: "إكمال تحليل الإجابة") { try await call("retry") } }
                    NativeAction(title: "مراجعة الاقتراحات") { try await call("review") }
                }
                if document["status"].string != "active" {
                    Section("راجع اختياراتك") {
                        ForEach(document["proposals"].rows) { row in
                            VStack(alignment: .leading) {
                                Text(row.value["summary"].string)
                                NativeChoice(title: "اختياري", value: $choices.text(row.id), options: options(row.value))
                            }
                        }
                        Toggle("أوافق على مشاركة ملخص المراجعة", isOn: $share)
                        NativeAction(title: "تأكيد الاختيارات المحددة") {
                            let selected = document["proposals"].array.filter { !choices[$0["id"].string].string.isEmpty }.map { item in JSONValue.object(["id": item["id"], "values": .array([choices[item["id"].string]])]) }
                            guard !selected.isEmpty else { throw NativeProblem.message("اختر ما تريد اعتماده أولًا.") }
                            try await call("confirm", ["choices": .array(selected), "shareReview": .bool(share)])
                        }
                        if document["status"].string == "confirmed" {
                            NativeAction(title: "تطبيق الاختيارات المؤكدة على ملفي") { try await applyConfirmed() }
                        }
                        NativeAction(title: "العودة للحوار") { try await call("resume") }
                    }
                }
                Button("حذف الجلسة", role: .destructive) { deleting = true }
            }
        }.navigationTitle("جلسة التوافق").task { await store.perform { try await call("load"); answer = document["draftAnswer"].string; share = document["reviewSharing"].bool; ready = true } }
            .confirmationDialog("حذف الحوار وبيانات الجلسة؟", isPresented: $deleting, titleVisibility: .visible) { NativeAction(title: "حذف الجلسة") { try await call("delete"); answer = ""; choices = .object([:]) } }
    }
    private func call(_ action: String, _ payload: [String: JSONValue] = [:]) async throws {
        var body = payload; body["action"] = .string(action)
        if action != "load" && action != "start" { body["revision"] = snapshot["revision"] }
        body["sensitiveProfileAllowed"] = .bool(store.profile["signupConsents"]["sensitiveProfile"].bool)
        snapshot = try await store.client.service(.interview, body: .object(body))
    }
    private func options(_ item: JSONValue) -> [NativeOption] {
        let field = item["fieldId"].string, side = item["side"].string
        switch item["kind"].string {
        case "personality": return zip(["A", "B", "C", "D", "E"], ["لا يصفني إطلاقًا", "لا يصفني غالبًا", "أحيانًا", "يصفني غالبًا", "يصفني تمامًا"]).map { NativeOption(id: $0, label: $1) }
        case "preference": return NativeOption.values(NativeCatalog.value["catalog"]["dimensions"].array.first { $0["id"].string == field }?["options"] ?? .null, label: side == "partner" ? "partner" : "self")
        case "beena": if side == "importance" { return [NativeOption(id: "1", label: "مهم لي"), NativeOption(id: "2", label: "مهم جدًا لي")] }; return NativeOption.values(NativeCatalog.value["beena"]["beenaScenarios"].array.first { $0["id"].string == field }?["options"] ?? .null)
        default: return []
        }
    }
    private func applyConfirmed() async throws {
        guard store.profile["signupConsents"]["assessment"].bool else { throw NativeProblem.message("فعّل موافقة التقييم من ملفك قبل تطبيق الاختيارات.") }
        var profile = store.profile
        for item in document["confirmed"].array {
            let values = item["values"].array, field = item["fieldId"].string, side = item["side"].string
            let allowed = Set(options(item).map(\.id))
            guard !values.isEmpty, values.allSatisfy({ allowed.contains($0.string) }) else { continue }
            if item["kind"].string == "preference", values.count == 1, let dimension = NativeCatalog.value["catalog"]["dimensions"].array.first(where: { $0["id"].string == field }) { profile["surveyAnswers"][dimension[side == "partner" ? "partnerId" : "id"].string] = values[0] }
            else if item["kind"].string == "personality", values.count == 1 { profile["personalityAnswers"][field] = values[0] }
            else if item["kind"].string == "beena" { profile["beena"]["version"] = .string("beena-v1"); profile["beena"]["answers"][field][side] = side == "partner" ? .array(values) : side == "importance" ? .number(Double(values[0].string) ?? 1) : values[0] }
        }
        _ = try await store.client.rpc("marriage_apply", ["payload": profile]); try await store.refresh()
    }
}
