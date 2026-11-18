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
                NavigationLink("السجل والإبلاغ عن تعارف سابق", destination: NativeHistory())
                NavigationLink("تفضيل العمل المنشور", destination: NativeDirectoryWork())
                NavigationLink("الحظر وعدم إعادة الترشيح", destination: NativeExclusions()).accessibilityIdentifier("settings.exclusions")
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
                NativeAction(title: NativeCatalog.copy("deleteAccount")) { _ = try await store.client.rpc("marriage_delete_account"); try await store.client.signOut(); NisfaynCallCenter.shared.clear(); store.owner = nil; store.account = .null }
            } message: { Text(NativeCatalog.copy("deleteWarning")) }
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

struct NativeDirectoryWork: View {
    @EnvironmentObject private var store: NativeStore
    @Environment(\.dismiss) private var dismiss
    @State private var choice = ""
    @State private var loaded = false
    @State private var error: String?
    var body: some View {
        Form {
            Text("يمكن للأعضاء البحث عن ملفك وفق اختيارك المنشور هنا. يمكنك سحبه في أي وقت.")
            Picker("الموقف من عمل الزوجة", selection: $choice) {
                Text("خاص · لا أنشر اختياري").tag("")
                Text("تفضيل العمل").tag("A")
                Text("تفضيل عدم العمل").tag("B")
                Text("المرونة حسب الاتفاق").tag("C")
            }
            NativeAction(title: "حفظ") {
                _ = try await store.client.rpc("marriage_directory_work", ["choice": choice.isEmpty ? .null : .string(choice), "writing": .bool(true)])
                dismiss()
            }.disabled(!loaded)
        }.navigationTitle("تفضيل العمل المنشور").nativeError($error).task {
            do { choice = try await store.client.rpc("marriage_directory_work").string; loaded = true }
            catch { self.error = error.localizedDescription }
        }
    }
}

struct NativeExclusions: View {
    @State private var selected: MemberRow?
    @EnvironmentObject private var store: NativeStore
    @State private var rows: [MemberRow] = []
    @State private var loading = true
    @State private var error: String?
    var body: some View { List {
        if loading { ProgressView() }
        else if rows.isEmpty { NativeEmpty(title: "لا يوجد أشخاص في هذه القائمة حاليًا.", icon: "person.crop.circle.badge.checkmark") }
        ForEach(rows) { row in VStack(alignment: .leading, spacing: 6) { Text(row.value["alias"].string); Text(row.value["reason"].string == "blocked" ? "حظرته" : "عدم إعادة الترشيح").foregroundStyle(.secondary); Text(NativeDates.display(row.value["since"].string)).font(.caption).foregroundStyle(.secondary); if row.value["reason"].string == "blocked" { Button("الإبلاغ عن واقعة") { selected = row } } } }
    }.sheet(item: $selected) { row in NavigationStack { NativeIncidentReport(subjectID: row.id) } }.navigationTitle("الحظر وعدم إعادة الترشيح").nativeError($error).task { await load() }.refreshable { await load() } }
    private func load() async { loading = true; defer { loading = false }; do { rows = try await store.client.rpc("marriage_matching_exclusions").rows } catch { self.error = error.localizedDescription } }
}

