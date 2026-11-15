import SwiftUI
import WudaynCore

struct NativeInterview: View {
    @EnvironmentObject private var store: NativeStore
    var profileDraft: Binding<JSONValue>? = nil
    @State private var snapshot: JSONValue = .null
    @State private var answer = ""
    @State private var consent = false
    @State private var share = false
    @State private var choices: JSONValue = .object([:])
    @State private var requestID = UUID().uuidString.lowercased()
    @State private var deleting = false
    @State private var ready = false
    @State private var profileChoices: JSONValue = .object([:])
    @State private var assessment: JSONValue = .null
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
                Section("اختيارات التوافق") {
                    NavigationLink("مراجعة جميع اختياراتي", destination: NativeAssessment(profile: $assessment))
                    Toggle("أوافق على معالجة اختياراتي للتوافق", isOn: $assessment.field("signupConsents").flag("assessment"))
                    NativeAction(title: "اعتماد جميع اختياراتي بعد الحوار") {
                        guard assessment["signupConsents"]["assessment"].bool else { throw NativeProblem.message("يلزم قبول معالجة إجابات التوافق.") }
                        let selected = NativeInterviewProfile.assessmentChoices(assessment)
                        let required = NativeCatalog.value["catalog"]["dimensions"].array.count * 2 + NativeCatalog.value["personality"].array.count
                        guard selected.count == required else { throw NativeProblem.message("أكمل جميع اختيارات التوافق والشخصية أولًا.") }
                        try await call("structuredConfirm", ["choices": .array(selected), "shareReview": .bool(share)])
                        try await applyConfirmed()
                    }
                }
                ForEach(document["turns"].rows) { row in Section { Text(row.value["question"].string).font(.headline); Text(row.value["answer"].string).textSelection(.enabled) } }
                if document["status"].string == "active" {
                    Section(document["currentQuestion"]["text"].string) {
                        TextField("إجابتك", text: $answer, axis: .vertical).lineLimit(3...10).onChange(of: answer) { _ in requestID = UUID().uuidString.lowercased() }
                        ForEach(document["currentQuestion"]["suggestions"].array.map(\.string), id: \.self) { suggestion in Button(suggestion) { answer = suggestion }.disabled(!answer.isEmpty) }
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
                if !document["profileProposals"].array.isEmpty {
                    Section("اقتراحات لملفك · راجع قبل الاعتماد") {
                        ForEach(document["profileProposals"].rows) { row in
                            VStack(alignment: .leading, spacing: 8) {
                                Text(row.value["summary"].string)
                                Text(NativeInterviewProfile.description(row.value)).font(.caption)
                                Toggle("أعتمد هذا الاقتراح", isOn: $profileChoices.flag(row.id)).disabled(row.value["needsClarification"].bool)
                            }
                        }
                        NativeAction(title: "تأكيد اقتراحات الملف المحددة") {
                            let selected = document["profileProposals"].array.filter { profileChoices[$0["id"].string].bool && !$0["needsClarification"].bool }.map { item in JSONValue.object(["id": item["id"], "values": item["values"], "mode": item["mode"], "exclude": item["exclude"]]) }
                            guard !selected.isEmpty else { throw NativeProblem.message("حدد الاقتراحات التي توافق عليها.") }
                            try await call("profileConfirm", ["profileChoices": .array(selected)])
                        }
                        if !document["profileConfirmed"].array.isEmpty { NativeAction(title: "تطبيق اقتراحات الملف المؤكدة") {
                            let profile = NativeInterviewProfile.apply(document["profileConfirmed"].array, to: profileDraft?.wrappedValue ?? store.profile)
                            if let profileDraft { profileDraft.wrappedValue = profile }
                            else { _ = try await store.client.rpc("marriage_apply", ["payload": profile]); try await store.refresh() }
                        } }
                    }
                }
                Button("حذف الجلسة", role: .destructive) { deleting = true }
            }
        }.navigationTitle("جلسة التوافق").task { await store.perform { assessment = profileDraft?.wrappedValue ?? store.profile; try await call("load"); answer = document["draftAnswer"].string; share = document["reviewSharing"].bool; ready = true } }
            .confirmationDialog("حذف الحوار وبيانات الجلسة؟", isPresented: $deleting, titleVisibility: .visible) { NativeAction(title: "حذف الجلسة") { try await call("delete"); answer = ""; choices = .object([:]) } }
    }
    private func call(_ action: String, _ payload: [String: JSONValue] = [:]) async throws {
        var body = payload; body["action"] = .string(action)
        if action != "load" && action != "start" { body["revision"] = snapshot["revision"] }
        if ["start", "answer", "clarify", "retry", "review"].contains(action) {
            let profile = profileDraft?.wrappedValue ?? store.profile
            body["sensitiveProfileAllowed"] = .bool(profile["signupConsents"]["sensitiveProfile"].bool)
            body["profileContext"] = .array(NativeInterviewProfile.context(profile))
        }
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
        var profile = profileDraft?.wrappedValue ?? store.profile
        guard profile["signupConsents"]["assessment"].bool || assessment["signupConsents"]["assessment"].bool else { throw NativeProblem.message("فعّل موافقة التقييم من ملفك قبل تطبيق الاختيارات.") }
        profile["signupConsents"]["assessment"] = .bool(true)
        for key in ["priorityCategories", "hardRequirements"] { if !assessment[key].isNull { profile[key] = assessment[key] } }
        for item in document["confirmed"].array {
            let values = item["values"].array, field = item["fieldId"].string, side = item["side"].string
            let allowed = Set(options(item).map(\.id))
            guard !values.isEmpty, values.allSatisfy({ allowed.contains($0.string) }) else { continue }
            if item["kind"].string == "preference", values.count == 1, let dimension = NativeCatalog.value["catalog"]["dimensions"].array.first(where: { $0["id"].string == field }) { profile["surveyAnswers"][dimension[side == "partner" ? "partnerId" : "id"].string] = values[0] }
            else if item["kind"].string == "personality", values.count == 1 { profile["personalityAnswers"][field] = values[0] }
            else if item["kind"].string == "beena" { profile["beena"]["version"] = .string("beena-v1"); profile["beena"]["answers"][field][side] = side == "partner" ? .array(values) : side == "importance" ? .number(Double(values[0].string) ?? 1) : values[0] }
        }
        if let profileDraft { profileDraft.wrappedValue = profile }
        else { _ = try await store.client.rpc("marriage_apply", ["payload": profile]); try await store.refresh() }
    }
}

