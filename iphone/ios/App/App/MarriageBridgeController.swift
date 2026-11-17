import Capacitor
import WebKit
import AuthenticationServices
import CryptoKit
import Security

final class MarriageBridgeController: CAPBridgeViewController {
    private var reportedSafeInsets: (top: Int, bottom: Int)?
    private var pageLoadObservation: NSKeyValueObservation?

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        let top = Int(ceil(view.safeAreaInsets.top))
        let bottom = Int(ceil(view.safeAreaInsets.bottom))
        guard reportedSafeInsets?.top != top || reportedSafeInsets?.bottom != bottom, let webView else { return }
        reportedSafeInsets = (top, bottom)
        webView.evaluateJavaScript("document.documentElement?.style.setProperty('--nf-native-safe-top', '\(top)px'); document.documentElement?.style.setProperty('--nf-native-safe-bottom', '\(bottom)px')")
    }

    override func capacitorDidLoad() {
        pageLoadObservation = webView?.observe(\.isLoading, options: [.new]) { [weak self] webView, _ in
            guard !webView.isLoading else { return }
            DispatchQueue.main.async {
                self?.reportedSafeInsets = nil
                self?.view.setNeedsLayout()
            }
        }
        bridge?.registerPluginInstance(AppleMembershipPlugin())
        bridge?.registerPluginInstance(PrivateSessionPlugin())
        bridge?.registerPluginInstance(PrivatePhotoPlugin())
        bridge?.registerPluginInstance(WudaynReportExportPlugin())
        bridge?.registerPluginInstance(NisfaynPushPlugin())
        bridge?.registerPluginInstance(NisfaynVoicePlugin())
        bridge?.registerPluginInstance(NisfaynFeedbackPlugin())
        bridge?.registerPluginInstance(SocialAuthPlugin())
    }
}

@objc(SocialAuthPlugin)
final class SocialAuthPlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding, ASWebAuthenticationPresentationContextProviding {
    let identifier = "SocialAuthPlugin"
    let jsName = "SocialAuth"
    let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "apple", returnType: CAPPluginReturnPromise), CAPPluginMethod(name: "google", returnType: CAPPluginReturnPromise)]
    private var pending: CAPPluginCall?
    private var nonce: String?
    private var webSession: ASWebAuthenticationSession?

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor { bridge?.viewController?.view.window ?? ASPresentationAnchor() }
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor { bridge?.viewController?.view.window ?? ASPresentationAnchor() }
    private func finish(_ result: [String: Any]?, error: String? = nil) {
        let call = pending; pending = nil; nonce = nil; webSession = nil
        if let result { call?.resolve(result) } else { call?.reject(error ?? "تعذّر تسجيل الدخول.") }
    }
    @objc func apple(_ call: CAPPluginCall) {
        guard pending == nil else { call.reject("تسجيل الدخول جارٍ."); return }
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { call.reject("تعذّر بدء تسجيل الدخول."); return }
        let raw = Data(bytes).base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
        nonce = raw; pending = call
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.email, .fullName]
        request.nonce = SHA256.hash(data: Data(raw.utf8)).map { String(format: "%02x", $0) }.joined()
        let controller = ASAuthorizationController(authorizationRequests: [request]); controller.delegate = self; controller.presentationContextProvider = self; controller.performRequests()
    }
    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let token = (authorization.credential as? ASAuthorizationAppleIDCredential)?.identityToken,
              let idToken = String(data: token, encoding: .utf8), let nonce else { finish(nil); return }
        finish(["token": idToken, "nonce": nonce])
    }
    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) { finish(nil, error: error.localizedDescription) }

    @objc func google(_ call: CAPPluginCall) {
        guard pending == nil, let raw = call.getString("url"), let url = URL(string: raw),
              url.scheme == "https", url.host == "wupkifqbwhhebwrgvwai.supabase.co", url.path == "/auth/v1/authorize",
              let query = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems,
              query.first(where: { $0.name == "provider" })?.value == "google",
              query.first(where: { $0.name == "redirect_to" })?.value == "com.blindmatch.marriage://auth/callback" else { call.reject("رابط تسجيل الدخول غير صالح."); return }
        pending = call
        let session = ASWebAuthenticationSession(url: url, callbackURLScheme: "com.blindmatch.marriage") { [weak self] url, error in
            DispatchQueue.main.async {
                guard let self else { return }
                guard error == nil, let parts = url.flatMap({ URLComponents(url: $0, resolvingAgainstBaseURL: false) }),
                      parts.scheme == "com.blindmatch.marriage", parts.host == "auth", parts.path == "/callback", parts.fragment == nil,
                      parts.queryItems?.filter({ $0.name == "code" }).count == 1,
                      let code = parts.queryItems?.first(where: { $0.name == "code" })?.value, !code.isEmpty else { self.finish(nil, error: "أُلغي تسجيل الدخول أو تعذّر إكماله."); return }
                self.finish(["code": code])
            }
        }
        session.presentationContextProvider = self; webSession = session
        guard session.start() else { finish(nil, error: "تعذّر فتح Google."); return }
    }
}
