import SwiftUI
import WudaynCore

struct NativePublicGallery: View {
    @EnvironmentObject private var store: NativeStore
    @Environment(\.scenePhase) private var phase
    let subject: String
    @State private var rows: [MemberRow] = []
    var body: some View {
        List { ForEach(rows) { row in NativeStoredImage(bucket: "nisfayn-profile-gallery", path: row.value["path"].string).frame(maxHeight: 400) }; if rows.isEmpty { NativeEmpty(title: "لا توجد صور متاحة في المعرض.", icon: "photo") } }
            .navigationTitle("صور الملف").task(id: phase) {
                guard phase == .active else { rows = []; return }
                while !Task.isCancelled {
                    do { let value = try await store.client.rpc("marriage_gallery", ["action": .string("list"), "subject": .string(subject)]).rows; try Task.checkCancellation(); rows = value }
                    catch is CancellationError { return } catch { rows = []; store.error = error.localizedDescription }
                    do { try await Task.sleep(nanoseconds: 5_000_000_000) } catch { return }
                }
            }
    }
}
struct NativeSharedPhotos: View {
    @EnvironmentObject private var store: NativeStore
    @Environment(\.scenePhase) private var phase
    let connectionID: String
    @State private var state: JSONValue = .null
    @State private var sharing = false
    var body: some View {
        Form {
            Section("صورتي الخاصة") {
                Text("شارك صورتك لهذا التعارف بإذنك، ويمكنك سحب المشاركة. المشاركة لا تمنع تصوير الشاشة.").foregroundStyle(.secondary)
                if !state["mine"].isNull {
                    if phase == .active { NativeStoredImage(bucket: "nisfayn-private-photos", path: state["mine"]["path"].string).frame(height: 220) }
                    Button("مشاركة صورتي") { sharing = true }
                    if !state["sharedUntil"].isNull { Text("المشاركة حتى \(state["sharedUntil"].string.prefix(16))"); NativeAction(title: "سحب المشاركة") { try await share(false) } }
                } else { NavigationLink("إضافة صورتي الخاصة", destination: NativeGallery()) }
            }
            Section("الصورة المشاركة معك") {
                if !state["peer"].isNull && phase == .active { NativeStoredImage(bucket: "nisfayn-private-photos", path: state["peer"]["path"].string).frame(height: 340) }
                else { Text("لم يشارك الطرف الآخر صورة متاحة حاليًا.").foregroundStyle(.secondary) }
            }
        }.navigationTitle("مشاركة الصور الخاصة").confirmationDialog("مشاركة صورتك الخاصة مع هذا الشخص؟", isPresented: $sharing, titleVisibility: .visible) { NativeAction(title: "أوافق على المشاركة") { try await share(true) } }
            .task(id: phase) { guard phase == .active else { state = .null; return }; while !Task.isCancelled {
                do { let value = try await store.client.rpc("marriage_photo_state", ["request_id": .string(connectionID)]); try Task.checkCancellation(); state = value }
                catch is CancellationError { return } catch { state = .null; store.error = error.localizedDescription }
                do { try await Task.sleep(nanoseconds: 5_000_000_000) } catch { return }
            } }
    }
    private func share(_ enabled: Bool) async throws { state = try await store.client.rpc("marriage_photo_share", ["request_id": .string(connectionID), "share": .bool(enabled)]) }
}

struct NativeCompatibility: View {
    let fit: JSONValue
    var body: some View {
        List {
            Section("التقارب") {
                if fit["assessmentComplete"].bool && !fit["provisional"].bool && !fit["percentage"].isNull { Text("\(Int(fit["percentage"].number))٪").font(.largeTitle.bold()) }
                else { Text("لا تكفي الإجابات لعرض نسبة مكتملة.") }
                Text("التقارب يساعد على بدء الحوار، ولا يضمن نجاح العلاقة.").foregroundStyle(.secondary)
            }
            strings("نقاط تقارب", values: fit["strengths"])
            strings("مساحات للحوار", values: fit["discussion"])
            strings("إجابات ناقصة", values: fit["missing"])
            Section("شخصيتكما") {
                if fit["personality"]["complete"].bool && !fit["personality"]["percentage"].isNull { Text("\(Int(fit["personality"]["percentage"].number))٪") }
                ForEach(fit["personality"]["similarities"].array.map(\.string), id: \.self) { Text($0) }
                ForEach(fit["personality"]["differences"].array.map(\.string), id: \.self) { Text($0) }
            }
            Section("بيننا · مواقف الحياة") { ForEach(Array(fit["beena"]["prompts"].array.enumerated()), id: \.offset) { _, item in Text(item["prompt"].string) } }
        }.navigationTitle("قراءة التوافق")
    }
    private func strings(_ title: String, values: JSONValue) -> some View { Section(title) { ForEach(values.array.map(\.string), id: \.self) { Text($0) } } }
}

struct NativeChatLibrary: View {
    @EnvironmentObject private var store: NativeStore
    @Environment(\.scenePhase) private var phase
    let requestID: String
    @State private var search = ""
    @State private var kind = ""
    @State private var messages: [MemberRow] = []
    @State private var more = true
    @State private var generation = UUID()
    @State private var error: String?
    @State private var reading = false
    var body: some View {
        List {
            Picker("المحتوى", selection: $kind) { Text("الكل").tag(""); Text("صور").tag("photo"); Text("صوتيات").tag("audio") }.pickerStyle(.segmented)
            ForEach(messages) { row in NativeMessage(row: row, requestID: requestID, reply: nil) }
            if more { NativeAction(title: "المزيد") { try await load(reset: false) } }
        }.navigationTitle("البحث والمرفقات").searchable(text: $search).nativeError($error)
            .task(id: "\(kind)|\(search)|\(phase == .active)") {
                generation = UUID(); messages = []; more = true
                let epoch = generation
                guard phase == .active else { return }
                do { try await Task.sleep(nanoseconds: 300_000_000) } catch { return }
                while !Task.isCancelled {
                    do { try await load(reset: true) }
                    catch is CancellationError { return } catch { guard epoch == generation else { return }; messages = []; self.error = error.localizedDescription }
                    do { try await Task.sleep(nanoseconds: 5_000_000_000) } catch { return }
                }
            }
            .onDisappear { generation = UUID(); messages = [] }
    }
    private func load(reset: Bool) async throws {
        guard !reading else { return }; reading = true; defer { reading = false }
        let epoch = generation, query = search, selectedKind = kind
        guard query.count <= 100 else { throw NativeProblem.message("اكتب بحثًا لا يتجاوز ١٠٠ حرف.") }
        let target = ChatSnapshot.pageTarget(loadedCount: messages.count, older: !reset)
        var snapshot: [MemberRow] = [], hasMore = true
        repeat {
            let rows = try await store.client.rpc("marriage_search_messages", ["request_id": .string(requestID), "search_query": .string(query), "before_id": ChatSnapshot.cursor(snapshot), "media_kind": selectedKind.isEmpty ? .null : .string(selectedKind)]).rows
            try Task.checkCancellation()
            guard epoch == generation, query == search, selectedKind == kind, phase == .active else { return }
            let next = ChatSnapshot.prepend(rows, to: snapshot)
            hasMore = rows.count == 50 && next.count > snapshot.count; snapshot = next
        } while hasMore && snapshot.count < target
        more = hasMore; messages = snapshot
    }
}
