import Capacitor
import UIKit
import WebKit
import AVFoundation
import CoreImage
import ImageIO
import AuthenticationServices
import CryptoKit
import Security

private final class MarriageWebView: WKWebView {
    var chatKeyboard = false
    override var inputAccessoryView: UIView? {
        chatKeyboard ? nil : super.inputAccessoryView
    }
}

final class MarriageBridgeController: CAPBridgeViewController {
    override func webView(with frame: CGRect, configuration: WKWebViewConfiguration) -> WKWebView {
        MarriageWebView(frame: frame, configuration: configuration)
    }

    private let content = UIView()
    private var secureField: PhotoSecureField?
    private var backing: WudaynPrivacyNote?
    private(set) var discoveryPortraitsEnabled = false
    private var portraits: [String: DiscoveryPortraitView] = [:]
    private let portraitDecoder: OperationQueue = {
        let queue = OperationQueue()
        queue.name = "com.wudayn.discovery-portraits"
        queue.qualityOfService = .userInitiated
        queue.maxConcurrentOperationCount = 1
        return queue
    }()
    private var pendingPortraits: [String: DiscoveryFrameDecode] = [:]
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
        if let chatView = webView as? MarriageWebView {
            chatView.chatKeyboard = scope == .chat
        }
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
            backing.setArtwork(for: scope, isScreenshotBacking: true)
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
        note.setArtwork(for: scope, isScreenshotBacking: true)
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
        pendingPortraits.removeValue(forKey: id)?.cancel()
        portraits.removeValue(forKey: id)?.removeFromSuperview()
    }

    private func clearPortraits() {
        portraitDecoder.cancelAllOperations()
        pendingPortraits.removeAll()
        portraits.values.forEach { $0.removeFromSuperview() }
        portraits.removeAll()
    }

    func updatePortrait(_ id: String, frame: CGRect, measuredOffset: CGPoint?, radius: CGFloat,
                        encoded: String?, cutouts: [CGRect], completion: @escaping (Bool) -> Void) {
        if portraits[id] != nil || encoded == nil {
            completion(placePortrait(id, frame: frame, measuredOffset: measuredOffset, radius: radius, sample: nil, cutouts: cutouts))
            return
        }
        guard let encoded, encoded.utf8.count <= 1024 * 1024 else { completion(false); return }
        // A canceled job may already be decoding. Only its original placement
        // is allowed to consume the result, even after a route or account change.
        let request = DiscoveryFrameDecode(encoded)
        pendingPortraits[id]?.cancel()
        pendingPortraits[id] = request
        request.completionBlock = { [weak self, weak request] in
            DispatchQueue.main.async {
                guard let self, let request, self.pendingPortraits[id] === request else { completion(false); return }
                self.pendingPortraits.removeValue(forKey: id)
                guard !request.isCancelled, NisfaynPrivacy.shared.mayOpen else { completion(false); return }
                completion(self.placePortrait(id, frame: frame, measuredOffset: measuredOffset,
                                              radius: radius, sample: request.sample, cutouts: cutouts))
            }
        }
        portraitDecoder.addOperation(request)
    }

    // WebKit owns all labels and hit targets. Only the authorized bitmap is
    // mounted in a capture-excluded layer above the matching artwork in HTML.
    private func placePortrait(_ id: String, frame: CGRect, measuredOffset: CGPoint?, radius: CGFloat, sample: CMSampleBuffer?, cutouts: [CGRect]) -> Bool {
        guard discoveryPortraitsEnabled, let webView, frame.width > 0, frame.height > 0 else { return false }
        let scroll = webView.scrollView
        let field: DiscoveryPortraitView
        if let existing = portraits[id] {
            field = existing
        } else {
            guard let sample, let portrait = DiscoveryPortraitView(sample: sample) else { return false }
            field = portrait
            scroll.addSubview(field)
            portraits[id] = field
        }
        // The JS measurement and this callback can land on different scroll frames.
        let offset = measuredOffset ?? scroll.contentOffset
        field.frame = frame.offsetBy(dx: offset.x, dy: offset.y)
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
    private let display = AVSampleBufferDisplayLayer()
    private let field = PhotoSecureField()

    init?(sample: CMSampleBuffer) {
        super.init(frame: CGRect(x: 0, y: 0, width: 64, height: 64))
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
        // Cover the capture artwork during the first render commit. The
        // placeholder is inside the secure canvas alongside the video layer.
        canvas.backgroundColor = UIColor(red: 239/255, green: 237/255, blue: 238/255, alpha: 1)
        canvas.layer.addSublayer(display)
        isUserInteractionEnabled = false
        accessibilityElementsHidden = true
        clipsToBounds = true

        display.enqueue(sample)
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        // The renderer belongs to the text canvas, whose bounds origin may
        // differ from the outer portrait after UIKit lays the secure field out.
        if let canvas = field.canvas() { display.frame = canvas.convert(bounds, from: self) }
        CATransaction.commit()
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
}

private final class DiscoveryFrameDecode: Operation, @unchecked Sendable {
    private let encoded: String
    private(set) var sample: CMSampleBuffer?
    init(_ encoded: String) { self.encoded = encoded }
    override func main() {
        if !isCancelled { sample = Self.makeSample(encoded) }
    }

    private static let context = CIContext(options: [.cacheIntermediates: false])

    static func makeSample(_ encoded: String) -> CMSampleBuffer? {
        guard let data = Data(base64Encoded: encoded),
              let source = CGImageSourceCreateWithData(data as CFData, nil),
              let cg = CGImageSourceCreateImageAtIndex(source, 0, nil),
              cg.width <= 1024, cg.height <= 1024 else { return nil }
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
        return sample
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
