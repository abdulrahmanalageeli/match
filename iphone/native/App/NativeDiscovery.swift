import SwiftUI
import WudaynCore

struct NativeDiscovery: View {
    @EnvironmentObject private var store: NativeStore
    @State private var rows: [MemberRow] = []
    @State private var loading = true
    @State private var query = ""
    @State private var filters: JSONValue = .object(["mode": .string("all")])
    @State private var loadGeneration = UUID()
    @State private var showFilters = false
    @State private var hasMore = true
    @State private var error: String?
    var body: some View {
        List {
            if loading && rows.isEmpty { ProgressView("نبحث عن ترشيحاتك…") }
            if !loading && rows.isEmpty && error == nil { NativeEmpty(title: "لا توجد ترشيحات بهذه الاختيارات حاليًا.") }
            ForEach(rows) { row in NavigationLink { NativePerson(person: row.value, changed: { rows.removeAll { $0.id == row.id }; Task { await load(reset: true) } }) } label: { NativePersonCard(person: row.value) } }
            if hasMore && !rows.isEmpty { Button("المزيد") { Task { await load(reset: false) } }.disabled(loading) }
            if let error { Text(error).foregroundStyle(.red); Button("إعادة المحاولة") { Task { await load(reset: true) } } }
        }.navigationTitle("اكتشاف").searchable(text: $query, prompt: "ابحث في الملفات")
            .onSubmit(of: .search) { Task { await load(reset: true) } }
            .toolbar { Button { showFilters = true } label: { Label("تفضيلات البحث", systemImage: "slider.horizontal.3") } }
            .sheet(isPresented: $showFilters) {
                NavigationStack { NativeDiscoveryFilters(value: $filters).toolbar { Button("تطبيق") { showFilters = false; Task { await load(reset: true) } } } }
            }
            .task { await load(reset: true) }.refreshable { await load(reset: true) }
    }
    private func load(reset: Bool) async {
        let generation = UUID(); loadGeneration = generation
        loading = true; error = nil; defer { if generation == loadGeneration { loading = false } }
        do {
            var options = filters.object.filter { _, value in value != .string("") && value != .number(0) }
            options["search"] = .string(query); options["offset"] = .number(Double(reset ? 0 : rows.count))
            let result = try await store.client.rpc("marriage_browse", ["options": .object(options)])
            try Task.checkCancellation()
            guard generation == loadGeneration else { return }
            let next = result.rows
            rows = reset ? next : rows + next.filter { incoming in !rows.contains { $0.id == incoming.id } }
            hasMore = next.count == 24
        } catch is CancellationError { } catch { if generation == loadGeneration { self.error = error.localizedDescription; if NativeProblem.isAccessDenied(error) { rows = []; hasMore = false } } }
    }
}

struct NativePersonCard: View {
    let person: JSONValue
    var body: some View {
        HStack(spacing: 16) {
            NativePortrait(portrait: person["portrait"]).frame(width: 64, height: 76).clipShape(RoundedRectangle(cornerRadius: 18))
            VStack(alignment: .leading, spacing: 7) {
                Text(person.title).font(.headline)
                Text("\(Int(person["age"].number)) عامًا · \(person["city"].string)").font(.subheadline).foregroundStyle(.secondary)
                Text(person["occupation"].string).font(.caption).foregroundStyle(.secondary)
            }
        }.padding(.vertical, 8)
    }
}

