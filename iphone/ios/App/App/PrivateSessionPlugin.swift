import Capacitor
import Foundation
import Security
import UIKit
import LocalAuthentication

@objc(PrivateSessionPlugin)
final class PrivateSessionPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "PrivateSessionPlugin"
    let jsName = "PrivateSession"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "save", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "appearance", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setAppearance", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "privacyStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "privacyConfigure", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setCaptureScope", returnType: CAPPluginReturnPromise)
    ]

    @objc func appearance(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(["icon":UIApplication.shared.alternateIconName ?? "default", "supported":UIApplication.shared.supportsAlternateIcons, "callerName":UserDefaults.standard.bool(forKey:"nisfayn.calls.showName")])
        }
    }
    @objc func setAppearance(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard NisfaynPrivacy.shared.mayOpen else { call.reject("افتح قفل وُدَين أولًا.");return }
            if let show = call.getBool("callerName") { UserDefaults.standard.set(show,forKey:"nisfayn.calls.showName") }
            guard let icon = call.getString("icon") else { self.appearance(call);return }
            guard ["default","Quiet","Horizon"].contains(icon),UIApplication.shared.supportsAlternateIcons else { call.reject("هذه الأيقونة غير متاحة.");return }
            UIApplication.shared.setAlternateIconName(icon == "default" ? nil : icon) { error in
                DispatchQueue.main.async { if error != nil { call.reject("تعذّر تغيير الأيقونة. حاول مجددًا.") } else { self.appearance(call) } }
            }
        }
    }

    @objc func privacyStatus(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.resolve(NisfaynPrivacy.shared.status) }
    }

    @objc func setCaptureScope(_ call: CAPPluginCall) {
        guard let value = call.getString("scope"), let scope = CaptureScope(rawValue: value) else {
            call.reject("نطاق الخصوصية غير صالح.")
            return
        }
        DispatchQueue.main.async {
            (self.bridge?.viewController as? MarriageBridgeController)?.setProtectedContent(scope: scope)
            NisfaynPrivacy.shared.setCaptureScope(scope)
            call.resolve()
        }
    }

    @objc func privacyConfigure(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let enabled = call.getBool("enabled"), let delay = call.getInt("delay"), [0, 60, 300].contains(delay) else {
                call.reject("اختر إعدادًا صالحًا."); return
            }
            NisfaynPrivacy.shared.configure(enabled: enabled, delay: delay) { success in
                if success { call.resolve(NisfaynPrivacy.shared.status) }
                else { call.reject("لم يتم التحقق. بقي إعداد الخصوصية كما هو.") }
            }
        }
    }

    private func entry(for call: CAPPluginCall) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: "com.blindmatch.marriage.session",
         kSecAttrAccount as String: call.getString("key") ?? "account"]
    }

    @objc func read(_ call: CAPPluginCall) {
        var query = entry(for: call)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound {
            call.resolve(["token": NSNull()])
        } else if status == errSecSuccess, let data = result as? Data,
                  let token = String(data: data, encoding: .utf8) {
            call.resolve(["token": token])
        } else {
            call.reject("تعذّرت قراءة جلسة الدخول من جهازك.", "SESSION_READ")
        }
    }

    @objc func save(_ call: CAPPluginCall) {
        guard let token = call.getString("token"), !token.isEmpty else {
            call.reject("جلسة الدخول غير صالحة.", "SESSION_INVALID")
            return
        }
        let values: [String: Any] = [
            kSecValueData as String: Data(token.utf8),
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]
        let entry = entry(for: call)
        let record = entry.merging(values) { _, value in value }
        var status = SecItemAdd(record as CFDictionary, nil)
        if status == errSecDuplicateItem {
            status = SecItemUpdate(entry as CFDictionary, values as CFDictionary)
        }
        if status == errSecSuccess {
            call.resolve()
        } else {
            call.reject("تعذّر حفظ جلسة الدخول على جهازك.", "SESSION_SAVE")
        }
    }

    @objc func clear(_ call: CAPPluginCall) {
        let status = SecItemDelete(entry(for: call) as CFDictionary)
        if status == errSecSuccess || status == errSecItemNotFound {
            call.resolve()
        } else {
            call.reject("تعذّر حذف جلسة الدخول من جهازك.", "SESSION_CLEAR")
        }
    }
}