struct NativeDeviceSettings: View {
    @EnvironmentObject private var store: NativeStore
    @State private var lock = UserDefaults.standard.bool(forKey: "nisfayn.privacy.lock")
    @State private var delay = UserDefaults.standard.integer(forKey: "nisfayn.privacy.delay")
    @State private var push = false
    @State private var preview = "private"
    @State private var callerName = UserDefaults.standard.bool(forKey: "nisfayn.calls.showName")
    @State private var icon = UIApplication.shared.alternateIconName ?? "default"
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
            Picker("خصوصية المعاينة", selection: $preview) { Text("إشعار خاص").tag("private"); Text("الاسم فقط").tag("name"); Text("الاسم والمحتوى").tag("content") }
            NativeAction(title: "حفظ خصوصية الإشعارات") { _ = try await store.client.rpc("marriage_push_privacy", ["preview_mode": .string(preview)]) }
            NativeAction(title: push ? "إيقاف الإشعارات" : "تفعيل إشعارات iPhone") {
                if push { _ = try await store.client.rpc("marriage_push_enable", ["enabled": .bool(false)]); _ = try await store.client.rpc("marriage_push_unregister", ["installation": .string(NativeDevice.installationID)]); UIApplication.shared.unregisterForRemoteNotifications(); push = false }
                else { try await NativeDevice.enablePush(client: store.client); push = true }
            }
            Link("إعدادات iPhone", destination: URL(string: UIApplication.openSettingsURLString)!)
        }
        Section("الظهور على الجهاز") {
            Toggle("إظهار اسم المتصل على شاشة المكالمة", isOn: $callerName).onChange(of: callerName) { UserDefaults.standard.set($0, forKey: "nisfayn.calls.showName") }
            if UIApplication.shared.supportsAlternateIcons {
                Picker("أيقونة التطبيق", selection: $icon) { Text("وُدَين").tag("default"); Text("هادئة").tag("Quiet"); Text("الأفق").tag("Horizon") }
                NativeAction(title: "تغيير الأيقونة") { try await UIApplication.shared.setAlternateIconName(icon == "default" ? nil : icon) }
            }
        }
    }.navigationTitle("خصوصية الجهاز").task {
        do { push = try await store.client.rpc("marriage_push_settings")["enabled"].bool; preview = try await store.client.rpc("marriage_push_privacy", ["preview_mode": .null])["preview"].string } catch { store.error = error.localizedDescription }
    } }
}

enum NativeMembershipProducts {
    static let legacy = "com.blindmatch.marriage.monthly"
    static let men = [legacy + ".seriousness", legacy + ".men"]
    static let women = [legacy + ".seriousness.women", legacy + ".women"]
    static let supported = Set([legacy] + men + women)

    static func forGender(_ gender: String) -> [String] {
        switch gender {
        case "man": return men
        case "woman": return women
        default: return []
        }
    }
}