struct NativePortrait: View {
    @EnvironmentObject private var store: NativeStore
    @Environment(\.scenePhase) private var phase
    let portrait: JSONValue
    @State private var image: UIImage?
    var body: some View {
        Group {
            if let image { Image(uiImage: image).resizable().scaledToFill() }
            else { ZStack { NativeTheme.accent.opacity(0.07); Image(systemName: "person.crop.rectangle").foregroundStyle(NativeTheme.accent) } }
        }.clipped().task(id: "\(portrait["id"].string)-\(phase == .active)-\(store.owner ?? "")") {
            image = nil
            guard phase == .active, !portrait["id"].string.isEmpty else { return }
            var loadedPath = ""
            while !Task.isCancelled {
                do {
                    let current = try await store.client.rpc("marriage_portrait_view", ["photo_id": portrait["id"]])
                    try Task.checkCancellation()
                    let path = current["path"].string
                    guard !path.isEmpty else { image = nil; return }
                    if path != loadedPath {
                        image = nil
                        let data = try await store.client.download(bucket: "nisfayn-profile-portraits", path: path)
                        try Task.checkCancellation(); guard phase == .active else { return }
                        image = UIImage(data: data); loadedPath = path
                    }
                } catch is CancellationError { return } catch { image = nil; loadedPath = "" }
                do { try await Task.sleep(nanoseconds: 5_000_000_000) } catch { return }
            }
        }.onDisappear { image = nil }
    }
}

struct NativePerson: View {
    @EnvironmentObject private var store: NativeStore
    let person: JSONValue
    var preview = false
    var changed: () -> Void = {}
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var phase
    @State private var visible = false
    @State private var requested = false
    @State private var report = false
    var body: some View {
        List {
          if preview || (visible && phase == .active) {
            NativePersonCard(person: person)
            NavigationLink("صور الملف", destination: NativePublicGallery(subject: person["id"].string))
            if !person["fit"].isNull { NavigationLink("قراءة التوافق", destination: NativeCompatibility(fit: person["fit"])) }
            ForEach([("نبذة عني", "bio"), ("شريك الحياة", "lookingFor"), ("ما يهمني", "valuesStatement"), ("حياتنا معًا", "lifeTogether")], id: \.1) { title, key in
                if !person[key].string.isEmpty { Section(title) { Text(person[key].string) } }
            }
            if !person["interests"].array.isEmpty { Section("الاهتمامات") { Text(person["interests"].array.map(\.string).joined(separator: " · ")) } }
            if !person["reasons"].array.isEmpty { Section("نقاط التقارب") { ForEach(person["reasons"].array.map(\.string), id: \.self) { Text($0) } } }
            if !preview { Section {
                if person["connectionStatus"].string == "accepted", !person["connectionId"].string.isEmpty {
                    NavigationLink(NativeCatalog.copy("openChat"), destination: NativeChat(connection: .object(["id": person["connectionId"], "person": person, "status": .string("accepted")])))
                } else {
                    NativeAction(title: requested || person["connectionStatus"].string == "pending" ? "أُرسل الطلب" : NativeCatalog.copy("request")) { _ = try await store.client.rpc("marriage_request", ["member_id": person["id"]]); requested = true }.disabled(requested || person["connectionStatus"].string == "pending")
                }
                NativeAction(title: NativeCatalog.copy("showInterest")) { _ = try await store.client.rpc("marriage_discovery_action", ["member_id": person["id"], "action": .string("interest")]) }
                NativeAction(title: "إخفاء من الترشيحات") { _ = try await store.client.rpc("marriage_discovery_action", ["member_id": person["id"], "action": .string("dismiss")]); changed(); dismiss() }
                NativeAction(title: NativeCatalog.copy("block")) { _ = try await store.client.rpc("marriage_discovery_action", ["member_id": person["id"], "action": .string("block")]); changed(); dismiss() }
                Button(NativeCatalog.copy("reportBlock"), role: .destructive) { report = true }
            } }
          } else { ProgressView() }
        }.navigationTitle(preview || visible ? person.title : "").navigationBarTitleDisplayMode(.inline)
            .sheet(isPresented: $report) { NavigationStack { NativeIncidentReport(subjectID: person["id"].string) } }
            .task(id: phase) {
                visible = false
                guard !preview, phase == .active else { return }
                var first = true
                while !Task.isCancelled {
                    do {
                        let allowed = try await store.client.rpc("marriage_profile_visible", ["subject": person["id"]])
                        try Task.checkCancellation()
                        guard allowed.bool else { visible = false; changed(); dismiss(); return }
                        visible = true
                        if first { first = false; _ = try? await store.client.rpc("marriage_note_profile_open", ["candidate_id": person["id"]]) }
                        try await Task.sleep(nanoseconds: 8_000_000_000)
                    } catch is CancellationError { return }
                    catch { visible = false; dismiss(); return }
                }
            }
    }
}

