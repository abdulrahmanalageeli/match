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
        CAPPluginMethod(name: "privacyConfigure", returnType: CAPPluginReturnPromise)
    ]

    @objc func appearance(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(["icon":UIApplication.shared.alternateIconName ?? "default", "supported":UIApplication.shared.supportsAlternateIcons, "callerName":UserDefaults.standard.bool(forKey:"nisfayn.calls.showName")])
        }
    }
    @objc func setAppearance(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard NisfaynPrivacy.shared.mayOpen else { call.reject("افتح قفل نصفين أولًا.");return }
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

/// Native cover protects snapshots and blocks web content until device authentication.
/// Device passcode is an intentional fallback when biometrics are unavailable.
final class NisfaynPrivacy: NSObject {
    static let shared = NisfaynPrivacy()
    private weak var window: UIWindow?
    private var cover: UIView?
    private var context: LAContext?
    private var unlocked = false
    private var backgroundAt: Date?
    private var attempt = UUID()
    private var autoUnlock = true
    private var enabled: Bool { UserDefaults.standard.bool(forKey: "nisfayn.privacy.lock") }
    private var delay: Int { UserDefaults.standard.integer(forKey: "nisfayn.privacy.delay") }
    var mayOpen: Bool { UIApplication.shared.applicationState == .active && (!enabled || unlocked) }
    var status: [String: Any] {
        let ctx = LAContext()
        return ["enabled": enabled, "delay": delay, "available": ctx.canEvaluatePolicy(.deviceOwnerAuthentication, error: nil)]
    }
    func attach(_ window: UIWindow) { self.window = window; shield() }
    func shield() {
        guard cover == nil, let window else { return }
        let view = UIView(frame: window.bounds)
        view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.backgroundColor = UIColor(red: 0.99, green: 0.99, blue: 0.98, alpha: 1)
        view.accessibilityViewIsModal = true
        let title = UILabel()
        title.text = "نصفين"
        title.font = .systemFont(ofSize: 32, weight: .semibold)
        title.textColor = UIColor(red: 0.33, green: 0.08, blue: 0.16, alpha: 1)
        title.textAlignment = .center
        let detail = UILabel()
        detail.text = "مساحتك الخاصة"
        detail.textAlignment = .center
        detail.font = .preferredFont(forTextStyle: .body)
        detail.textColor = .secondaryLabel
        let button = UIButton(type: .system)
        button.setTitle("فتح نصفين", for: .normal)
        button.titleLabel?.font = .preferredFont(forTextStyle: .headline)
        button.addTarget(self, action: #selector(unlock), for: .touchUpInside)
        let stack = UIStackView(arrangedSubviews: [title, detail, button])
        stack.axis = .vertical; stack.spacing = 20; stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([stack.centerXAnchor.constraint(equalTo: view.centerXAnchor), stack.centerYAnchor.constraint(equalTo: view.centerYAnchor)])
        window.addSubview(view); cover = view
    }
    func background() {
        backgroundAt = Date(); autoUnlock = true; attempt = UUID(); context?.invalidate(); context = nil; shield()
    }
    func active() {
        guard context == nil else { return }
        if let backgroundAt, Date().timeIntervalSince(backgroundAt) >= Double(delay) { unlocked = false }
        backgroundAt = nil
        if !enabled || unlocked { reveal() }
        else if autoUnlock { autoUnlock = false; unlock() }
        else { shield() }
    }
    private func reveal() {
        cover?.removeFromSuperview(); cover = nil
        NotificationCenter.default.post(name:NisfaynPushCenter.openEvent,object:nil)
    }
    @objc private func unlock() {
        guard UIApplication.shared.applicationState == .active, context == nil else { return }
        if !enabled { reveal(); return }
        authenticate { [weak self] ok in
            guard let self, ok else { return }
            self.unlocked = true
            if UIApplication.shared.applicationState == .active { self.reveal() }
        }
    }
    private func authenticate(_ completion: @escaping (Bool) -> Void) {
        guard context == nil else { completion(false); return }
        let ctx = LAContext(); ctx.localizedCancelTitle = "إلغاء"
        guard ctx.canEvaluatePolicy(.deviceOwnerAuthentication, error: nil) else { completion(false); return }
        let id = UUID(); attempt = id; context = ctx
        ctx.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "للحفاظ على خصوصية حسابك ومحادثاتك في نصفين") { [weak self] ok, _ in
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
            if UIApplication.shared.applicationState == .active { self.reveal() }
            completion(true)
        }
    }
}
