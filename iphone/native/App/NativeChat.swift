import SwiftUI
import PhotosUI
import WudaynCore

struct NativeChat: View {
    @EnvironmentObject private var store: NativeStore
    @Environment(\.scenePhase) private var phase
    let connection: JSONValue
    @State private var messages: [MemberRow] = []
    @State private var agreement: JSONValue = .null
    @State private var text = ""
    @State private var pendingID = UUID().uuidString.lowercased()
    @State private var reply: MemberRow?
    @State private var sending = false
    @State private var error: String?
    @State private var sendError: String?
    @State private var selectedPhoto: PhotosPickerItem?
    @State private var photoDraft: Data?
    @State private var once = false
    @State private var controls = false
    @State private var older = true
    @State private var reading = false
    @State private var mediaEpoch = UUID()
    @StateObject private var audio = NativeVoiceNote()
    @FocusState private var composerFocused: Bool
    private var requestID: String { connection["id"].string }
    private var allowed: Bool {
        if agreement["status"].string == "family" { return true }
        guard agreement["status"].string == "accepted", let deadline = NativeDates.parse(agreement["deadline"].string) else { return false }
        return deadline > Date()
    }
    var body: some View {
        VStack(spacing: 0) {
            NativeAgreement(requestID: requestID, agreement: $agreement)
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 14) {
                        if older && !messages.isEmpty { Button("رسائل أقدم") { Task { await load(olderPage: true) } }.disabled(reading) }
                        ForEach(messages) { row in
                            NativeMessage(row: row, requestID: requestID, reply: { reply = row })
                                .id(row.id).onAppear {
                                    if row.id == messages.last?.id, phase == .active { Task { _ = try? await store.client.rpc("marriage_mark_thread_read", ["request_id": .string(requestID), "through_id": .string(row.id)]) } }
                                }
                        }
                    }.padding()
                }.onChange(of: sending) { value in if !value, let last = messages.last { withAnimation { proxy.scrollTo(last.id, anchor: .bottom) } } }
            }
            if let error { Text(error).font(.footnote).foregroundStyle(.red).padding(.horizontal) }
            if let sendError { Text(sendError).font(.footnote).foregroundStyle(.red).padding(.horizontal) }
            if messages.isEmpty && allowed && text.isEmpty {
                Text("يقرأ الطرف الآخر ما ترسله. مشاركة رقمك اختيارية، ويمكنك إنهاء التعارف أو الحظر من الخيارات.").font(.footnote)
                NativeAction(title: "اقتراح لبداية الحديث") {
                    let result = try await store.client.service(.ai, body: .object(["mode": .string("opener")]))
                    let suggestion = String(result["text"].string.prefix(1000))
                    guard !suggestion.isEmpty else { throw NativeProblem.invalidResponse }; text = suggestion
                }.font(.footnote)
            }
            if let reply { HStack { Text("ردًا على: " + reply.value["body"].string).lineLimit(1); Spacer(); Button("إلغاء الرد") { self.reply = nil } }.font(.caption).padding() }
            if let photoDraft, let image = UIImage(data: photoDraft) {
                Text("يمكن للطرف الآخر الاحتفاظ بنسخة أو تصوير الشاشة بجهاز آخر، حتى مع العرض لمرة واحدة.").font(.footnote)
                HStack { Image(uiImage: image).resizable().scaledToFit().frame(height: 80); Toggle("عرض لمرة واحدة", isOn: $once); Button("إزالة", role: .destructive) { self.photoDraft = nil } }.padding().disabled(sending)
            }
            if audio.recording { HStack { Text("تسجيل · \(Int(audio.seconds)) ثانية"); Button("إيقاف") { do { try audio.stop() } catch { self.error = error.localizedDescription } }; Button("إلغاء") { audio.discard() } }.padding() }
            if let draft = audio.draft { HStack { Button("معاينة التسجيل") { do { try audio.play(draft) } catch { self.error = error.localizedDescription } }; Text("\(Int(audio.seconds)) ثانية"); Button("حذف") { audio.discard() } }.padding().disabled(sending) }
            HStack(alignment: .bottom, spacing: 12) {
                PhotosPicker(selection: $selectedPhoto, matching: .images, photoLibrary: .shared()) { Image(systemName: "photo.badge.plus").font(.title3) }.accessibilityLabel("إرفاق صورة")
                Button { Task { do { try await audio.start() } catch { self.error = error.localizedDescription } } } label: { Image(systemName: "mic").font(.title3) }.accessibilityLabel("تسجيل رسالة صوتية").disabled(audio.recording || photoDraft != nil)
                TextField("رسالتك", text: $text, axis: .vertical).lineLimit(1...5).textFieldStyle(.roundedBorder).focused($composerFocused).accessibilityIdentifier("chat.composer").onChange(of: text) { _ in pendingID = UUID().uuidString.lowercased() }
                Button { Task { await send() } } label: { if sending { ProgressView() } else { Image(systemName: "arrow.up.circle.fill").font(.title) } }.accessibilityLabel("إرسال").accessibilityIdentifier("chat.send").disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && photoDraft == nil && audio.draft == nil)
            }.padding().disabled(!allowed || sending || store.busy)
        }.navigationTitle(connection["person"].title).navigationBarTitleDisplayMode(.inline)
            .toolbar { Button { controls = true } label: { Image(systemName: "ellipsis.circle") }.accessibilityLabel("خيارات التعارف") }
            .toolbar { ToolbarItemGroup(placement: .keyboard) { Spacer(); Button("تم") { composerFocused = false }.accessibilityIdentifier("keyboard.dismiss") } }
            .sheet(isPresented: $controls) { NavigationStack { NativeConnectionOptions(connection: connection) } }
            .onChange(of: reply?.id) { _ in pendingID = UUID().uuidString.lowercased() }
            .onChange(of: once) { _ in pendingID = UUID().uuidString.lowercased() }
            .onChange(of: audio.draft) { _ in pendingID = UUID().uuidString.lowercased() }
            .onChange(of: photoDraft) { _ in pendingID = UUID().uuidString.lowercased() }
            .onChange(of: selectedPhoto) { item in let epoch = mediaEpoch; Task {
                do { if let data = try await item?.loadTransferable(type: Data.self) { guard selectedPhoto == item, mediaEpoch == epoch, phase == .active else { return }; photoDraft = try NativeImages.prepare(data); audio.discard() } }
                catch { self.error = error.localizedDescription }
            } }
            .task(id: phase) {
                guard phase == .active else { mediaEpoch = UUID(); audio.discard(); photoDraft = nil; selectedPhoto = nil; return }
                while !Task.isCancelled { await load(); do { try await Task.sleep(nanoseconds: 3_000_000_000) } catch { return } }
            }.onDisappear { mediaEpoch = UUID(); audio.discard(); photoDraft = nil; selectedPhoto = nil }
    }
    private func load(olderPage: Bool = false) async {
        guard !reading, phase == .active else { return }
        reading = true; defer { reading = false }
        do {
            async let consent = store.client.rpc("marriage_agreement", ["request_id": .string(requestID)])
            let target = ChatSnapshot.pageTarget(loadedCount: messages.count, older: olderPage)
            var snapshot: [MemberRow] = [], hasMore = true
            repeat {
                let page = try await store.client.rpc("marriage_thread_page", ["request_id": .string(requestID), "before_id": ChatSnapshot.cursor(snapshot)]).rows
                try Task.checkCancellation()
                let next = ChatSnapshot.prepend(page, to: snapshot)
                hasMore = page.count == 50 && next.count > snapshot.count
                snapshot = next
            } while hasMore && snapshot.count < target
            let currentAgreement = try await consent
            try Task.checkCancellation()
            agreement = currentAgreement
            messages = snapshot; older = hasMore
            if let reply, !messages.contains(where: { $0.id == reply.id && $0.value["deletedAt"].isNull }) { self.reply = nil }
            error = nil
        } catch is CancellationError {} catch {
            if NativeProblem.isAccessDenied(error) { clearPrivateContent() }
            self.error = error.localizedDescription
        }
    }
    private func clearPrivateContent() {
        messages = []; agreement = .null; reply = nil; text = ""; photoDraft = nil; selectedPhoto = nil
        sendError = nil
        mediaEpoch = UUID(); audio.discard()
    }
    private func send() async {
        guard allowed, !sending, !audio.recording else { return }
        sending = true; sendError = nil; defer { sending = false }
        do {
            if let data = photoDraft { try await store.client.uploadMedia(requestID: requestID, clientID: pendingID, data: data, mime: "image/jpeg", once: once) }
            else if let data = audio.draft { try await store.client.uploadMedia(requestID: requestID, clientID: pendingID, data: data, mime: "audio/mp4", once: false, duration: audio.seconds) }
            else {
                let body = text.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !body.isEmpty, body.count <= 1000 else { throw NativeProblem.message("اكتب رسالة من ١ إلى ١٠٠٠ حرف.") }
                var params: [String: JSONValue] = ["request_id": .string(requestID), "message_body": .string(body), "client_id": .string(pendingID)]
                if let reply { params["reply_to_id"] = .string(reply.id) }
                _ = try await store.client.rpc(reply == nil ? "marriage_message" : "marriage_reply", params)
            }
            text = ""; photoDraft = nil; selectedPhoto = nil; reply = nil; audio.discard(); once = false
            pendingID = UUID().uuidString.lowercased(); await load()
        } catch { if NativeProblem.isAccessDenied(error) { clearPrivateContent() }; sendError = error.localizedDescription }
    }
}