struct NativeInbox: View {
    @EnvironmentObject private var store: NativeStore
    @Environment(\.scenePhase) private var phase
    @State private var rows: [MemberRow] = []
    @State private var loading = true
    @State private var error: String?
    @State private var loadGeneration = UUID()
    var body: some View {
        List {
            if loading { ProgressView() }
            if !loading && rows.isEmpty && error == nil { NativeEmpty(title: NativeCatalog.copy("requestsEmpty")) }
            ForEach(rows) { row in
                if row.value["status"].string == "accepted" {
                    NavigationLink { NativeChat(connection: row.value) } label: { NativePersonCard(person: row.value["person"]) }
                } else {
                    VStack(alignment: .leading, spacing: 12) {
                        NavigationLink { NativePerson(person: row.value["person"]) } label: { NativePersonCard(person: row.value["person"]) }
                        ViewThatFits(in: .horizontal) {
                            HStack { requestActions(row) }
                            VStack(alignment: .leading) { requestActions(row) }
                        }.buttonStyle(.bordered)
                    }
                }
            }
            if let error { Text(error).foregroundStyle(.red) }
            NavigationLink("الطلبات السابقة", destination: NativeHistory())
        }.navigationTitle("التعارفات").refreshable { await load() }.task(id: phase) {
            guard phase == .active else { return }
            while !Task.isCancelled { await load(); do { try await Task.sleep(nanoseconds: 8_000_000_000) } catch { return } }
        }
    }
    @ViewBuilder private func requestActions(_ row: MemberRow) -> some View {
        if row.value["direction"].string == "incoming" {
            NativeAction(title: NativeCatalog.copy("acceptRequest")) { try await act(row.id, "accept") }.accessibilityIdentifier("match.accept")
            NativeAction(title: NativeCatalog.copy("block")) { try await act(row.id, "block") }
            NativeAction(title: NativeCatalog.copy("declineRequest")) { try await act(row.id, "decline") }
        } else { NativeAction(title: NativeCatalog.copy("cancelRequest")) { _ = try await store.client.rpc("marriage_cancel", ["request_id": .string(row.id), "allow_rematch": .bool(false)]); await load() } }
    }
    private func act(_ id: String, _ action: String) async throws { _ = try await store.client.rpc("marriage_act", ["request_id": .string(id), "action": .string(action)]); await load() }
    private func load() async {
        let generation = UUID(); loadGeneration = generation
        defer { if loadGeneration == generation { loading = false } }
        do { let result = try await store.client.rpc("marriage_inbox"); try Task.checkCancellation(); guard loadGeneration == generation else { return }; rows = result.rows.filter { ["accepted", "pending"].contains($0.value["status"].string) }; error = nil }
        catch is CancellationError {} catch { if loadGeneration == generation { self.error = error.localizedDescription; if NativeProblem.isAccessDenied(error) { rows = [] } } }
    }
}

struct NativeIncidentReport: View {
    @EnvironmentObject private var store: NativeStore
    @Environment(\.dismiss) private var dismiss
    var requestID: String? = nil
    var subjectID: String? = nil
    var messageID: String? = nil
    @State private var category = "إساءة أو ضغط غير مرغوب"
    @State private var note = ""
    @State private var submission = UUID().uuidString.lowercased()
    @State private var sent = false

