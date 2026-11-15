import SwiftUI
import StoreKit
import UserNotifications
import LocalAuthentication
import UniformTypeIdentifiers
import WudaynCore

enum NativeDevice {
    static var installationID: String { NisfaynPushCenter.shared.installation }
    static func normalizePhone(_ input: String) throws -> String {
        var phone = input.compactMap { character -> String? in
            if let digit = character.wholeNumberValue { return String(digit) }
            return character == "+" ? "+" : nil
        }.joined()
        if phone.hasPrefix("05") { phone = "+966" + phone.dropFirst() }
        else if phone.hasPrefix("5") { phone = "+966" + phone }
        else if phone.hasPrefix("00966") { phone = "+" + phone.dropFirst(2) }
        else if phone.hasPrefix("966") { phone = "+" + phone }
        guard phone.range(of: "^\\+9665[0-9]{8}$", options: .regularExpression) != nil else { throw NativeProblem.message("أدخل رقم جوال سعودي صالحًا.") }; return phone
    }
    @MainActor static func enablePush(client: WudaynClient) async throws {
        let allowed = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound])
        guard allowed else { throw NativeProblem.message("اسمح بالإشعارات من إعدادات iPhone.") }
        UIApplication.shared.registerForRemoteNotifications()
        for _ in 0..<75 {
            if let token = NisfaynPushCenter.shared.token {
                _ = try await client.rpc("marriage_push_register", ["device_token": .string(token), "device_environment": .string(NisfaynPushCenter.shared.environment), "installation": .string(installationID)])
                _ = try await client.rpc("marriage_push_enable", ["enabled": .bool(true)]); return
            }
            try await Task.sleep(nanoseconds: 200_000_000)
        }
        throw NativeProblem.message("لم يكتمل تسجيل الإشعارات. حاول مجددًا.")
    }
}

struct NativeSettings: View {
    @EnvironmentObject private var store: NativeStore
    @State private var delete = false
    @State private var logout = false
    @State private var pause = false
    @State private var exported: NativeDataDocument?
    @State private var exporting = false
    var body: some View {
        List {
            Section("ملفي") {
                NavigationLink("ملفي وتفضيلاتي", destination: NativeProfileEditor())
                NavigationLink("معاينة الملف", destination: NativePerson(person: publicProfile, preview: true))
                NavigationLink("صوري", destination: NativeGallery())
                NavigationLink("جلسة التوافق", destination: NativeInterview())
                NavigationLink("جواز الجاهزية", destination: NativeReadiness())
                NavigationLink("جسر الأهل", destination: NativeFamily())
                NavigationLink("طلبات التوثيق السابقة", destination: NativeVerification())
            }
            Section("العضوية والخصوصية") {
                NavigationLink("عضويتي", destination: NativeMembership())
                Button(store.account["user"]["paused"].bool ? "استئناف الترشيحات" : "إيقاف الترشيحات مؤقتًا") { pause = true }
                NavigationLink("الحظر وعدم إعادة الترشيح", destination: NativeExclusions())
                NavigationLink("قفل التطبيق والإشعارات", destination: NativeDeviceSettings())
                NavigationLink("الخصوصية وشروط الاستخدام", destination: NativeLegal())
                NativeAction(title: "نسخة من بياناتي") { exported = NativeDataDocument(data: try await store.client.rpc("marriage_personal_data").encoded()); exporting = true }
            }
            Section("المساعدة") { NavigationLink("دليلك في وُدَين", destination: NativeHelp()); NavigationLink("تواصل مع الدعم", destination: NativeSupport()) }
            Section {
                Button("تسجيل الخروج") { logout = true }
                Button("حذف حسابي", role: .destructive) { delete = true }
            }
        }.navigationTitle("الإعدادات")
            .confirmationDialog("تسجيل الخروج؟", isPresented: $logout, titleVisibility: .visible) { Button("تسجيل الخروج", role: .destructive) { Task { await store.signOut() } } }
            .confirmationDialog("تغيير ظهور ملفك في الترشيحات؟", isPresented: $pause, titleVisibility: .visible) {
                NativeAction(title: "تأكيد") { _ = try await store.client.rpc("marriage_pause", ["paused": .bool(!store.account["user"]["paused"].bool)]); try await store.refresh() }
            } message: { Text("تبقى المحادثات المقبولة متاحة مع صلاحية العضوية. إيقاف الترشيحات لا يلغي اشتراك Apple.") }
            .confirmationDialog("حذف الحساب وبياناته نهائيًا؟", isPresented: $delete, titleVisibility: .visible) {
                NativeAction(title: "حذف حسابي نهائيًا") { _ = try await store.client.rpc("marriage_delete_account"); try await store.client.signOut(); NisfaynCallCenter.shared.clear(); store.owner = nil; store.account = .null }
            } message: { Text("لا يمكن التراجع عن الحذف. اشتراك Apple يُلغى بشكل منفصل من إدارة الاشتراكات.") }
            .fileExporter(isPresented: $exporting, document: exported, contentType: .json, defaultFilename: "wudayn-data") { result in if case .failure(let error) = result { store.error = error.localizedDescription }; exported = nil }
    }
    private var publicProfile: JSONValue {
        var value = store.profile; value["id"] = .string(store.owner ?? ""); value["alias"] = value["displayName"]; value["occupation"] = value["profession"]; return value
    }
}