struct NativeMembership: View {
    @EnvironmentObject private var store: NativeStore
    @State private var offer: MembershipStoreOffer?
    @State private var error: String?
    @State private var loaded = false
    @State private var agreed = false
    @State private var restoreNotice: String?
    private var membership: JSONValue { store.account["membership"] }
    private var status: String { membership["status"].string }
    private var heading: String {
        switch status {
        case "trial": return "تجربتك المجانية مفعّلة"
        case "expired": return "انتهت صلاحية عضويتك"
        case "paid": return "اشتراكك المدفوع فعّال"
        default: return membership["active"].bool ? "عضويتك فعّالة" : "عضوية وُدَين"
        }
    }
    private var productIDs: [String] { NativeMembershipProducts.forGender(store.profile["gender"].string) }
    var body: some View { Form {
        Section {
            Label(heading, systemImage: "heart.circle")
            if status == "trial" { Text("تنتهي تجربة وُدَين دون خصم. يمكنك اختيار اشتراك Apple الذي يتجدد تلقائيًا حتى الإلغاء.") }
            if membership["active"].bool, let end = NativeDates.parse(membership["expiresAt"].string) {
                Text("الوصول متاح حتى \(end.formatted(date: .long, time: .omitted)).")
            }
            Text("ملخّص التوافق أثناء التصفح، والتفاصيل بعد قبول التعارف من الطرفين. تعارفان نشطان كحد أقصى. تبدأ المحادثة بعد قبول طلب التعارف وموافقتكما على الشروط والمدة.")
        }
        if store.account["testingTrial"]["eligible"].bool {
            Section("تجربة مجانية لمدة سبعة أيام") {
                Text("مرة واحدة لكل رقم جوال مؤكّد. تنتهي دون خصم أو تجديد تلقائي.")
                Toggle("أوافق على بدء التجربة الآن", isOn: $agreed)
                NativeAction(title: "ابدأ تجربتي المجانية") {
                    _ = try await store.client.rpc("marriage_accept_testing_trial", ["offer_version": .string("testing-7d-12999-v1")])
                    try await store.refresh()
                }.disabled(!agreed)
            }
        }
        if !membership["active"].bool || status == "trial" {
          if let offer {
            let product = offer.product
            if let introduction = offer.introduction { Text(introduction) }
            Text("يتجدد الاشتراك تلقائيًا مقابل \(product.displayPrice) لكل \(offer.period) حتى الإلغاء عبر Apple.")
            NativeAction(title: offer.introduction == nil ? "اشترك مقابل \(product.displayPrice) لكل \(offer.period)" : "متابعة العرض عبر Apple") {
                let owner = store.owner
                try await store.refresh()
                guard owner == store.owner, productIDs.contains(product.id), membership["canStart"].bool else { throw NativeProblem.message("تعذّر بدء الاشتراك. حدّث حالة العضوية.") }
                await loadProduct()
                guard let current = self.offer, current.product.id == product.id, current.product.displayPrice == product.displayPrice,
                      current.period == offer.period, current.introduction == offer.introduction, owner == store.owner else {
                    throw NativeProblem.message("تغيّر عرض Apple. راجع العرض المحدّث قبل الشراء.")
                }
                guard let token = UUID(uuidString: store.account["user"]["appAccountToken"].string) else { throw NativeProblem.signedOut }
                switch try await current.product.purchase(options: [.appAccountToken(token)]) {
                case .success(let result): try await deliver(result)
                case .pending: throw NativeProblem.message("بانتظار الموافقة على الشراء.")
                case .userCancelled: break
                @unknown default: throw NativeProblem.invalidResponse
                }
            }.disabled(!membership["canStart"].bool)
          } else if loaded {
            Text("تعذّر تحميل سعر العضوية من App Store.")
            NativeAction(title: "إعادة تحميل السعر") { await loadProduct() }
          } else { ProgressView("نحمّل سعر العضوية…") }
          if !membership["canStart"].bool {
              Text("يتاح الشراء عند اعتماد ملفك وتوفر ترشيحات أو وجود تعارف قائم.")
          }
        }
        NativeAction(title: "استعادة المشتريات") {
            try await AppStore.sync()
            var restored = false
            for await result in StoreKit.Transaction.currentEntitlements {
                if case .verified(let transaction) = result, NativeMembershipProducts.supported.contains(transaction.productID) {
                    try await deliver(result)
                    restored = true
                }
            }
            restoreNotice = restored ? "تم تحديث عضويتك." : "لا يوجد اشتراك فعّال لاستعادته."
        }
        if let restoreNotice { Text(restoreNotice) }
        NativeAction(title: "إدارة الاشتراك") {
            guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene else { return }
            try await AppStore.showManageSubscriptions(in: scene)
        }
        NavigationLink("الخصوصية والشروط", destination: NativeLegal())
    }.navigationTitle("عضويتي").nativeError($error).task(id: productIDs) { await loadProduct() }
        .task(id: membership["expiresAt"].string) {
            guard membership["active"].bool, let end = NativeDates.parse(membership["expiresAt"].string) else { return }
            do {
                try await Task.sleep(for: .seconds(max(0, end.timeIntervalSinceNow)))
                try Task.checkCancellation()
                try await store.refresh()
            } catch is CancellationError { } catch { self.error = error.localizedDescription }
        }
        .refreshable { await store.perform { try await store.refresh(); await loadProduct() } } }
    private func loadProduct() async {
        let ids = productIDs
        offer = nil
        loaded = false
        do {
            let products = try await Product.products(for: ids)
            guard !Task.isCancelled, ids == productIDs else { return }
            if let product = ids.lazy.compactMap({ id in products.first { $0.id == id } }).first {
                let terms = await MembershipStoreOffer(product)
                guard !Task.isCancelled, ids == productIDs else { return }
                offer = terms
            }
        } catch {
            guard !Task.isCancelled, ids == productIDs else { return }
            self.error = error.localizedDescription
        }
        loaded = true
    }
    private func deliver(_ result: VerificationResult<StoreKit.Transaction>) async throws {
        guard case .verified(let transaction) = result, NativeMembershipProducts.supported.contains(transaction.productID) else { throw NativeProblem.message("تعذّر التحقق من عملية الشراء.") }
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
