import Capacitor
import UIKit

@objc(NisfaynFeedbackPlugin)
final class NisfaynFeedbackPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "NisfaynFeedbackPlugin"
    let jsName = "NisfaynFeedback"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "notify", returnType: CAPPluginReturnPromise)
    ]

    @objc func notify(_ call: CAPPluginCall) {
        let kind = call.getString("kind") ?? ""
        guard ["selection", "success", "warning", "error"].contains(kind) else {
            call.reject("Unsupported feedback kind.")
            return
        }
        DispatchQueue.main.async {
            guard UIApplication.shared.applicationState == .active else { call.resolve(); return }
            if kind == "selection" {
                UISelectionFeedbackGenerator().selectionChanged()
            } else {
                let type: UINotificationFeedbackGenerator.FeedbackType = kind == "error" ? .error : kind == "warning" ? .warning : .success
                UINotificationFeedbackGenerator().notificationOccurred(type)
            }
            call.resolve()
        }
    }
}
