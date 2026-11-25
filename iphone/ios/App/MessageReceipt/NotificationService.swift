import Foundation
import UserNotifications

final class NotificationService: UNNotificationServiceExtension {
    private let lock = NSLock()
    private var completion: (() -> Void)?

    override func didReceive(_ request: UNNotificationRequest,
                             withContentHandler handler: @escaping (UNNotificationContent) -> Void) {
        let content = request.content
        guard content.userInfo["kind"] as? String == "message",
              let receipt = content.userInfo["receipt"] as? [String: String],
              let job = receipt["job"].flatMap(UUID.init(uuidString:)),
              let proof = receipt["proof"].flatMap(UUID.init(uuidString:)),
              let endpoint = Bundle.main.object(forInfoDictionaryKey: "ReceiptURL") as? String,
              let url = URL(string: endpoint), url.scheme == "https",
              let key = Bundle.main.object(forInfoDictionaryKey: "ReceiptPublicKey") as? String,
              key.hasPrefix("sb_publishable_") else {
            handler(content)
            return
        }

        // Prove only that this device received the alert. Opening and reading have separate paths.
        let receiptTimeout: TimeInterval = 3
        var ack = URLRequest(url: url, timeoutInterval: receiptTimeout)
        ack.httpMethod = "POST"
        ack.setValue("application/json", forHTTPHeaderField: "Content-Type")
        ack.setValue(key, forHTTPHeaderField: "apikey")
        ack.httpBody = try? JSONEncoder().encode(["job_id": job.uuidString, "proof": proof.uuidString])
        lock.lock()
        completion = { handler(content) }
        lock.unlock()
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForResource = receiptTimeout
        let session = URLSession(configuration: configuration)
        session.dataTask(with: ack) { _, _, _ in
            self.finish()
            session.finishTasksAndInvalidate()
        }.resume()
    }

    override func serviceExtensionTimeWillExpire() { finish() }

    private func finish() {
        lock.lock()
        let callback = completion
        completion = nil
        lock.unlock()
        callback?()
    }
}
