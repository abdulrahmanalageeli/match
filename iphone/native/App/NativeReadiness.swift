import SwiftUI
import WudaynCore

struct NativeReadiness: View {
    @EnvironmentObject private var store: NativeStore
    var connectionID: String? = nil
    @State private var passport: JSONValue = .null
    @State private var draft: JSONValue = .object([:])
    @State private var shared: JSONValue = .null
    @State private var consent = false
    @State private var sections: JSONValue = .object([:])
    @State private var days = 7
    @State private var withdraw = false
    private var catalog: JSONValue { NativeCatalog.value["readiness"] }
    var body: some View {
        Form {
            Section("جواز جاهزيتك") {
                Text("هذه إفاداتك الشخصية، وليست توثيقًا رسميًا. تختار بنفسك ما تشاركه ومع من.").foregroundStyle(.secondary)
                NativeChoice(title: "الوقت المناسب", value: $draft.text("timeline"), options: NativeOption.values(catalog["timelineOptions"]))
                NativeChoice(title: "مشاركة الأسرة", value: $draft.text("family"), options: NativeOption.values(catalog["familyOptions"]))
            }
            Section("الاستعداد العملي") {
                ForEach(catalog["preparationItems"].rows) { row in
                    NativeChoice(title: row.value["label"].string, value: $draft.field("preparation").text(row.id), options: NativeOption.values(catalog["preparationStatusOptions"]))
                }
                Toggle("أوافق على معالجة بيانات جواز الجاهزية لهذا الغرض", isOn: $consent)
                NativeAction(title: "حفظ الجواز") {
                    var payload = draft; payload["consentVersion"] = .string("readiness-v1")
                    passport = try await request("save", payload); draft = passport
                }.disabled(!consent)
            }
            if let connectionID {
                Section("المشاركة في هذا التعارف") {
                    ForEach(catalog["readinessSections"].rows) { row in Toggle(row.value["label"].string, isOn: $sections.flag(row.id)) }
                    Picker("المدة", selection: $days) { Text("٧ أيام").tag(7); Text("٣٠ يومًا").tag(30) }
                    NativeAction(title: "مشاركة الأقسام المحددة") {
                        passport = try await request("share", .object(["connectionId": .string(connectionID), "days": .number(Double(days)), "sections": .array(sections.object.filter { $0.value.bool }.keys.sorted().map(JSONValue.string))]))
                    }.disabled(passport["consentedAt"].isNull || !sections.object.values.contains(.bool(true)))
                    NativeAction(title: "إلغاء المشاركة") { passport = try await request("revoke", .object(["connectionId": .string(connectionID)])) }
                }
                if shared["available"].bool { Section("الجواز الذي شاركه الطرف الآخر") { NativePassportSummary(value: shared) } }
            }
            Section("المشاركات الحالية") {
                ForEach(Array(passport["grants"].array.enumerated()), id: \.offset) { _, grant in
                    VStack(alignment: .leading) { Text("حتى \(NativeDates.display(grant["expiresAt"].string))"); NativeAction(title: "إلغاء هذه المشاركة") { passport = try await request("revoke", .object(["connectionId": grant["connectionId"]])) } }
                }
            }
            if !passport["consentedAt"].isNull { Button("حذف الجواز وسحب الموافقة", role: .destructive) { withdraw = true } }
        }.navigationTitle("جواز الجاهزية").task { await store.perform {
            passport = try await request("get"); draft = passport; consent = !passport["consentedAt"].isNull
            if let connectionID { shared = try await request("view", .object(["connectionId": .string(connectionID)])) }
        } }.confirmationDialog("حذف الجواز وإنهاء كل مشاركاته؟", isPresented: $withdraw, titleVisibility: .visible) {
            NativeAction(title: "حذف الجواز") { passport = try await request("withdraw"); draft = .object([:]); consent = false }
        }
    }
    private func request(_ action: String, _ payload: JSONValue = .object([:])) async throws -> JSONValue { try await store.client.rpc("marriage_passport", ["action": .string(action), "payload": payload]) }
}