struct NativeMessage: View {
    @EnvironmentObject private var store: NativeStore
    @Environment(\.scenePhase) private var phase
    let row: MemberRow
    let requestID: String
    let reply: (() -> Void)?
    @State private var photo: NativeImagePresentation?
    @State private var spent = false
    @State private var loading = false
    @State private var error: String?
    @StateObject private var audio = NativeVoiceNote()
    @State private var visible = false
    @State private var showReport = false
    private var message: JSONValue { row.value }
    private var attachment: JSONValue { message["attachment"] }
    var body: some View {
        HStack {
            if !message["senderIsMe"].bool { Spacer(minLength: 36) }
            VStack(alignment: .leading, spacing: 8) {
                if !message["reply"].isNull { Text(message["reply"]["body"].string).font(.caption).foregroundStyle(.secondary).lineLimit(2) }
                if !message["deletedAt"].isNull { Text("تم حذف هذه الرسالة").italic() }
                else if !attachment.isNull {
                    Button { Task { await open() } } label: {
                        Label(attachment["kind"].string == "audio" ? (audio.playing ? "إيقاف مؤقت" : "رسالة صوتية") : attachment["viewOnce"].bool ? (spent || !attachment["openedAt"].isNull ? "تم فتح الصورة" : "صورة لمرة واحدة") : "عرض الصورة", systemImage: attachment["kind"].string == "audio" ? "waveform" : "photo")
                    }.disabled(loading || attachment["viewOnce"].bool && (spent || !attachment["openedAt"].isNull || message["senderIsMe"].bool))
                } else { Text(message["body"].string).textSelection(.enabled) }
                HStack { Text(message["createdAt"].string.prefix(16).replacingOccurrences(of: "T", with: " ")).font(.caption2).foregroundStyle(.secondary); if !message["readAt"].isNull { Image(systemName: "checkmark.circle.fill").font(.caption2) } }
                if !message["reactions"].array.isEmpty {
                    HStack { ForEach(Array(message["reactions"].array.enumerated()), id: \.offset) { _, reaction in
                        NativeAction(title: "\(reaction["emoji"].string) \(Int(reaction["count"].number))") { _ = try await store.client.rpc("marriage_react_to_message", ["request_id": .string(requestID), "message_id": .string(row.id), "reaction": reaction["mine"].bool ? .null : reaction["emoji"]]) }
                    } }.font(.caption)
                }
            }.padding(12).background(message["senderIsMe"].bool ? NativeTheme.accent.opacity(0.10) : Color.gray.opacity(0.08)).clipShape(RoundedRectangle(cornerRadius: 16))
                .contextMenu {
                    if !message["senderIsMe"].bool { Button("الإبلاغ عن هذه الرسالة", role: .destructive) { showReport = true } }
                    if message["deletedAt"].isNull {
                        if let reply { Button("رد", action: reply) }
                        ForEach(["❤️", "😂", "😮", "😢", "🙏", "👍"], id: \.self) { emoji in NativeAction(title: emoji) { _ = try await store.client.rpc("marriage_react_to_message", ["request_id": .string(requestID), "message_id": .string(row.id), "reaction": .string(emoji)]) } }
                        if message["senderIsMe"].bool { NativeAction(title: "حذف الرسالة") { _ = try await store.client.rpc("marriage_delete_message", ["request_id": .string(requestID), "message_id": .string(row.id)]) } }
                    }
                }
            if message["senderIsMe"].bool { Spacer(minLength: 36) }
        }.sheet(isPresented: $showReport) { NavigationStack { NativeIncidentReport(requestID: requestID, messageID: row.id) } }
            .fullScreenCover(item: $photo) { NativePhotoScreen(photo: $0) }.nativeError($error)
            .onChange(of: message["deletedAt"]) { value in if !value.isNull { photo = nil; audio.discard() } }
            .onChange(of: attachment) { value in if value.isNull { photo = nil; audio.discard() } }
            .onChange(of: phase) { if $0 != .active { photo = nil; audio.discard() } }
            .onAppear { visible = true }
            .onDisappear { visible = false; audio.discard() }
    }
    private func open() async {
        if audio.playing { audio.pause(); return }
        guard !loading, phase == .active, visible, NisfaynPrivacy.shared.mayOpen, message["deletedAt"].isNull else { return }
        let owner = store.owner, mediaID = attachment["id"].string
        loading = true; defer { loading = false }
        do {
            let once = attachment["viewOnce"].bool
            if once && !PrivatePhotoController.canDisplay() { throw NativeProblem.message("أوقف تسجيل الشاشة أو مشاركتها لفتح الصورة المحمية.") }
            if once && (spent || !attachment["openedAt"].isNull || message["senderIsMe"].bool) { return }
            // A lost response may follow successful consumption; never replay it.
            if once { spent = true }
            let data = try await store.client.media(requestID: requestID, mediaID: mediaID, once: once)
            guard store.owner == owner, phase == .active, visible, NisfaynPrivacy.shared.mayOpen, message["deletedAt"].isNull, attachment["id"].string == mediaID else { return }
            if attachment["kind"].string == "audio" { try audio.play(data) }
            else if let image = UIImage(data: data) { photo = NativeImagePresentation(image: image, once: once) }
            else { throw NativeProblem.invalidResponse }
        } catch { self.error = error.localizedDescription }
    }
}

