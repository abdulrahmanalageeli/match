import Capacitor
import UIKit
import WebKit
import AVFoundation
import CoreImage
import AuthenticationServices
import CryptoKit
import Security

final class MarriageBridgeController: CAPBridgeViewController {
    private let content = UIView()
    private var secureField: PhotoSecureField?
    private var backing: WudaynPrivacyNote?
    private(set) var discoveryPortraitsEnabled = false
    private var portraits: [String: DiscoveryPortraitView] = [:]
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
            if webView.isLoading {
                self?.clearPortraits()
                return
            }
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

    func setProtectedContent(scope: CaptureScope, portraitOnly: Bool) {
        discoveryPortraitsEnabled = scope == .discovery && portraitOnly
        if !discoveryPortraitsEnabled {
            clearPortraits()
        }
        guard let webView else { return }
        if scope == .publicScreen || discoveryPortraitsEnabled {
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
            backing.setArtwork(for: scope)
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
        note.setArtwork(for: scope)
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

    func removePortrait(_ id: String) {
        portraits.removeValue(forKey: id)?.removeFromSuperview()
    }

    private func clearPortraits() {
        portraits.values.forEach { $0.removeFromSuperview() }
        portraits.removeAll()
    }

    // WebKit owns all labels and hit targets. Only the authorized bitmap is
    // mounted in a capture-excluded layer above the matching artwork in HTML.
    func placePortrait(_ id: String, frame: CGRect, radius: CGFloat, image: UIImage?, cutouts: [CGRect]) -> Bool {
        guard discoveryPortraitsEnabled, let webView, frame.width > 0, frame.height > 0 else { return false }
        let scroll = webView.scrollView
        let field: DiscoveryPortraitView
        if let existing = portraits[id] {
            field = existing
        } else {
            guard let image, let portrait = DiscoveryPortraitView(image: image) else { return false }
            field = portrait
            scroll.addSubview(field)
            portraits[id] = field
        }
        field.frame = frame.offsetBy(dx: scroll.contentOffset.x, dy: scroll.contentOffset.y)
        field.layer.cornerRadius = radius
        // Preserve fixed bars and badges when they overlap a partial portrait.
        var path = CGPath(rect: field.bounds, transform: nil)
        for cutout in cutouts {
            let intersection = frame.intersection(cutout)
            if !intersection.isNull {
                let hole = intersection.offsetBy(dx: -frame.minX, dy: -frame.minY)
                path = path.subtracting(CGPath(rect: hole, transform: nil))
            }
        }
        if cutouts.isEmpty { field.layer.mask = nil }
        else {
            let mask = CAShapeLayer()
            mask.frame = field.bounds
            mask.path = path
            field.layer.mask = mask
        }
        return true
    }
}

// A still portrait is one video frame. AVFoundation can exclude this layer
// from system capture without putting the WKWebView inside a secure field.
private final class DiscoveryPortraitView: UIView {
    private static let context = CIContext(options: [.cacheIntermediates: false])
    private let display = AVSampleBufferDisplayLayer()
    private let field = PhotoSecureField()

    init?(image: UIImage) {
        super.init(frame: CGRect(x: 0, y: 0, width: 64, height: 64))
        guard let cg = image.cgImage, cg.width <= 1024, cg.height <= 1024 else { return nil }
        display.preventsCapture = true
        display.videoGravity = .resizeAspectFill
        // Exclude the entire photo surface, including the video renderer's
        // own capture fill, so the public artwork underneath can show through.
        isOpaque = false
        backgroundColor = .clear
        field.frame = bounds
        field.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        field.isSecureTextEntry = true
        field.text = " "
        field.textColor = .clear
        field.backgroundColor = .clear
        addSubview(field)
        guard let canvas = field.canvas() else { return nil }
        canvas.layer.addSublayer(display)
        isUserInteractionEnabled = false
        accessibilityElementsHidden = true
        clipsToBounds = true

        var pixels: CVPixelBuffer?
        let attributes = [kCVPixelBufferIOSurfacePropertiesKey: [:] as NSDictionary] as CFDictionary
        guard CVPixelBufferCreate(kCFAllocatorDefault, cg.width, cg.height, kCVPixelFormatType_32BGRA,
                                  attributes, &pixels) == kCVReturnSuccess, let pixels else { return nil }
        Self.context.render(CIImage(cgImage: cg), to: pixels)
        var format: CMVideoFormatDescription?
        guard CMVideoFormatDescriptionCreateForImageBuffer(allocator: kCFAllocatorDefault, imageBuffer: pixels,
                                                            formatDescriptionOut: &format) == noErr, let format else { return nil }
        var timing = CMSampleTimingInfo(duration: .invalid, presentationTimeStamp: .zero, decodeTimeStamp: .invalid)
        var sample: CMSampleBuffer?
        guard CMSampleBufferCreateReadyWithImageBuffer(allocator: kCFAllocatorDefault, imageBuffer: pixels,
                  formatDescription: format, sampleTiming: &timing, sampleBufferOut: &sample) == noErr,
              let sample, let attachments = CMSampleBufferGetSampleAttachmentsArray(sample, createIfNecessary: true) else { return nil }
        let settings = unsafeBitCast(CFArrayGetValueAtIndex(attachments, 0), to: CFMutableDictionary.self)
        CFDictionarySetValue(settings, Unmanaged.passUnretained(kCMSampleAttachmentKey_DisplayImmediately).toOpaque(),
                             Unmanaged.passUnretained(kCFBooleanTrue).toOpaque())
        display.enqueue(sample)
    }
    override func layoutSubviews() {
        super.layoutSubviews()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        display.frame = bounds
        CATransaction.commit()
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
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
