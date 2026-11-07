import Capacitor
import UIKit
import UserNotifications

final class NisfaynPushCenter: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NisfaynPushCenter()
    static let tokenEvent = Notification.Name("NisfaynPushToken")
    static let failureEvent = Notification.Name("NisfaynPushFailure")
    static let openEvent = Notification.Name("NisfaynPushOpen")
    var token: String?
    var pendingOpen: [String: String]?
    let installation: String = {
        let key = "nisfayn.push.installation"
        if let saved = UserDefaults.standard.string(forKey: key), UUID(uuidString: saved) != nil { return saved }
        let value = UUID().uuidString.lowercased()
        UserDefaults.standard.set(value, forKey: key)
        return value
    }()
    var environment: String { Bundle.main.object(forInfoDictionaryKey: "NisfaynAPNsEnvironment") as? String ?? "sandbox" }

    func receivedToken(_ value: Data) {
        token = value.map { String(format: "%02x", $0) }.joined()
        NotificationCenter.default.post(name: Self.tokenEvent, object: nil)
    }
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        // Foreground chat already refreshes privately; do not display duplicate banners.
        completionHandler([])
    }
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        let info = response.notification.request.content.userInfo
        if let id = info["requestId"] as? String, UUID(uuidString: id) != nil,
           let kind = info["kind"] as? String, ["request", "mutual", "message"].contains(kind) {
            DispatchQueue.main.async {
                self.pendingOpen = ["requestId": id, "kind": kind]
                NotificationCenter.default.post(name: Self.openEvent, object: nil)
            }
        }
        completionHandler()
    }
}

@objc(NisfaynPushPlugin)
final class NisfaynPushPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "NisfaynPushPlugin"
    let jsName = "NisfaynPush"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "register", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unregister", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "consumeOpen", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise)
    ]
    private var registration: CAPPluginCall?
    private var timeout: DispatchWorkItem?

    override func load() {
        NotificationCenter.default.addObserver(self, selector: #selector(tokenReceived), name: NisfaynPushCenter.tokenEvent, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(registrationFailed), name: NisfaynPushCenter.failureEvent, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(notificationOpened), name: NisfaynPushCenter.openEvent, object: nil)
    }
    deinit { NotificationCenter.default.removeObserver(self); timeout?.cancel() }

    private func device() -> [String: Any] {
        let center = NisfaynPushCenter.shared
        return ["token": center.token as Any? ?? NSNull(), "installationId": center.installation, "environment": center.environment]
    }
    @objc private func tokenReceived() {
        DispatchQueue.main.async {
            self.timeout?.cancel()
            self.registration?.resolve(self.device()); self.registration = nil
            self.notifyListeners("registration", data: self.device())
        }
    }
    @objc private func registrationFailed() {
        DispatchQueue.main.async {
            self.timeout?.cancel()
            self.registration?.reject("تعذّر تسجيل الإشعارات. حاول مجددًا.", "PUSH_REGISTER")
            self.registration = nil
        }
    }
    @objc private func notificationOpened() {
        if let payload = NisfaynPushCenter.shared.pendingOpen { notifyListeners("opened", data: payload) }
    }
    @objc func consumeOpen(_ call: CAPPluginCall) {
        let payload = NisfaynPushCenter.shared.pendingOpen
        NisfaynPushCenter.shared.pendingOpen = nil
        call.resolve(["notification": payload as Any? ?? NSNull()])
    }
    @objc func status(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            let allowed = settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional
            call.resolve(["permission": allowed ? "granted" : settings.authorizationStatus == .notDetermined ? "prompt" : "denied",
                          "installationId": NisfaynPushCenter.shared.installation])
        }
    }
    @objc func register(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.registration == nil else { call.reject("التسجيل قيد التنفيذ.", "PUSH_BUSY"); return }
            self.registration = call
            UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
                DispatchQueue.main.async {
                    guard granted else { self.registration?.reject("يمكنك السماح بالإشعارات من إعدادات iPhone.", "PUSH_DENIED"); self.registration = nil; return }
                    let expiry = DispatchWorkItem { [weak self] in self?.registrationFailed() }
                    self.timeout = expiry
                    DispatchQueue.main.asyncAfter(deadline: .now() + 15, execute: expiry)
                    UIApplication.shared.registerForRemoteNotifications()
                }
            }
        }
    }
    @objc func unregister(_ call: CAPPluginCall) {
        DispatchQueue.main.async { UIApplication.shared.unregisterForRemoteNotifications(); call.resolve() }
    }
    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let url = URL(string: UIApplication.openSettingsURLString) else { call.reject("تعذّر فتح الإعدادات."); return }
            UIApplication.shared.open(url) { _ in call.resolve() }
        }
    }
}