struct NativeAgreement: View {
    @EnvironmentObject private var store: NativeStore
    let requestID: String
    @Binding var agreement: JSONValue
    @State private var signed = false
    @State private var days = 14
    var body: some View {
        DisclosureGroup(agreement["status"].string == "family" ? "اتفقتما على التواصل مع الأهل" : NativeCatalog.copy("agreementTitle")) {
            Text("نتفق على مدة للتعارف الجاد، مع احترام الخصوصية وحق كل طرف في التوقف.").font(.footnote)
            if ["accepted", "expired"].contains(agreement["status"].string) {
                Text("موعد المراجعة: \(NativeDates.display(agreement["deadline"].string))").font(.caption)
                if agreement["extension"].isNull { NativeAction(title: "اقتراح أسبوع إضافي") { try await act("extend", ["days": .number(7)]) } }
                else if agreement["extension"]["actor"] != agreement["actor"] { NativeAction(title: "الموافقة على التمديد") { try await act("extension_accept", ["proposalId": agreement["extension"]["id"]]) } }
                else { Text("التمديد بانتظار موافقة الطرف الآخر.") }
                Toggle("أؤكد رغبتي في التواصل مع الأهل", isOn: $signed)
                NativeAction(title: NativeCatalog.copy("agreeFamily")) { try await act("family", ["confirmed": .bool(true)]) }.disabled(!signed || agreement["familyAgreed"][agreement["actor"].string].bool)
            } else if agreement["status"].string != "family" && !agreement.isNull {
                if agreement["actor"].string == "reham" {
                    Picker("المدة", selection: $days) { ForEach([7, 14, 30], id: \.self) { value in Text(NativeCatalog.memberCopy["days"][String(value)].string).tag(value) } }
                } else { Text(agreement["status"].string == "proposed" ? "المدة المقترحة: \(NativeCatalog.memberCopy["days"][String(Int(agreement["days"].number))].string)" : "بانتظار اقتراح الطرف الآخر.") }
                if agreement["actor"].string == "reham" || agreement["status"].string == "proposed" {
                    Toggle(NativeCatalog.copy("agreementConsent"), isOn: $signed)
                    let propose = agreement["actor"].string == "reham"
                    let action = propose ? (agreement["status"].string == "proposed" ? "updateDuration" : "proposeDuration") : "acceptDuration"
                    NativeAction(title: NativeCatalog.copy(action)) {
                        try await act(propose ? "propose" : "accept", propose ? ["days": .number(Double(days)), "signed": .bool(true)] : ["proposalId": agreement["proposalId"], "signed": .bool(true)])
                    }.disabled(!signed)
                }
            }
        }.padding().background(NativeTheme.accent.opacity(0.04))
            .onAppear { syncProposal() }
            .onChange(of: agreement["proposalId"].string) { _ in syncProposal() }
            .onChange(of: days) { _ in signed = false }
    }
    private func syncProposal() {
        signed = false
        if agreement["days"].number > 0 { days = Int(agreement["days"].number) }
    }
    private func act(_ action: String, _ payload: [String: JSONValue]) async throws { agreement = try await store.client.rpc("marriage_agreement", ["request_id": .string(requestID), "action": .string(action), "payload": .object(payload)]); signed = false }
}