enum CaptureScope: String {
    case publicScreen = "public"
    case discovery, profile, chat

    var heading: String { self == .chat ? "هذه المحادثة خاصة" : "خصوصيتنا أمانة" }
}

// A solid, member-independent background also serves as the underlay behind
// the existing protected one-time photo renderer.
final class WudaynPrivacyNote: UIView {
    private let ivory = UIColor(red: 1, green: 0.97, blue: 0.91, alpha: 1)
    let heading = UILabel()
    let detail = UILabel()
    let button = UIButton(type: .system)

    override init(frame: CGRect) {
        super.init(frame: frame)
        autoresizingMask = [.flexibleWidth, .flexibleHeight]
        backgroundColor = UIColor(red: 0.267, green: 0.075, blue: 0.153, alpha: 1)
        isOpaque = true
        contentMode = .redraw
        accessibilityViewIsModal = true
        semanticContentAttribute = .forceRightToLeft

        let wordmark = UILabel()
        wordmark.text = "وُدَين"
        wordmark.font = UIFontMetrics(forTextStyle: .largeTitle).scaledFont(for: .systemFont(ofSize: 48, weight: .semibold))
        heading.font = .preferredFont(forTextStyle: .title2)
        detail.font = .preferredFont(forTextStyle: .body)
        for label in [wordmark, heading, detail] {
            label.textColor = ivory
            label.textAlignment = .center
            label.numberOfLines = 0
            label.adjustsFontForContentSizeCategory = true
        }
        heading.accessibilityTraits.insert(.header)
        detail.textColor = UIColor(red: 0.94, green: 0.83, blue: 0.80, alpha: 1)
        var configuration = UIButton.Configuration.tinted()
        configuration.baseForegroundColor = ivory
        configuration.baseBackgroundColor = ivory
        configuration.cornerStyle = .capsule
        button.configuration = configuration
        button.isHidden = true
        let touchHeight = button.heightAnchor.constraint(greaterThanOrEqualToConstant: 44)
        touchHeight.priority = .defaultHigh
        touchHeight.isActive = true

        let stack = UIStackView(arrangedSubviews: [wordmark, heading, detail, button])
        if let path = Bundle.main.path(forResource: "wudayn-emblem-v2", ofType: "png", inDirectory: "public/brand"),
           let image = UIImage(contentsOfFile: path) {
            let seal = UIView()
            seal.layer.borderWidth = 1
            seal.layer.borderColor = UIColor(red: 0.86, green: 0.73, blue: 0.58, alpha: 0.55).cgColor
            seal.layer.cornerRadius = 32
            let mark = UIImageView(image: image.withRenderingMode(.alwaysTemplate))
            mark.contentMode = .scaleAspectFit
            mark.tintColor = ivory
            mark.translatesAutoresizingMaskIntoConstraints = false
            seal.addSubview(mark)
            stack.insertArrangedSubview(seal, at: 0)
            NSLayoutConstraint.activate([
                seal.widthAnchor.constraint(equalToConstant: 64), seal.heightAnchor.constraint(equalToConstant: 64),
                mark.centerXAnchor.constraint(equalTo: seal.centerXAnchor), mark.centerYAnchor.constraint(equalTo: seal.centerYAnchor),
                mark.widthAnchor.constraint(equalToConstant: 36), mark.heightAnchor.constraint(equalToConstant: 40)
            ])
        }
        stack.axis = .vertical
        stack.spacing = 8
        stack.alignment = .center
        stack.setCustomSpacing(20, after: wordmark)
        stack.setCustomSpacing(18, after: detail)
        stack.translatesAutoresizingMaskIntoConstraints = false
        let scroll = UIScrollView()
        scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.alwaysBounceVertical = false
        addSubview(scroll)
        scroll.addSubview(stack)
        let guide = scroll.contentLayoutGuide
        let centerHeight = guide.heightAnchor.constraint(equalTo: scroll.frameLayoutGuide.heightAnchor)
        centerHeight.priority = .defaultLow
        NSLayoutConstraint.activate([
            scroll.leadingAnchor.constraint(equalTo: safeAreaLayoutGuide.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: safeAreaLayoutGuide.trailingAnchor),
            scroll.topAnchor.constraint(equalTo: safeAreaLayoutGuide.topAnchor),
            scroll.bottomAnchor.constraint(equalTo: safeAreaLayoutGuide.bottomAnchor),
            guide.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor),
            guide.heightAnchor.constraint(greaterThanOrEqualTo: scroll.frameLayoutGuide.heightAnchor),
            centerHeight,
            stack.centerYAnchor.constraint(equalTo: guide.centerYAnchor),
            stack.topAnchor.constraint(greaterThanOrEqualTo: guide.topAnchor, constant: 20),
            stack.leadingAnchor.constraint(equalTo: guide.leadingAnchor, constant: 28),
            stack.trailingAnchor.constraint(equalTo: guide.trailingAnchor, constant: -28)
        ])
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func draw(_ rect: CGRect) {
        super.draw(rect)
        let radius = min(bounds.width, bounds.height) * 0.80
        UIColor(red: 0.86, green: 0.69, blue: 0.53, alpha: 0.28).setStroke()
        for center in [CGPoint(x: bounds.minX, y: bounds.minY - radius * 0.50),
                       CGPoint(x: bounds.maxX, y: bounds.maxY + radius * 0.50)] {
            for inset: CGFloat in [0, 9] {
                let arc = UIBezierPath(arcCenter: center, radius: radius + inset, startAngle: 0, endAngle: 2 * .pi, clockwise: true)
                arc.lineWidth = 1
                arc.stroke()
            }
        }
    }
}

