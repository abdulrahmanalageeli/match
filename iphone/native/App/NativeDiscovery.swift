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
            if !loading && rows.isEmpty { NativeEmpty(title: "لا توجد ترشيحات بهذه الاختيارات حاليًا.") }
            ForEach(rows) { row in NavigationLink { NativePerson(person: row.value) } label: { NativePersonCard(person: row.value) } }
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
            hasMore = !next.isEmpty
        } catch is CancellationError { } catch { if generation == loadGeneration { self.error = error.localizedDescription } }
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
    let portrait: JSONValue
    @State private var image: UIImage?
    var body: some View {
        Group {
            if let image { Image(uiImage: image).resizable().scaledToFill() }
            else { ZStack { NativeTheme.accent.opacity(0.07); Image(systemName: "person.crop.rectangle").foregroundStyle(NativeTheme.accent) } }
        }.clipped().task(id: portrait["id"].string) {
            image = nil
            guard !portrait["id"].string.isEmpty else { return }
            do {
                let current = try await store.client.rpc("marriage_portrait_view", ["photo_id": portrait["id"]])
                guard !current["path"].string.isEmpty else { return }
                let data = try await store.client.download(bucket: "nisfayn-profile-portraits", path: current["path"].string)
                try Task.checkCancellation(); image = UIImage(data: data)
            } catch { image = nil }
        }
    }
}

struct NativePerson: View {
    @EnvironmentObject private var store: NativeStore
    let person: JSONValue
    var preview = false
    @State private var requested = false
    @State private var report = false
    @State private var reason = ""
    var body: some View {
        List {
            NativePersonCard(person: person)
            NavigationLink("صور الملف", destination: NativePublicGallery(subject: person["id"].string))
            if !person["fit"].isNull { NavigationLink("قراءة التوافق", destination: NativeCompatibility(fit: person["fit"])) }
            ForEach([("نبذة عني", "bio"), ("شريك الحياة", "lookingFor"), ("ما يهمني", "valuesStatement"), ("حياتنا معًا", "lifeTogether")], id: \.1) { title, key in
                if !person[key].string.isEmpty { Section(title) { Text(person[key].string) } }
            }
            if !person["interests"].array.isEmpty { Section("الاهتمامات") { Text(person["interests"].array.map(\.string).joined(separator: " · ")) } }
            if !person["reasons"].array.isEmpty { Section("نقاط التقارب") { ForEach(person["reasons"].array.map(\.string), id: \.self) { Text($0) } } }
            if !preview { Section {
                NativeAction(title: requested ? "أُرسل الطلب" : "طلب تعارف") { _ = try await store.client.rpc("marriage_request", ["member_id": person["id"]]); requested = true }.disabled(requested)
                NativeAction(title: "إبداء الاهتمام") { _ = try await store.client.rpc("marriage_discovery_action", ["member_id": person["id"], "action": .string("interest")]) }
                NativeAction(title: "إخفاء من الترشيحات") { _ = try await store.client.rpc("marriage_discovery_action", ["member_id": person["id"], "action": .string("dismiss")]) }
                Button("إبلاغ وحظر", role: .destructive) { report = true }
            } }
        }.navigationTitle(person.title).navigationBarTitleDisplayMode(.inline)
            .alert("إبلاغ وحظر", isPresented: $report) {
                TextField("سبب البلاغ", text: $reason)
                Button("إلغاء", role: .cancel) {}
                Button("إرسال البلاغ والحظر", role: .destructive) { Task { await store.perform { _ = try await store.client.rpc("marriage_discovery_action", ["member_id": person["id"], "action": .string("report"), "reason": .string(reason)]) } } }
            } message: { Text("لن يظهر لك هذا الشخص بعد الحظر.") }
            .task { if !preview { _ = try? await store.client.rpc("marriage_note_profile_open", ["candidate_id": person["id"]]) } }
    }
}

struct NativeInbox: View {
    @EnvironmentObject private var store: NativeStore
    @Environment(\.scenePhase) private var phase
    @State private var rows: [MemberRow] = []
    @State private var loading = true
    @State private var error: String?
    var body: some View {
        List {
            if loading { ProgressView() }
            if !loading && rows.isEmpty { NativeEmpty(title: "تبدأ هنا تعارفاتك المتبادلة.") }
            ForEach(rows) { row in
                if row.value["status"].string == "accepted" {
                    NavigationLink { NativeChat(connection: row.value) } label: { NativePersonCard(person: row.value["person"]) }
                } else {
                    VStack(alignment: .leading, spacing: 12) {
                        NavigationLink { NativePerson(person: row.value["person"]) } label: { NativePersonCard(person: row.value["person"]) }
                        HStack {
                            if row.value["direction"].string == "incoming" {
                                NativeAction(title: "قبول") { try await act(row.id, "accept") }
                                NativeAction(title: "اعتذار") { try await act(row.id, "decline") }
                            } else { NativeAction(title: "إلغاء الطلب") { _ = try await store.client.rpc("marriage_cancel", ["request_id": .string(row.id), "allow_rematch": .bool(true)]); await load() } }
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
    private func act(_ id: String, _ action: String) async throws { _ = try await store.client.rpc("marriage_act", ["request_id": .string(id), "action": .string(action)]); await load() }
    private func load() async {
        defer { loading = false }
        do { let result = try await store.client.rpc("marriage_inbox"); try Task.checkCancellation(); rows = result.rows; error = nil }
        catch is CancellationError {} catch { self.error = error.localizedDescription }
    }
}

struct NativeHistory: View {
    @EnvironmentObject private var store: NativeStore
    @State private var rows: [MemberRow] = []
    @State private var error: String?
    var body: some View { List {
        ForEach(rows) { row in VStack(alignment: .leading) { Text(row.value["alias"].string); Text(row.value["outcome"].string == "expired" ? "انتهت المهلة" : "تعارف مغلق").foregroundStyle(.secondary) } }
        if rows.isEmpty { NativeEmpty(title: "لا توجد طلبات سابقة.") }
    }.navigationTitle("الطلبات السابقة").nativeError($error).task { do { rows = try await store.client.rpc("marriage_request_history").rows } catch { self.error = error.localizedDescription } } }
}

struct NativeActivity: View {
    @EnvironmentObject private var store: NativeStore
    @State private var rows: [MemberRow] = []
    @State private var error: String?
    var body: some View { List {
        ForEach(rows) { row in NavigationLink { NativePerson(person: row.value["person"]) } label: {
            VStack(alignment: .leading) { Text(row.value["person"].title); Text(row.value["kind"].string == "interest" ? "أبدى اهتمامًا بملفك" : row.value["kind"].string == "profile_visit" ? "زار ملفك" : "تحديث في التعارف").foregroundStyle(.secondary) }
        }.task { _ = try? await store.client.rpc("marriage_notifications_read", ["notification_ids": .array([row.value["id"]])]) } }
        if rows.isEmpty { NativeEmpty(title: "لا توجد إشعارات جديدة.", icon: "bell") }
    }.navigationTitle("الإشعارات").nativeError($error).task { await load() }.refreshable { await load() } }
    private func load() async { do { rows = try await store.client.rpc("marriage_notifications").rows } catch { self.error = error.localizedDescription } }
}
