import SwiftUI
import WudaynCore

extension WudaynClient {
    func family(_ action: String, _ payload: [String: JSONValue] = [:]) async throws -> JSONValue {
        let value = try await rpc("marriage_family", ["action": .string(action), "payload": .object(payload)])
        if !value["error"].string.isEmpty { throw NativeProblem.message(value["error"].string) }
        return value
    }
}

struct NativeFamily: View {
    @EnvironmentObject private var store: NativeStore
    var connectionID: String? = nil
    @State private var state: JSONValue = .null
    @State private var relationship = "father"
    @State private var code = ""
    @State private var invite: JSONValue = .null
    @State private var name = ""
    @State private var consent = false
    @State private var roomTitle = ""
    @State private var selected: JSONValue = .object([:])
    @State private var pendingAction: FamilyConfirmation?
    @State private var exported: NativeDataDocument?
    @State private var exporting = false
    @Environment(\.scenePhase) private var phase
    private var relationships: [NativeOption] { zip(["father", "mother", "brother", "sister", "relative"], ["الأب", "الأم", "الأخ", "الأخت", "قريب"]).map { NativeOption(id: $0, label: $1) } }
    var body: some View {
        List {
            if state.isNull { ProgressView() }
            else {
                if state["role"].string == "guardian" && state["account"].isNull {
                    Section("حساب الأهل") {
                        TextField("اسمك", text: $name)
                        Toggle("أقر بأن عمري ١٨ عامًا أو أكثر وأوافق على معالجة بيانات جسر الأهل", isOn: $consent)
                        NativeAction(title: "إنشاء حساب الأهل") { try await act("register", ["displayName": .string(name), "adult": .bool(consent), "consentVersion": .string("family-v1")]) }.disabled(!consent || name.count < 2)
                    }
                }
                Section("روابط الأسرة") {
                    ForEach(state["links"].rows) { row in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(row.value["owner"].bool ? row.value["familyName"].string : row.value["memberName"].string)
                            Text(row.value["adminReview"].string == "approved" && row.value["status"].string == "active" ? "ربط جاهز" : "بانتظار الموافقات").font(.caption)
                            if row.value["owner"].bool && row.value["status"].string == "pending" { NativeAction(title: "الموافقة على الربط") { try await act("approve_link", ["linkId": .string(row.id)]) } }
                            Button("إلغاء الربط", role: .destructive) { pendingAction = FamilyConfirmation(title: "إلغاء هذا الربط؟", action: "revoke_link", payload: ["linkId": .string(row.id)]) }
                        }
                    }
                    if state["role"].string == "member" {
                        NativeChoice(title: "صلة القرابة", value: $relationship, options: relationships)
                        NativeAction(title: "إنشاء رمز ربط") { invite = try await store.client.family("invite_link", ["relationship": .string(relationship)]); try await load() }
                        if !invite["code"].string.isEmpty { Text(invite["code"].string).font(.title.monospaced()); ShareLink("مشاركة الرمز", item: invite["code"].string); Text("ينتهي: \(NativeDates.display(invite["expiresAt"].string))").font(.caption) }
                    } else {
                        TextField("رمز الربط", text: $code).textInputAutocapitalization(.characters).autocorrectionDisabled()
                        NativeAction(title: "طلب الربط") { try await act("claim_link", ["code": .string(code.replacingOccurrences(of: " ", with: "").replacingOccurrences(of: "-", with: "").uppercased())]); code = "" }.disabled(code.isEmpty)
                    }
                    ForEach(state["invites"].rows) { row in NativeAction(title: "إلغاء الرمز المنتهي في \(NativeDates.display(row.value["expiresAt"].string))") { try await act("revoke_invite", ["inviteId": .string(row.id)]); invite = .null } }
                }
                if let connectionID {
                    Section("إشراك الأهل في هذا التعارف") {
                        Text("لا تفتح المساحة إلا بعد موافقة الطرفين وجميع المشاركين.")
                        if !state["bridge"]["mine"].bool { NativeAction(title: "أوافق على إشراك الأهل") { try await act("consent", ["connectionId": .string(connectionID), "agree": .bool(true), "consentVersion": .string("family-v1")]) } }
                        else { Button("سحب موافقتي", role: .destructive) { pendingAction = FamilyConfirmation(title: "سحب الموافقة وإغلاق المساحات المشتركة؟", action: "consent", payload: ["connectionId": .string(connectionID), "agree": .bool(false)]) } }
                        if state["bridge"]["enabled"].bool {
                            TextField("اسم المساحة", text: $roomTitle)
                            ForEach(state["bridge"]["participants"].rows) { row in Toggle(row.value["name"].string, isOn: $selected.flag(row.id)) }
                            NativeAction(title: "اقتراح مساحة عائلية") { try await act("create_room", ["connectionId": .string(connectionID), "title": .string(roomTitle), "participantIds": .array(selected.object.filter { $0.value.bool }.keys.sorted().map(JSONValue.string))]); roomTitle = ""; selected = .object([:]) }.disabled(roomTitle.trimmingCharacters(in: .whitespaces).isEmpty)
                        }
                    }
                }
                Section("المساحات") {
                    ForEach(state["rooms"].rows) { row in
                        VStack(alignment: .leading, spacing: 10) {
                            if row.value["canRead"].bool { NavigationLink(row.value["title"].string, destination: NativeFamilyRoom(room: row.value)) } else { Text(row.value["title"].string) }
                            Text(row.value["participants"].array.map { $0["name"].string }.joined(separator: "، ")).font(.caption)
                            if row.value["needsApproval"].bool { roomApproval(row.id, action: "approve_room") }
                            if row.value["needsAcceptance"].bool { roomApproval(row.id, action: "accept_room") }
                            if row.value["canRead"].bool { Button("مغادرة المساحة", role: .destructive) { pendingAction = FamilyConfirmation(title: "مغادرة المساحة؟", action: "leave_room", payload: ["roomId": .string(row.id)]) } }
                            if state["role"].string == "member" && row.value["status"].string != "closed" { Button("إغلاق المساحة", role: .destructive) { pendingAction = FamilyConfirmation(title: "إغلاق المساحة لجميع المشاركين؟", action: "close_room", payload: ["roomId": .string(row.id)]) } }
                        }
                    }
                }
                Section {
                    NativeAction(title: "نسخة من بيانات جسر الأهل") { exported = NativeDataDocument(data: try await store.client.family("export").encoded()); exporting = true }
                    if state["role"].string == "guardian" { Button("حذف حساب الأهل", role: .destructive) { pendingAction = FamilyConfirmation(title: "حذف حساب الأهل وسحب موافقتك؟", action: "delete_family", payload: [:]) } }
                }
            }
        }.navigationTitle("جسر الأهل").task(id: phase) {
            guard phase == .active else { return }
            do { repeat { try await load(); try await Task.sleep(nanoseconds: 5_000_000_000) } while !Task.isCancelled } catch is CancellationError { } catch { store.error = error.localizedDescription }
        }.confirmationDialog(pendingAction?.title ?? "تأكيد", isPresented: Binding(get: { pendingAction != nil }, set: { if !$0 { pendingAction = nil } }), titleVisibility: .visible) {
            if let pendingAction { NativeAction(title: "تأكيد") { try await act(pendingAction.action, pendingAction.payload); self.pendingAction = nil } }
        }.fileExporter(isPresented: $exporting, document: exported, contentType: .json, defaultFilename: "wudayn-family") { result in if case .failure(let error) = result { store.error = error.localizedDescription }; exported = nil }
    }
    private func roomApproval(_ id: String, action: String) -> some View {
        HStack { NativeAction(title: "أوافق على المشاركين") { try await act(action, ["roomId": .string(id), "agree": .bool(true)]) }; NativeAction(title: "أعتذر") { try await act(action, ["roomId": .string(id), "agree": .bool(false)]) } }
    }
    private func act(_ action: String, _ payload: [String: JSONValue]) async throws { _ = try await store.client.family(action, payload); try await load() }
    private func load() async throws { let value = try await store.client.family("state", connectionID.map { ["connectionId": .string($0)] } ?? [:]); try Task.checkCancellation(); state = value }
}
private struct FamilyConfirmation { let title: String; let action: String; let payload: [String: JSONValue] }

