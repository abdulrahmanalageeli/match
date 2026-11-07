import Capacitor
import Foundation
import Security

@objc(PrivateSessionPlugin)
final class PrivateSessionPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "PrivateSessionPlugin"
    let jsName = "PrivateSession"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "save", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise)
    ]

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