    var body: some View {
        Form {
            if sent {
                Text("وصل بلاغك إلى فريق المراجعة وتم حظر العضو.")
                Button("تم") { dismiss() }
            } else {
                Picker("سبب البلاغ", selection: $category) {
                    ForEach(["إساءة أو ضغط غير مرغوب", "تهديد فوري للسلامة", "انتهاك الخصوصية", "انتحال أو احتيال", "سبب آخر"], id: \.self) { Text($0) }
                }
                TextField("تفاصيل إضافية (اختياري)", text: $note, axis: .vertical)
                if messageID != nil {
                    Text("يُرفق نص هذه الرسالة أو نوع المرفق فقط لمدة ٣٠ يومًا. يمكن لمالك المنصة أو المشرف المكلّف بالبلاغ مراجعته.")
                }
                NativeAction(title: NativeCatalog.copy("sendReportBlock")) {
                    let reason = JSONValue.string(category + (note.isEmpty ? "" : " — " + note))
                    if let requestID {
                        _ = try await store.client.rpc("marriage_report_incident", ["request_id": .string(requestID), "message_id": messageID.map(JSONValue.string) ?? .null, "reason": reason, "submission_id": .string(submission)])
                    } else if let subjectID {
                        _ = try await store.client.rpc("marriage_discovery_action", ["member_id": .string(subjectID), "action": .string("report"), "reason": reason])
                    } else { throw NativeProblem.invalidResponse }
                    sent = true
                }.disabled(note.count > 450)
            }
        }.navigationTitle(NativeCatalog.copy("reportBlock")).toolbar { Button("إغلاق") { dismiss() } }
    }
}

struct NativeHistory: View {
    @State private var cursor: String?
    @State private var loading = true
    @State private var selected: MemberRow?
    @EnvironmentObject private var store: NativeStore
    @State private var rows: [MemberRow] = []
    @State private var error: String?
    var body: some View { List {
        ForEach(rows) { row in VStack(alignment: .leading) { Text(row.value["alias"].string); Text(row.value["outcome"].string == "expired" ? "انتهت المهلة" : "تعارف مغلق").foregroundStyle(.secondary); Button("الإبلاغ عن واقعة") { selected = row } } }
        if loading { ProgressView() }
        else if rows.isEmpty { NativeEmpty(title: "لا توجد طلبات سابقة.") }
        if rows.count == 50 { Button("طلبات أقدم") { cursor = rows.last?.id } }
        if cursor != nil { Button("العودة إلى أحدث الطلبات") { cursor = nil } }
    }.sheet(item: $selected) { row in NavigationStack { NativeIncidentReport(requestID: row.id) } }.navigationTitle("الطلبات السابقة").nativeError($error).task(id: cursor) {
        rows = []; loading = true
        do {
            let page: JSONValue
            if let cursor { page = try await store.client.rpc("marriage_request_history_page", ["before_id": .string(cursor)]) }
            else { page = try await store.client.rpc("marriage_request_history") }
            try Task.checkCancellation(); rows = page.rows; loading = false
        } catch is CancellationError {} catch { loading = false; self.error = error.localizedDescription }
    } }
}

struct NativeActivity: View {
    @Environment(\.scenePhase) private var phase
    @EnvironmentObject private var store: NativeStore
    @State private var rows: [MemberRow] = []
    @State private var error: String?
    var body: some View { List {
        ForEach(rows) { row in NavigationLink { NativePerson(person: row.value["person"]) } label: {
            VStack(alignment: .leading) { Text(row.value["person"].title); Text(row.value["kind"].string == "interest" ? NativeCatalog.copy("interest") : row.value["kind"].string == "profile_visit" ? NativeCatalog.copy("visit") : "تحديث في التعارف").foregroundStyle(.secondary) }
        }.task { _ = try? await store.client.rpc("marriage_notifications_read", ["notification_ids": .array([row.value["id"]])]) } }
        if rows.isEmpty { NativeEmpty(title: "لا توجد إشعارات جديدة.", icon: "bell") }
    }.navigationTitle("الإشعارات").nativeError($error).task(id: phase) {
        guard phase == .active else { rows = []; return }
        while !Task.isCancelled { await load(); do { try await Task.sleep(nanoseconds: 8_000_000_000) } catch { return } }
    }.refreshable { await load() } }
    private func load() async { do { let result = try await store.client.rpc("marriage_notifications"); try Task.checkCancellation(); rows = result.rows } catch is CancellationError {} catch { rows = []; self.error = error.localizedDescription } }
}