final class NisfaynPrivacy: NSObject {
    static let shared = NisfaynPrivacy()
    private weak var window: UIWindow?
    private var cover: WudaynPrivacyNote?
    private enum Reason: Equatable {
        case inactive, locked, recording(CaptureScope), screenshot(CaptureScope)
    }
    private var visibleReason: Reason?
    private var inactive = true
    // Start covered during capture until the web app declares its first scope.
    // The separate SwiftUI target uses this conservative default across its sheets.
    private var scope: CaptureScope = .profile
    private var screenshotScope: CaptureScope?
    private var context: LAContext?
    private var unlocked = false
    private var backgroundAt: Date?
    private var attempt = UUID()
    private var autoUnlock = true
    private var enabled: Bool { UserDefaults.standard.bool(forKey: "nisfayn.privacy.lock") }
    private var delay: Int { UserDefaults.standard.integer(forKey: "nisfayn.privacy.delay") }
    var mayOpen: Bool { UIApplication.shared.applicationState == .active && visibleReason == nil && (!enabled || unlocked) }
    var status: [String: Any] {
        let ctx = LAContext()
        var biometry = "none"
        if ctx.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil) {
            switch ctx.biometryType {
            case .faceID: biometry = "Face ID"
            case .touchID: biometry = "Touch ID"
            default: break
            }
        }
        return ["enabled": enabled, "delay": delay, "biometry": biometry,
                "available": ctx.canEvaluatePolicy(.deviceOwnerAuthentication, error: nil)]
    }
    func attach(_ window: UIWindow) {
        guard self.window !== window else { return }
        NotificationCenter.default.removeObserver(self)
        cover?.removeFromSuperview()
        cover = nil
        visibleReason = nil
        screenshotScope = nil
        self.window = window
        if #available(iOS 17.0, *) {
            window.registerForTraitChanges([UITraitSceneCaptureState.self]) { [weak self] (source: UIWindow, _: UITraitCollection) in
                guard let self, self.window === source else { return }
                self.refreshCover()
            }
        }
        NotificationCenter.default.addObserver(self, selector: #selector(refreshCover), name: UIScreen.capturedDidChangeNotification, object: window.screen)
        NotificationCenter.default.addObserver(self, selector: #selector(tookScreenshot), name: UIApplication.userDidTakeScreenshotNotification, object: nil)
        shield()
    }

    func setCaptureScope(_ next: CaptureScope) {
        if next != scope { screenshotScope = nil }
        scope = next
        refreshCover()
    }

    private var recording: Bool {
        guard let window else { return false }
        if #available(iOS 17.0, *), window.traitCollection.sceneCaptureState == .active { return true }
        return window.screen.isCaptured
    }

    @objc private func tookScreenshot() {
        // UIKit posts this notification AFTER saving the screenshot.
        guard scope != .publicScreen, !inactive, visibleReason == nil else { return }
        screenshotScope = scope
        refreshCover()
    }

    @objc private func coverAction() {
        switch visibleReason {
        case .locked: unlock()
        case .screenshot:
            screenshotScope = nil
            refreshCover()
        default: break
        }
    }

    @objc private func refreshCover() {
        guard let window else { return }
        #if canImport(Capacitor)
        defer {
            // A UIKit cover is invisible to WebKit's document.hidden flag.
            let event = cover == nil ? "wudayn:privacy-visible" : "wudayn:privacy-covered"
            (window.rootViewController as? MarriageBridgeController)?.bridge?.triggerWindowJSEvent(eventName: event)
        }
        #endif
        let reason: Reason
        if inactive { reason = .inactive }
        else if enabled && !unlocked { reason = .locked }
        else if scope != .publicScreen && recording { reason = .recording(scope) }
        else if let screenshotScope { reason = .screenshot(screenshotScope) }
        else {
            guard cover != nil else { return }
            cover?.removeFromSuperview()
            cover = nil
            visibleReason = nil
            UIAccessibility.post(notification: .screenChanged, argument: nil)
            NotificationCenter.default.post(name: NisfaynPushCenter.openEvent, object: nil)
            return
        }

        if let cover, reason == visibleReason {
            window.bringSubviewToFront(cover)
            return
        }
        let note = cover ?? WudaynPrivacyNote(frame: window.bounds)
        if cover == nil {
            window.endEditing(true)
            note.button.addTarget(self, action: #selector(coverAction), for: .touchUpInside)
            window.addSubview(note)
            cover = note
        }
        visibleReason = reason
        note.button.isHidden = true
        switch reason {
        case .inactive, .locked:
            note.heading.text = "مساحتك الخاصة"
            note.detail.text = nil
            note.button.configuration?.title = "فتح وُدَين"
            note.button.isHidden = reason != .locked
        case .recording(let scope):
            note.heading.text = scope.heading
            note.detail.text = "أوقف تسجيل الشاشة أو مشاركتها للمتابعة."
        case .screenshot(let scope):
            note.heading.text = scope.heading
            note.detail.text = "التقطت لقطة شاشة. استأذن قبل مشاركة ما تراه هنا."
            note.button.configuration?.title = "العودة"
            note.button.isHidden = false
        }
        window.bringSubviewToFront(note)
        if !inactive { UIAccessibility.post(notification: .screenChanged, argument: note.heading) }
    }

    func shield() {
        inactive = true
        refreshCover()
    }
    func background() {
        backgroundAt = Date(); autoUnlock = true; attempt = UUID(); context?.invalidate(); context = nil; shield()
    }
    func active() {
        inactive = false
        if let backgroundAt, Date().timeIntervalSince(backgroundAt) >= Double(delay) { unlocked = false }
        backgroundAt = nil
        refreshCover()
        if enabled && !unlocked && autoUnlock && context == nil {
            autoUnlock = false
            unlock()
        }
    }
    @objc private func unlock() {
        guard UIApplication.shared.applicationState == .active, context == nil else { return }
        if !enabled { refreshCover(); return }
        authenticate { [weak self] ok in
            guard let self, ok else { return }
            self.unlocked = true
            if UIApplication.shared.applicationState == .active { self.refreshCover() }
        }
    }
    private func authenticate(_ completion: @escaping (Bool) -> Void) {
        guard context == nil else { completion(false); return }
        let ctx = LAContext(); ctx.localizedCancelTitle = "إلغاء"
        guard ctx.canEvaluatePolicy(.deviceOwnerAuthentication, error: nil) else { completion(false); return }
        let id = UUID(); attempt = id; context = ctx
        ctx.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "للحفاظ على خصوصية حسابك ومحادثاتك في وُدَين") { [weak self] ok, _ in
            DispatchQueue.main.async {
                guard let self, self.attempt == id else { completion(false); return }
                self.context = nil; completion(ok)
            }
        }
    }
    func configure(enabled: Bool, delay: Int, completion: @escaping (Bool) -> Void) {
        authenticate { [weak self] ok in
            guard let self, ok else { completion(false); return }
            UserDefaults.standard.set(enabled, forKey: "nisfayn.privacy.lock")
            UserDefaults.standard.set(delay, forKey: "nisfayn.privacy.delay")
            self.unlocked = true
            if UIApplication.shared.applicationState == .active { self.refreshCover() }
            completion(true)
        }
    }
}
