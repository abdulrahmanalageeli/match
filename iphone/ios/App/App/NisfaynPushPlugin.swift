import Capacitor
import UIKit
import UserNotifications

final class NisfaynPushCenter: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NisfaynPushCenter()
    static let tokenEvent = Notification.Name("NisfaynPushToken")
    static let failureEvent = Notification.Name("NisfaynPushFailure")
    static let openEvent = Notification.Name("NisfaynPushOpen")
    var token: String?
    var pending: [[String:String]] = []
    var pendingOpen: [String:String]? { pending.first }
    var scope: String? { UserDefaults.standard.string(forKey: "nisfayn.push.scope") }

    func switchOwner(to next: String?) {
        guard next == nil || next != scope else { return }
        UIApplication.shared.unregisterForRemoteNotifications()
        pending.removeAll()
        UNUserNotificationCenter.current().removeAllDeliveredNotifications()
        UIApplication.shared.applicationIconBadgeNumber = 0
        UserDefaults.standard.set(next, forKey: "nisfayn.push.scope")
    }

    func setupActions() {
        let reply = UNTextInputNotificationAction(identifier:"NISFAYN_REPLY",title:"رد",options:[.foreground,.authenticationRequired],textInputButtonTitle:"إرسال",textInputPlaceholder:"رسالتك…")
        let read = UNNotificationAction(identifier:"NISFAYN_READ",title:"تحديد كمقروء",options:[.foreground,.authenticationRequired])
        let category = UNNotificationCategory(identifier:"NISFAYN_MESSAGE",actions:[reply,read],intentIdentifiers:[],hiddenPreviewsBodyPlaceholder:"لديك تحديث جديد.",options:[])
        UNUserNotificationCenter.current().setNotificationCategories([category])
    }
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
           let kind = info["kind"] as? String, ["request", "mutual", "message", "reminder", "family", "analysis"].contains(kind) {
            DispatchQueue.main.async {
                guard let scope = info["scope"] as? String, scope == self.scope else { completionHandler(); return }
                var payload = ["scope":scope,"requestId":id,"kind":kind,"actionId":UUID().uuidString.lowercased()]
                if let messageId = info["messageId"] as? String,UUID(uuidString:messageId) != nil { payload["messageId"] = messageId }
                if let roomId = info["roomId"] as? String,UUID(uuidString:roomId) != nil { payload["roomId"] = roomId }
                if response.actionIdentifier == "NISFAYN_READ" { payload["action"] = "read" }
                if response.actionIdentifier == "NISFAYN_REPLY",let reply = response as? UNTextInputNotificationResponse {
                    payload["action"] = "reply";payload["text"] = String(reply.userText.prefix(1000))
                }
                self.pending.append(payload)
                if self.pending.count > 8 { self.pending.removeFirst() }
                NotificationCenter.default.post(name: Self.openEvent, object: nil)
                completionHandler()
            }
            return
        }
        completionHandler()
    }
}

@objc(NisfaynPushPlugin)
final class NisfaynPushPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "NisfaynPushPlugin"
    let jsName = "NisfaynPush"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "clearDelivered", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setOwner", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "register", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unregister", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "consumeOpen", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "acknowledgeOpen", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "badge", returnType: CAPPluginReturnPromise),
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
        DispatchQueue.main.async {
            guard NisfaynPrivacy.shared.mayOpen else { call.resolve(["notification":NSNull()]);return }
            call.resolve(["notification":NisfaynPushCenter.shared.pendingOpen as Any? ?? NSNull()])
        }
    }
    @objc func acknowledgeOpen(_ call:CAPPluginCall) {
        DispatchQueue.main.async {
            NisfaynPushCenter.shared.pending.removeAll{$0["actionId"] == call.getString("actionId")}
            call.resolve()
            if NisfaynPushCenter.shared.pendingOpen != nil { NotificationCenter.default.post(name:NisfaynPushCenter.openEvent,object:nil) }
        }
    }
    @objc func badge(_ call:CAPPluginCall) {
        DispatchQueue.main.async {
            guard let scope = call.getString("scope"), scope == NisfaynPushCenter.shared.scope else { call.resolve(); return }
            UIApplication.shared.applicationIconBadgeNumber = min(999,max(0,call.getInt("count") ?? 0));call.resolve()
        }
    }
    @objc func clearDelivered(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().removeAllDeliveredNotifications()
        call.resolve()
    }
    @objc func setOwner(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let next = call.getString("scope")
            if next == nil || next != NisfaynPushCenter.shared.scope {
                self.timeout?.cancel()
                self.registration?.reject("تغيّر الحساب.", "PUSH_OWNER")
                self.registration = nil
            }
            NisfaynPushCenter.shared.switchOwner(to: next)
            call.resolve()
        }
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
            guard NisfaynPushCenter.shared.scope != nil else { call.reject("سجّل الدخول مجددًا.", "PUSH_OWNER"); return }
            guard self.registration == nil else { call.reject("التسجيل قيد التنفيذ.", "PUSH_BUSY"); return }
            self.registration = call
            UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
                DispatchQueue.main.async {
                    guard self.registration === call else { return }
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
        DispatchQueue.main.async {
            NisfaynPushCenter.shared.switchOwner(to: nil);call.resolve()
        }
    }
    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let url = URL(string: UIApplication.openSettingsURLString) else { call.reject("تعذّر فتح الإعدادات."); return }
            UIApplication.shared.open(url) { _ in call.resolve() }
        }
    }
}