struct NativePassportSummary: View {
    let value: JSONValue
    private func label(_ group: String, _ key: String) -> String { NativeOption.values(NativeCatalog.value["readiness"][group]).first { $0.id == value[key].string }?.label ?? "" }
    var body: some View {
        Text(label("timelineOptions", "timeline")); Text(label("familyOptions", "family"))
        ForEach(NativeCatalog.value["readiness"]["preparationItems"].rows) { row in
            if let option = NativeOption.values(NativeCatalog.value["readiness"]["preparationStatusOptions"]).first(where: { $0.id == value["preparation"][row.id].string }) {
                LabeledContent(row.value["label"].string, value: option.label)
            }
        }
        ForEach(value["claims"].rows) { row in Text(row.value["label"].string) }
    }
}

struct NativeJourney: View {
    @EnvironmentObject private var store: NativeStore
    let connectionID: String
    @State private var progress: JSONValue = .null
    @State private var exclusive = false
    @State private var rewind = false
    var body: some View {
        Form {
            Section("خطواتكما") {
                if !progress.isNull {
                    let stage = Int(progress["stage"].number)
                    let isExclusive = progress["exclusive"].bool
                    let mine = progress[isExclusive ? "mine" : "consentMine"].bool
                    let peer = progress[isExclusive ? "peer" : "consentPeer"].bool
                    let stages = NativeCatalog.memberCopy["stages"].array
                    if stages.indices.contains(stage) { LabeledContent("المرحلة الحالية", value: stages[stage].string) }
                    Text("كل خطوة تحتاج موافقة الطرفين. يمكنك التراجع عن موافقتك قبل اكتمال الخطوة.").foregroundStyle(.secondary)
                    if !isExclusive {
                        Text(NativeCatalog.copy("exclusiveEffect")).font(.footnote)
                        if !mine { Toggle(NativeCatalog.copy("exclusiveConsent"), isOn: $exclusive) }
                        NativeAction(title: NativeCatalog.copy(mine ? "withdrawExclusive" : peer ? "acceptExclusive" : "proposeExclusive")) {
                            try await nextStep(1, agree: !mine, consent: exclusive)
                            exclusive = false
                        }.disabled(!mine && !exclusive)
                    } else if stages.indices.contains(stage + 1) {
                        let labels = NativeCatalog.memberCopy[mine ? "withdrawStage" : peer ? "acceptStage" : "proposeStage"].array
                        NativeAction(title: labels[stage + 1].string) { try await nextStep(stage + 1, agree: !mine, consent: false) }
                    }
                } else { ProgressView() }
                if progress["stage"].number > 0 {
                    if progress["rewindMine"].bool {
                        NativeAction(title: NativeCatalog.copy("withdrawRewind")) { try await rewindStep(false) }
                    } else {
                        Button(NativeCatalog.copy("rewind")) { rewind = true }
                    }
                }
            }
            NavigationLink("جواز الجاهزية والمشاركة", destination: NativeReadiness(connectionID: connectionID))
            NavigationLink("جسر الأهل", destination: NativeFamily(connectionID: connectionID))
        }.navigationTitle("خطوات التعارف").task { await store.perform { try await load() } }
            .confirmationDialog("طلب العودة للخطوة السابقة؟", isPresented: $rewind, titleVisibility: .visible) {
                if let previousStage {
                    let peer = progress["rewindPeer"].bool
                    NativeAction(title: NativeCatalog.memberCopy[peer ? "acceptRewind" : "proposeRewind"].array[previousStage].string) {
                        try await rewindStep(true)
                    }
                    if peer { NativeAction(title: NativeCatalog.copy("keepStage")) { try await rewindStep(false) } }
                }
            } message: {
                if let previousStage { Text(NativeCatalog.memberCopy["rewindEffect"].array[previousStage].string) }
            }
    }
    private var previousStage: Int? {
        let index = Int(progress["stage"].number) - 1
        return NativeCatalog.memberCopy["rewindEffect"].array.indices.contains(index) ? index : nil
    }
    private func rewindStep(_ agree: Bool) async throws {
        _ = try await store.client.rpc("marriage_rewind_step", ["request_id": .string(connectionID), "expected_stage": progress["stage"], "agree": .bool(agree)])
        try await load()
    }
    private func nextStep(_ stage: Int, agree: Bool, consent: Bool) async throws {
        _ = try await store.client.rpc("marriage_next_step", ["request_id": .string(connectionID), "stage_number": .number(Double(stage)), "agree": .bool(agree), "exclusive_consent": .bool(consent)])
        try await load()
    }
    private func load() async throws { progress = try await store.client.rpc("marriage_progress", ["request_id": .string(connectionID)]) }
}