struct NativeConnectionOptions: View {
    @EnvironmentObject private var store: NativeStore
    @Environment(\.dismiss) private var dismiss
    let connection: JSONValue
    @State private var allowRematch = false
    @State private var confirm = false
    @State private var report = false
    var body: some View {
        Form {
            NavigationLink("الملف الشخصي", destination: NativePerson(person: connection["person"]))
            NavigationLink("خطوات التعارف", destination: NativeJourney(connectionID: connection["id"].string))
            NavigationLink("جسر الأهل", destination: NativeFamily(connectionID: connection["id"].string))
            NavigationLink("المكالمات", destination: NativeCalls(connectionID: connection["id"].string))
            NavigationLink("مشاركة الصور الخاصة", destination: NativeSharedPhotos(connectionID: connection["id"].string))
            NavigationLink("البحث والمرفقات", destination: NativeChatLibrary(requestID: connection["id"].string))
            Section("إنهاء التعارف") {
                Toggle("السماح بالتعارف مجددًا", isOn: $allowRematch)
                Button("إنهاء التعارف", role: .destructive) { confirm = true }
                NativeAction(title: NativeCatalog.copy("block")) { _ = try await store.client.rpc("marriage_act", ["request_id": connection["id"], "action": .string("block")]); dismiss() }
                Button(NativeCatalog.copy("reportBlock"), role: .destructive) { report = true }
            }
        }.navigationTitle("خيارات التعارف").toolbar { Button("إغلاق") { dismiss() } }
            .confirmationDialog("إنهاء هذا التعارف؟", isPresented: $confirm, titleVisibility: .visible) {
                NativeAction(title: "تأكيد إنهاء التعارف") { _ = try await store.client.rpc("marriage_cancel", ["request_id": connection["id"], "allow_rematch": .bool(allowRematch)]); dismiss() }
            }.sheet(isPresented: $report) { NavigationStack { NativeIncidentReport(requestID: connection["id"].string) } }
    }
}
