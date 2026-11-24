import Capacitor
import UIKit
import WebKit
import AuthenticationServices
import CryptoKit
import Security

final class MarriageBridgeController: CAPBridgeViewController {
    private let content = UIView()
    private var secureField: PhotoSecureField?
    private var backing: WudaynPrivacyNote?
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
        // Capacitor has created its WKWebView. Keep that same instance, its
        // delegates, and its navigation history for the life of the bridge.
        if let webView {
            content.frame = webView.frame
            content.backgroundColor = .systemBackground
            view = content
            webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            content.addSubview(webView)
            content.accessibilityElements = [webView]
        }
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

    func setProtectedContent(scope: CaptureScope) {
        guard let webView else { return }
        if scope == .publicScreen {
            guard secureField != nil else { return }
            content.addSubview(webView)
            webView.frame = content.bounds
            secureField?.removeFromSuperview()
            secureField = nil
            backing?.removeFromSuperview()
            backing = nil
            return
        }
        if let backing {
            backing.heading.text = scope.heading
            return
        }

        // This is the same best-effort UIKit canvas as the one-time viewer.
        // If unavailable, keep the page usable with its web deterrents and
        // the independent native recording/switcher cover.
        let field = PhotoSecureField(frame: content.bounds)
        field.isSecureTextEntry = true
        field.text = " "
        field.textColor = .clear
        field.tintColor = .clear
        field.backgroundColor = .clear
        field.isAccessibilityElement = false
        field.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        guard let canvas = field.canvas() else { return }
        canvas.isUserInteractionEnabled = true
        canvas.isAccessibilityElement = false
        // Leave scrolling, selection, long press and text input to WebKit.
        for item in [field as UIView, canvas] {
            item.gestureRecognizers?.forEach { $0.isEnabled = false }
        }
        let note = WudaynPrivacyNote(frame: content.bounds)
        note.heading.text = scope.heading
        note.detail.text = "استأذن قبل مشاركة ما تراه هنا."
        note.isUserInteractionEnabled = false
        note.accessibilityViewIsModal = false
        note.accessibilityElementsHidden = true
        content.insertSubview(note, at: 0)
        content.addSubview(field)
        canvas.addSubview(webView)
        field.interactiveContent = webView
        webView.frame = canvas.bounds
        secureField = field
        backing = note
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
        DispatchQueue.main.async { self.startGoogle(call) }
    }

    private func startGoogle(_ call: CAPPluginCall) {
        guard pending == nil else { call.reject("تسجيل الدخول جارٍ."); return }
        guard let raw = call.getString("url"), let url = URL(string: raw),
              url.scheme == "https", url.host == "wupkifqbwhhebwrgvwai.supabase.co", url.path == "/auth/v1/authorize",
              let query = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems,
              query.first(where: { $0.name == "provider" })?.value == "google",
              query.first(where: { $0.name == "redirect_to" })?.value == "com.blindmatch.marriage://auth/callback" else { call.reject("رابط تسجيل الدخول غير صالح."); return }
        pending = call
        let session = ASWebAuthenticationSession(url: url, callbackURLScheme: "com.blindmatch.marriage") { [weak self] url, error in
            DispatchQueue.main.async {
                guard let self else { return }
                if let error {
                    let cancelled = (error as? ASWebAuthenticationSessionError)?.code == .canceledLogin
                    self.finish(nil, error: cancelled ? "أُغلقت نافذة Google. للمتابعة، سجّل الدخول بالحساب نفسه." : "تعذّر الرجوع من Google إلى وُدَين. حاول تسجيل الدخول مرة أخرى.")
                    return
                }
                guard let parts = url.flatMap({ URLComponents(url: $0, resolvingAgainstBaseURL: false) }),
                      parts.scheme == "com.blindmatch.marriage", parts.host == "auth", parts.path == "/callback",
                      parts.user == nil, parts.password == nil, parts.port == nil,
                      let items = parts.queryItems,
                      !items.contains(where: { ["error", "error_code", "error_description"].contains($0.name) }),
                      ["", "sb="].contains(parts.percentEncodedFragment ?? ""),
                      items.filter({ $0.name == "code" }).count == 1,
                      let code = items.first(where: { $0.name == "code" })?.value, !code.isEmpty else {
                    self.finish(nil, error: "لم يصل رمز تسجيل الدخول من Google. أعد المحاولة باستخدام حساب Google نفسه.")
                    return
                }
                self.finish(["code": code])
            }
        }
        session.presentationContextProvider = self; webSession = session
        guard session.start() else { finish(nil, error: "تعذّر فتح Google."); return }
    }
}
