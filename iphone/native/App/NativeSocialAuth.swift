import SwiftUI
import AuthenticationServices
import CryptoKit
import Security
import LocalAuthentication
import WudaynCore

enum NativeAuthRandom {
    static func token() throws -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { throw NativeProblem.invalidResponse }
        return Data(bytes).base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }
    static func hash(_ value: String) -> String { SHA256.hash(data: Data(value.utf8)).map { String(format: "%02x", $0) }.joined() }
}

struct NativeDeviceLockOffer: View {
    @EnvironmentObject private var store: NativeStore
    @State private var enabling = false
    @State private var failed = false
    private var label: String {
        let context = LAContext()
        _ = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)
        return context.biometryType == .faceID ? "Face ID" : context.biometryType == .touchID ? "Touch ID" : "رمز الجهاز"
    }
    var body: some View {
        VStack(spacing: 24) {
            Image(systemName: "lock.shield").font(.largeTitle).foregroundStyle(NativeTheme.accent)
            Text("احمِ مساحتك باستخدام \(label)").font(.title2.bold()).multilineTextAlignment(.center)
            Text("افتح وُدَين بأمان عند العودة إليه. تبقى بيانات وجهك على جهازك، ويمكن استخدام رمز الجهاز عند الحاجة.").multilineTextAlignment(.center)
            if failed { Text("لم يتم التفعيل. يمكنك المحاولة مجددًا أو تفعيله لاحقًا من الإعدادات.").foregroundStyle(.secondary) }
            Button("تفعيل \(label)") {
                enabling = true
                NisfaynPrivacy.shared.configure(enabled: true, delay: 0) { success in
                    enabling = false; failed = !success
                    if success { store.offerDeviceLock = false }
                }
            }.buttonStyle(.borderedProminent).disabled(enabling)
            Button("لاحقًا") { store.offerDeviceLock = false }.disabled(enabling)
        }.padding(28).interactiveDismissDisabled(enabling)
    }
}

@MainActor final class NativeGoogleAuth: NSObject, ObservableObject, ASWebAuthenticationPresentationContextProviding {
    private var session: ASWebAuthenticationSession?
    private var anchor: ASPresentationAnchor?
    private var pending: CheckedContinuation<URL, Error>?
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor { anchor ?? ASPresentationAnchor() }
    func cancel() { session?.cancel(); finish(.failure(CancellationError())) }
    private func finish(_ result: Result<URL, Error>) {
        let continuation = pending; pending = nil; session = nil; anchor = nil
        continuation?.resume(with: result)
    }
    func signIn(client: WudaynClient) async throws -> String {
        guard session == nil else { throw NativeProblem.invalidResponse }
        let verifier = try NativeAuthRandom.token()
        let challenge = Data(SHA256.hash(data: Data(verifier.utf8))).base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
        var url = URLComponents(url: WudaynClient.projectURL.appendingPathComponent("auth/v1/authorize"), resolvingAgainstBaseURL: false)!
        url.queryItems = [URLQueryItem(name: "provider", value: "google"), URLQueryItem(name: "redirect_to", value: SocialCallback.redirect), URLQueryItem(name: "code_challenge", value: challenge), URLQueryItem(name: "code_challenge_method", value: "s256"), URLQueryItem(name: "scopes", value: "email profile"), URLQueryItem(name: "prompt", value: "select_account")]
        guard let window = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).filter({ $0.activationState == .foregroundActive }).flatMap({ $0.windows }).first(where: { $0.isKeyWindow }) else { throw NativeProblem.invalidResponse }
        anchor = window
        let callback: URL = try await withTaskCancellationHandler(operation: {
            try await withCheckedThrowingContinuation { continuation in
                pending = continuation
                let request = ASWebAuthenticationSession(url: url.url!, callbackURLScheme: "com.blindmatch.marriage") { [weak self] callback, error in
                    Task { @MainActor in
                        if let error = error as? ASWebAuthenticationSessionError, error.code == .canceledLogin { self?.finish(.failure(CancellationError())) }
                        else if let error { self?.finish(.failure(error)) }
                        else if let callback { self?.finish(.success(callback)) }
                        else { self?.finish(.failure(NativeProblem.invalidResponse)) }
                    }
                }
                request.presentationContextProvider = self
                request.prefersEphemeralWebBrowserSession = true
                session = request
                if !request.start() { finish(.failure(NativeProblem.message("تعذّر فتح تسجيل الدخول. حاول مجددًا."))) }
            }
        }, onCancel: { Task { @MainActor in self.cancel() } })
        try Task.checkCancellation()
        return try await client.exchangeGoogleCode(SocialCallback.code(from: callback), verifier: verifier)
    }
}

struct NativeSocialLogin: View {
    @EnvironmentObject private var store: NativeStore
    @StateObject private var google = NativeGoogleAuth()
    @State private var providers: JSONValue = .null
    @State private var nonce: String?
    @State private var applePending = false
    let family: Bool
    var body: some View {
        Section {
            SignInWithAppleButton(.continue) { request in
                do {
                    let value = try NativeAuthRandom.token(); nonce = value; applePending = true
                    request.requestedScopes = [.email, .fullName]; request.nonce = NativeAuthRandom.hash(value)
                } catch { nonce = nil; store.error = error.localizedDescription }
            } onCompletion: { result in
                let value = nonce; nonce = nil; applePending = false
                switch result {
                case .success(let authorization):
                    guard let value, let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                          let data = credential.identityToken, let token = String(data: data, encoding: .utf8) else { store.error = "تعذّر تأكيد حساب Apple. حاول مجددًا."; return }
                    Task { await store.socialSignIn(family: family) { try await store.client.signInWithApple(idToken: token, nonce: value) } }
                case .failure(let error):
                    if (error as? ASAuthorizationError)?.code != .canceled { store.error = "تعذّر تسجيل الدخول باستخدام Apple. حاول مجددًا." }
                }
            }.signInWithAppleButtonStyle(.black).frame(height: 50)
                .disabled(store.busy || applePending || !providers["apple"].bool).accessibilityIdentifier("login.apple")
            Button("المتابعة باستخدام Google") {
                Task { await store.socialSignIn(family: family) { try await google.signIn(client: store.client) } }
            }.frame(maxWidth: .infinity, minHeight: 44).disabled(store.busy || applePending || !providers["google"].bool).accessibilityIdentifier("login.google")
            if providers.isNull { ProgressView("نتحقق من خيارات الدخول…") }
            else if !providers["apple"].bool || !providers["google"].bool { Text("بعض خيارات الدخول غير متاحة حاليًا. يمكنك استخدام حسابك الحالي أدناه.").font(.footnote).foregroundStyle(.secondary) }
            Button("تحديث خيارات الدخول") { Task { await load() } }.font(.footnote)
        } header: { Text("دخول سريع وآمن") }
        .task { await load() }.onDisappear { google.cancel() }
    }
    private func load() async {
        do { providers = try await store.client.socialProviders() }
        catch { providers = .object([:]); store.error = "تعذّر تحميل خيارات الدخول. تحقق من اتصالك وأعد المحاولة." }
    }
}