struct NativeDataDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }
    let data: Data
    init(data: Data) { self.data = data }
    init(configuration: ReadConfiguration) throws { data = configuration.file.regularFileContents ?? Data() }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper { FileWrapper(regularFileWithContents: data) }
}

struct NativeExclusions: View {
    @EnvironmentObject private var store: NativeStore
    @State private var rows: [MemberRow] = []
    @State private var loading = true
    @State private var error: String?
    var body: some View { List {
        if loading { ProgressView() }
        else if rows.isEmpty { NativeEmpty(title: "لا يوجد أشخاص في هذه القائمة حاليًا.", icon: "person.crop.circle.badge.checkmark") }
        ForEach(rows) { row in VStack(alignment: .leading, spacing: 6) { Text(row.value["alias"].string); Text(row.value["reason"].string == "blocked" ? "حظرته" : "عدم إعادة الترشيح").foregroundStyle(.secondary); Text(row.value["since"].string.prefix(10)).font(.caption).foregroundStyle(.secondary) } }
    }.navigationTitle("الحظر وعدم إعادة الترشيح").nativeError($error).task { await load() }.refreshable { await load() } }
    private func load() async { loading = true; defer { loading = false }; do { rows = try await store.client.rpc("marriage_matching_exclusions").rows } catch { self.error = error.localizedDescription } }
}

struct NativeDeviceSettings: View {
    @EnvironmentObject private var store: NativeStore
    @State private var lock = UserDefaults.standard.bool(forKey: "nisfayn.privacy.lock")
    @State private var delay = UserDefaults.standard.integer(forKey: "nisfayn.privacy.delay")
    @State private var push = false
    var body: some View { Form {
        Section("قفل التطبيق") {
            Toggle("Face ID أو رمز الجهاز", isOn: $lock)
            Picker("القفل بعد المغادرة", selection: $delay) { Text("مباشرة").tag(0); Text("دقيقة").tag(60); Text("٥ دقائق").tag(300) }
            NativeAction(title: "حفظ إعداد القفل") {
                let success = await withCheckedContinuation { continuation in NisfaynPrivacy.shared.configure(enabled: lock, delay: delay) { continuation.resume(returning: $0) } }
                if !success { throw NativeProblem.message("لم يكتمل التحقق. بقي إعداد القفل كما هو.") }
            }
        }
        Section("الإشعارات") {
            NativeAction(title: push ? "إيقاف الإشعارات" : "تفعيل إشعارات iPhone") {
                if push { _ = try await store.client.rpc("marriage_push_enable", ["enabled": .bool(false)]); _ = try await store.client.rpc("marriage_push_unregister", ["installation": .string(NativeDevice.installationID)]); UIApplication.shared.unregisterForRemoteNotifications(); push = false }
                else { try await NativeDevice.enablePush(client: store.client); push = true }
            }
            Link("إعدادات iPhone", destination: URL(string: UIApplication.openSettingsURLString)!)
        }
    }.navigationTitle("خصوصية الجهاز").task { push = (try? await store.client.rpc("marriage_push_settings")["enabled"].bool) ?? false } }
}