struct NativeFamilyRoom: View {
    @EnvironmentObject private var store: NativeStore
    @Environment(\.scenePhase) private var phase
    let room: JSONValue
    @State private var rows: [MemberRow] = []
    @State private var bodyText = ""
    @State private var clientID = UUID().uuidString.lowercased()
    @State private var older = true
    var body: some View {
        List {
            if older { NativeAction(title: "رسائل أقدم") { let page = try await store.client.family("messages", ["roomId": room["id"], "beforeId": rows.first.map { .string($0.id) } ?? .null]).rows; older = page.count == 50; rows = page.filter { item in !rows.contains { $0.id == item.id } } + rows } }
            ForEach(rows) { row in VStack(alignment: .leading, spacing: 8) { Text(row.value["senderName"].string).font(.caption.bold()); Text(row.value["body"].string).textSelection(.enabled); Text(row.value["createdAt"].string.prefix(16)).font(.caption2).foregroundStyle(.secondary) } }
        }.navigationTitle(room["title"].string).safeAreaInset(edge: .bottom) {
            if room["canSend"].bool { HStack { TextField("رسالتك", text: $bodyText, axis: .vertical).lineLimit(1...5).onChange(of: bodyText) { _ in clientID = UUID().uuidString.lowercased() }; NativeAction(title: "إرسال") { let text = bodyText; _ = try await store.client.family("send", ["roomId": room["id"], "body": .string(text), "clientId": .string(clientID)]); if bodyText == text { bodyText = "" }; try await load() }.disabled(bodyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || bodyText.count > 1000) }.padding().background(.regularMaterial) }
        }.task(id: phase) { guard phase == .active else { return }; do { repeat { try await load(); try await Task.sleep(nanoseconds: 3_000_000_000) } while !Task.isCancelled } catch is CancellationError { } catch { store.error = error.localizedDescription } }
    }
    private func load() async throws {
        let page = try await store.client.family("messages", ["roomId": room["id"]]).rows; try Task.checkCancellation()
        if rows.isEmpty { older = page.count == 50 }; rows = rows.filter { item in !page.contains { $0.id == item.id } } + page
        if let last = page.last { _ = try await store.client.family("read", ["roomId": room["id"], "messageId": .string(last.id)]) }
    }
}
