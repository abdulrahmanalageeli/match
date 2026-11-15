import SwiftUI
import UserNotifications
import WudaynCore

final class NativeAppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = NisfaynPushCenter.shared
        NisfaynPushCenter.shared.setupActions(); NisfaynCallCenter.shared.boot(); return true
    }
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken token: Data) { NisfaynPushCenter.shared.receivedToken(token) }
    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) { NotificationCenter.default.post(name: NisfaynPushCenter.failureEvent, object: nil) }
}

@main struct WudaynNativeApp: App {
    @UIApplicationDelegateAdaptor(NativeAppDelegate.self) private var appDelegate
    @StateObject private var store = NativeStore()
    @Environment(\.scenePhase) private var phase
    var body: some Scene {
        WindowGroup {
            NativeRoot().modifier(NativeLifecycle()).environmentObject(store).environment(\.layoutDirection, .rightToLeft)
                .environment(\.locale, Locale(identifier: "ar_SA")).tint(NativeTheme.accent)
                .background(NativeTheme.paper).nativeError($store.error)
                .task { await store.restore() }
                .sheet(isPresented: $store.offerDeviceLock) { NativeDeviceLockOffer() }
                .onChange(of: phase) { value in
                    if value == .active { NisfaynPrivacy.shared.active() }
                    else if value == .background { NisfaynPrivacy.shared.background() }
                    else { NisfaynPrivacy.shared.shield() }
                }
                .background(NativeWindowAttachment().frame(width: 0, height: 0))
        }
    }
}

private struct NativeWindowAttachment: UIViewRepresentable {
    final class AttachedView: UIView {
        override func didMoveToWindow() {
            super.didMoveToWindow()
            if let window { NisfaynPrivacy.shared.attach(window); NisfaynPrivacy.shared.active() }
        }
    }
    func makeUIView(context: Context) -> AttachedView { AttachedView() }
    func updateUIView(_ view: AttachedView, context: Context) {}
}

struct NativeRoot: View {
    @EnvironmentObject private var store: NativeStore
    var body: some View {
        Group {
            if store.restoring { ProgressView("نفتح مساحتك…") }
            else if store.owner == nil { NavigationStack { NativeLogin() } }
            else if store.onboarding["required"].bool { NavigationStack { NativeSocialOnboarding().toolbar { Button("تسجيل الخروج") { Task { await store.signOut() } } } } }
            else if store.familyMode && store.onboarding["required"] == .bool(false) { NavigationStack { NativeFamily().toolbar { Button("تسجيل الخروج") { Task { await store.signOut() } } } } }
            else if store.account.isNull {
                VStack(spacing: 20) {
                    Text("لم يكتمل تحميل حسابك.")
                    NativeAction(title: "إعادة المحاولة") { try await store.refresh() }
                    Button("تسجيل الخروج") { Task { await store.signOut() } }
                }
            }
            else {
                TabView {
                    NavigationStack { NativeHome() }.tabItem { Label("مساحتي", systemImage: "house") }
                    NavigationStack { NativeDiscovery() }.tabItem { Label("اكتشاف", systemImage: "safari") }
                    NavigationStack { NativeInbox() }.tabItem { Label("التعارفات", systemImage: "bubble.left.and.bubble.right") }
                    NavigationStack { NativeActivity() }.tabItem { Label("الإشعارات", systemImage: "bell") }
                    NavigationStack { NativeSettings() }.tabItem { Label("الإعدادات", systemImage: "gearshape") }
                }.id(store.owner)
            }
        }
    }
}

struct NativeLogin: View {
    @EnvironmentObject private var store: NativeStore
    @State private var email = ""
    @State private var password = ""
    @State private var family = false
    var body: some View {
        Form {
            Section { VStack(alignment: .leading, spacing: 12) { Text("وُدَين").font(.largeTitle.bold()); Text("بداية واعية لحياة مشتركة").foregroundStyle(.secondary) }.padding(.vertical, 20) }
            NativeSocialLogin(family: family)
            Section { Toggle("دخول أفراد الأسرة", isOn: $family).disabled(store.busy) }
            Section {
              DisclosureGroup("لديّ حساب بالبريد الإلكتروني") {
                TextField("البريد الإلكتروني", text: $email).keyboardType(.emailAddress).textContentType(.username).textInputAutocapitalization(.never).autocorrectionDisabled().accessibilityIdentifier("login.email")
                SecureField("كلمة المرور", text: $password).textContentType(.password).accessibilityIdentifier("login.password")
                Button("تسجيل الدخول") { let secret = password; password = ""; Task { await store.signIn(email: email, password: secret, family: family) } }.disabled(store.busy || email.isEmpty || password.isEmpty).accessibilityIdentifier("login.submit")
                NavigationLink("نسيت كلمة المرور", destination: NativePasswordRecovery(email: email))
              }
            }
            Section { Text("لإنشاء حساب جديد، تابع باستخدام Apple أو Google ثم أكمل تأكيد الجوال.").font(.footnote); NavigationLink("الخصوصية وشروط الاستخدام", destination: NativeLegal()) }
        }.navigationTitle("أهلًا بك")
    }
}

struct NativeHome: View {
    @EnvironmentObject private var store: NativeStore
    var body: some View {
        List {
            Section { Text("أهلًا، \(store.profile["displayName"].string)").font(.title2.bold()); Text("خطوة هادئة نحو شراكة واضحة.").foregroundStyle(.secondary) }
            if store.profile.isNull || store.account["user"]["applicationStatus"].string == "draft" {
                NavigationLink("أكمل ملفك", destination: NativeProfileEditor())
            } else if !store.approved { NativeEmpty(title: "ملفك قيد المراجعة. سنبلغك عند تحديث حالته.", icon: "clock") }
            Section("خطواتك") {
                NavigationLink("ملفي وتفضيلاتي", destination: NativeProfileEditor())
                NavigationLink("جلسة التوافق", destination: NativeInterview())
                NavigationLink("جواز الجاهزية", destination: NativeReadiness())
                NavigationLink("جسر الأهل", destination: NativeFamily())
                NavigationLink("عضويتي", destination: NativeMembership())
            }
        }.navigationTitle("وُدَين").refreshable { await store.perform { try await store.refresh() } }
    }
}