struct NativeMembership: View {
    @EnvironmentObject private var store: NativeStore
    @State private var product: Product?
    @State private var error: String?
    private let productID = "com.blindmatch.marriage.monthly"
    var body: some View { Form {
        Section { Label(store.account["membership"]["active"].bool ? "عضويتك فعّالة" : "عضوية وُدَين", systemImage: "heart.circle"); Text("اشتراك شهري متجدد عبر Apple. يمكنك إدارة التجديد من إعدادات اشتراكاتك.") }
        if let product {
            NativeAction(title: "اشتراك · \(product.displayPrice)") {
                guard let token = UUID(uuidString: store.account["user"]["appAccountToken"].string) else { throw NativeProblem.signedOut }
                switch try await product.purchase(options: [.appAccountToken(token)]) {
                case .success(let result): try await deliver(result)
                case .pending: throw NativeProblem.message("بانتظار الموافقة على الشراء.")
                case .userCancelled: break
                @unknown default: throw NativeProblem.invalidResponse
                }
            }.disabled(!store.account["membership"]["canStart"].bool || store.account["membership"]["active"].bool)
        } else { ProgressView("نحمّل سعر العضوية…") }
        NativeAction(title: "استعادة المشتريات") {
            try await AppStore.sync()
            for await result in StoreKit.Transaction.currentEntitlements { if case .verified(let transaction) = result, transaction.productID == productID { try await deliver(result) } }
        }
        NativeAction(title: "إدارة الاشتراك") {
            guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene else { return }
            try await AppStore.showManageSubscriptions(in: scene)
        }
        NavigationLink("الخصوصية والشروط", destination: NativeLegal())
    }.navigationTitle("عضويتي").nativeError($error).task { do { product = try await Product.products(for: [productID]).first } catch { self.error = error.localizedDescription } } }
    private func deliver(_ result: VerificationResult<StoreKit.Transaction>) async throws {
        guard case .verified(let transaction) = result, transaction.productID == productID else { throw NativeProblem.message("تعذّر التحقق من عملية الشراء.") }
        _ = try await store.client.edge("verify-membership", .object(["signedTransaction": .string(result.jwsRepresentation)]))
        await transaction.finish(); try await store.refresh()
    }
}

struct NativeHelp: View {
    var body: some View { List {
        ForEach(NativeCatalog.value["help"]["guide"].array, id: \.["id"].string) { item in DisclosureGroup(item["q"].string) { Text(item["a"].string).foregroundStyle(.secondary) } }
    }.navigationTitle("دليلك في وُدَين") }
}

struct NativeSupport: View {
    @EnvironmentObject private var store: NativeStore
    @State private var tickets: [MemberRow] = []
    @State private var subject = ""
    @State private var bodyText = ""
    @State private var category = "help"
    @State private var clientID = UUID().uuidString.lowercased()
    @State private var error: String?
    var body: some View { Form {
        Section("طلب مساعدة") {
            Picker("الموضوع", selection: $category) { Text("الحساب والدخول").tag("access"); Text("العضوية").tag("billing"); Text("السلامة").tag("safety"); Text("مساعدة عامة").tag("help") }
            TextField("العنوان", text: $subject)
            TextField("كيف نساعدك؟", text: $bodyText, axis: .vertical).lineLimit(4...10)
            NativeAction(title: "إرسال للدعم") {
                _ = try await store.client.rpc("marriage_support", ["action": .string("create"), "payload": .object(["category": .string(category), "subject": .string(subject), "body": .string(bodyText), "clientId": .string(clientID)])])
                subject = ""; bodyText = ""; clientID = UUID().uuidString.lowercased(); await load()
            }.disabled(subject.isEmpty || bodyText.isEmpty)
        }
        Section("طلباتك السابقة") { ForEach(tickets) { row in VStack(alignment: .leading, spacing: 8) { Text(row.value["subject"].string).font(.headline); Text(row.value["body"].string); if !row.value["response"].string.isEmpty { Text(row.value["response"].string).foregroundStyle(NativeTheme.accent) } else { Text("بانتظار رد الفريق").foregroundStyle(.secondary) } } } }
    }.navigationTitle("الدعم").nativeError($error).task { await load() } }
    private func load() async { do { tickets = try await store.client.rpc("marriage_support", ["action": .string("list"), "payload": .object([:])])["items"].rows } catch { self.error = error.localizedDescription } }
}

struct NativeVerification: View {
    @EnvironmentObject private var store: NativeStore
    @State private var state: JSONValue = .null
    @State private var error: String?
    var body: some View { List {
        Section { Text("إرسال مستندات التوثيق متوقف مؤقتًا إلى حين اعتماد طريقة تحقق مناسبة.") }
        ForEach(state["requests"].rows) { row in Section {
            Text(row.value["claimSnapshot"]["label"].string)
            if !row.value["reason"].string.isEmpty { Text(row.value["reason"].string) }
            NativeAction(title: "سحب الطلب") { state = try await store.client.edge("manual-verification", .object(["action": .string("withdraw"), "payload": .object(["requestId": .string(row.id), "revision": row.value["revision"]])])) }
        } }
    }.navigationTitle("طلبات التوثيق السابقة").nativeError($error).task { do { state = try await store.client.edge("manual-verification", .object(["action": .string("list"), "payload": .object([:])])) } catch { self.error = error.localizedDescription } } }
}
