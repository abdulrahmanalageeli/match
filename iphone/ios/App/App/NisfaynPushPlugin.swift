import Capacitor
import UIKit
import UserNotifications

final class NisfaynPushCenter: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NisfaynPushCenter()
    static let tokenEvent = Notification.Name("NisfaynPushToken")
    static let failureEvent = Notification.Name("NisfaynPushFailure")
    static let openEvent = Notification.Name("NisfaynPushOpen")
    static let receiveEvent = Notification.Name("NisfaynPushReceived")
    static let simulationRequest = "wudayn.simulation.activity"
    var token: String?
    var pending: [[String:String]] = []
    var pendingOpen: [String:String]? { pending.first }
    var scope: String? { UserDefaults.standard.string(forKey: "nisfayn.push.scope") }

    func switchOwner(to next: String?) {
        guard next == nil || next != scope else { return }
        UIApplication.shared.unregisterForRemoteNotifications()
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [Self.simulationRequest])
        pending.removeAll()
        UNUserNotificationCenter.current().removeAllDeliveredNotifications()
        UIApplication.shared.applicationIconBadgeNumber = 0
        UserDefaults.standard.set(next, forKey: "nisfayn.push.scope")
    }

    func setupActions() {
        let reply = UNTextInputNotificationAction(identifier:"NISFAYN_REPLY",title:"رد",options:[.foreground,.authenticationRequired],textInputButtonTitle:"إرسال",textInputPlaceholder:"رسالتك…")
        let read = UNNotificationAction(identifier:"NISFAYN_READ",title:"تحديد كمقروء",options:[.foreground,.authenticationRequired])
        let category = UNNotificationCategory(identifier:"NISFAYN_MESSAGE",actions:[reply,read],intentIdentifiers:[],hiddenPreviewsBodyPlaceholder:"إشعار جديد",options:[])
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
    private func routingInfo(_ request: UNNotificationRequest) -> [String:String]? {
        let info = request.content.userInfo
        let localSimulation = request.identifier == Self.simulationRequest && request.trigger is UNTimeIntervalNotificationTrigger
        guard let scope = info["scope"] as? String, scope == self.scope,
              let id = info["requestId"] as? String, UUID(uuidString: id) != nil,
              let kind = info["kind"] as? String,
              (localSimulation ? kind == "simulation" : ["request", "mutual", "message", "reminder", "family", "analysis", "publication", "update"].contains(kind)) else { return nil }
        var payload = ["scope":scope, "requestId":id, "kind":kind]
        for key in ["messageId", "roomId", "deliveryId"] {
            if let value = info[key] as? String, UUID(uuidString:value) != nil { payload[key] = value }
        }
        // Older senders put their message/update job UUID in the APNs collapse identifier.
        if payload["deliveryId"] == nil, UUID(uuidString:request.identifier) != nil { payload["deliveryId"] = request.identifier }
        if localSimulation { payload["deliveryId"] = id }
        if kind == "analysis", let phase = info["analysisPhase"] as? String, ["requested","shared"].contains(phase) { payload["analysisPhase"] = phase }
        if kind == "update", let event = info["event"] as? String, event.range(of: "^[a-z_]+:[a-z_]+$", options: .regularExpression) != nil { payload["event"] = event }
        return payload
    }
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        DispatchQueue.main.async {
            if NisfaynPrivacy.shared.mayOpen, let payload = self.routingInfo(notification.request) {
                NotificationCenter.default.post(name: Self.receiveEvent, object: payload)
            }
            completionHandler([])
        }
    }
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        DispatchQueue.main.async {
            defer { completionHandler() }
            guard var payload = self.routingInfo(response.notification.request) else { return }
            payload["actionId"] = UUID().uuidString.lowercased()
            if response.actionIdentifier == "NISFAYN_READ" { payload["action"] = "read" }
            if response.actionIdentifier == "NISFAYN_REPLY", let reply = response as? UNTextInputNotificationResponse {
                payload["action"] = "reply";payload["text"] = String(reply.userText.prefix(1000))
            }
            self.pending.append(payload)
            if self.pending.count > 8 { self.pending.removeFirst() }
            NotificationCenter.default.post(name: Self.openEvent, object: nil)
        }
    }
}

@objc(NisfaynPushPlugin)
final class NisfaynPushPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "NisfaynPushPlugin"
    let jsName = "NisfaynPush"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "clearDelivered", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setOwner", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSimulationActivity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "register", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unregister", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "consumeOpen", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "acknowledgeOpen", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "badge", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openStoreListing", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise)
    ]
    private var registration: CAPPluginCall?
    private var timeout: DispatchWorkItem?

    override func load() {
        NotificationCenter.default.addObserver(self, selector: #selector(tokenReceived), name: NisfaynPushCenter.tokenEvent, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(registrationFailed), name: NisfaynPushCenter.failureEvent, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(notificationOpened), name: NisfaynPushCenter.openEvent, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(notificationReceived(_:)), name: NisfaynPushCenter.receiveEvent, object: nil)
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
    @objc private func notificationReceived(_ notification: Notification) {
        if let payload = notification.object as? [String:String] { notifyListeners("received", data: payload) }
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
    @objc func setSimulationActivity(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let scope = call.getString("scope"), scope == NisfaynPushCenter.shared.scope else { call.resolve(); return }
            let center = UNUserNotificationCenter.current()
            let identifier = NisfaynPushCenter.simulationRequest
            guard let id = call.getString("eventId"), UUID(uuidString: id) != nil,
                  let due = call.getDouble("dueAt"), let body = call.getString("body"), !body.isEmpty else {
                center.removePendingNotificationRequests(withIdentifiers: [identifier])
                call.resolve()
                return
            }
            let delay = due / 1000 - Date().timeIntervalSince1970
            guard delay > 0, delay <= 7 * 86400 else {
                center.removePendingNotificationRequests(withIdentifiers: [identifier])
                call.resolve()
                return
            }
            let content = UNMutableNotificationContent()
            content.title = "وُدَين"
            content.body = String(body.prefix(120))
            if call.getBool("sound") == true { content.sound = .default }
            content.userInfo = ["scope":scope, "requestId":id, "kind":"simulation"]
            let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(1, delay), repeats: false)
            // Reusing this identifier replaces the previous plan, including after a cold restart.
            center.add(UNNotificationRequest(identifier: identifier, content: content, trigger: trigger)) { error in
                if error != nil { call.reject("تعذّر جدولة التنبيه.") } else { call.resolve() }
            }
        }
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
                          "installationId": NisfaynPushCenter.shared.installation,
                          "buildNumber": Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? ""])
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
    @objc func openStoreListing(_ call: CAPPluginCall) {
        guard let value = call.getString("url"),
              value.range(of: #"^https://apps\.apple\.com/app/id[1-9][0-9]{0,18}\z"#, options: .regularExpression) != nil,
              let url = URL(string: value) else {
            call.reject("رابط المتجر غير صالح.")
            return
        }
        DispatchQueue.main.async {
            UIApplication.shared.open(url, options: [:]) { opened in
                if opened { call.resolve() } else { call.reject("تعذّر فتح App Store.") }
            }
        }
    }

    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let url = URL(string: UIApplication.openSettingsURLString) else { call.reject("تعذّر فتح الإعدادات."); return }
            UIApplication.shared.open(url) { _ in call.resolve() }
        }
    }
}