enum NativeInterviewProfile {
    private static var fields: [JSONValue] { NativeCatalog.value["profileCapture"].array }
    static func assessmentChoices(_ profile: JSONValue) -> [JSONValue] {
        var choices: [JSONValue] = []
        for dimension in NativeCatalog.value["catalog"]["dimensions"].array { for side in ["self", "partner"] {
            let answer = profile["surveyAnswers"][dimension[side == "self" ? "id" : "partnerId"].string]
            if NativeOption.values(dimension["options"], label: side).contains(where: { $0.id == answer.string }) { choices.append(.object(["id": .string("preference:\(dimension["id"].string):\(side)"), "values": .array([answer])])) }
        } }
        for field in NativeCatalog.value["personality"].array {
            let answer = profile["personalityAnswers"][field["id"].string]
            if ["A", "B", "C", "D", "E"].contains(answer.string) { choices.append(.object(["id": .string("personality:\(field["id"].string):self"), "values": .array([answer])])) }
        }
        return choices
    }
    static func description(_ proposal: JSONValue) -> String {
        guard let field = fields.first(where: { $0["fieldId"] == proposal["fieldId"] }) else { return "" }
        let options = NativeOption.values(field["options"])
        return field["label"].string + ": " + proposal["values"].array.map { value in options.first { $0.id == value.string }?.label ?? value.string }.joined(separator: "، ")
    }
    static func context(_ profile: JSONValue) -> [JSONValue] {
        fields.compactMap { field in
            if field["sensitive"].bool && !profile["signupConsents"]["sensitiveProfile"].bool { return nil }
            let path = field["path"].array.map(\.string)
            guard (1...2).contains(path.count) else { return nil }
            let value = path.count == 1 ? profile[path[0]] : profile[path[0]][path[1]]
            if value.isNull { return nil }
            let shape = field["criterionShape"].string
            let values: [JSONValue]
            if !shape.isEmpty {
                if value["mode"].string == "any" || shape == "mode" { values = [] }
                else if shape == "range" { values = ["min", "max"].map { value[$0].isNull ? .string("") : .string(String(Int(value[$0].number))) } }
                else { values = shape == "values" ? value["values"].array : [value["target"]] }
            } else if field["kind"].string == "number" { values = [.string(String(Int(value.number)))] }
            else { values = field["kind"].string == "set" ? value.array : [value] }
            guard values.allSatisfy({ if case .string = $0 { return true }; return false }) else { return nil }
            if shape != "range" && values.contains(where: { $0.string.isEmpty }) { return nil }
            if shape.isEmpty && values.isEmpty { return nil }
            return .object(["fieldId": field["fieldId"], "values": .array(values), "mode": shape.isEmpty ? .null : value["mode"], "exclude": .bool(!shape.isEmpty && value["exclude"].bool)])
        }
    }
    static func apply(_ proposals: [JSONValue], to current: JSONValue) -> JSONValue {
        var result = current
        for proposal in proposals {
            guard !proposal["needsClarification"].bool, let field = fields.first(where: { $0["fieldId"] == proposal["fieldId"] }), !["bio", "lookingFor", "lifeTogether", "valuesStatement", "marriageIntent"].contains(field["fieldId"].string) else { continue }
            if field["sensitive"].bool && !current["signupConsents"]["sensitiveProfile"].bool { continue }
            let path = field["path"].array.map(\.string), values = proposal["values"].array, shape = field["criterionShape"].string
            guard (1...2).contains(path.count) else { continue }
            var value: JSONValue
            if !shape.isEmpty {
                guard ["any", "prefer", "require"].contains(proposal["mode"].string) else { continue }
                value = .object(["mode": proposal["mode"]])
                if proposal["mode"].string != "any" {
                    if shape == "range", values.count == 2 { for (index, key) in ["min", "max"].enumerated() { if let number = Double(values[index].string) { value[key] = .number(number) } } }
                    else if shape == "target", let first = values.first { value["target"] = first }
                    else if shape == "values" {
                        let nativeExclusion = field["fieldId"].string == "partnerCriteria.nationality"
                        value["values"] = proposal["exclude"].bool && !nativeExclusion ? .array(NativeOption.values(field["options"]).filter { !values.contains(.string($0.id)) }.map { .string($0.id) }) : .array(values)
                        if nativeExclusion { value["exclude"] = proposal["exclude"] }
                    }
                }
            } else if field["kind"].string == "number", let first = values.first, let number = Double(first.string) { value = .number(number) }
            else if field["kind"].string == "set" { value = .array(values) }
            else if let first = values.first { value = first }
            else { continue }
            if path.count == 1 { result[path[0]] = value } else { result[path[0]][path[1]] = value }
        }
        return result
    }
}
