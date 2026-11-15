import SwiftUI
import StoreKit
import UserNotifications
import WudaynCore

struct NativeLifecycle: ViewModifier {
    @EnvironmentObject private var store: NativeStore
    @Environment(\.scenePhase) private var phase
    @State private var destination: MemberRow?
    @State private var family = false
    @State private var calls = false
    @State private var opening = false
    @State private var boundOwner: String?
    @State private var boundAt = Date.distantPast
    func body(content: Content) -> some View {
        content
            .sheet(item: $destination) { row in NavigationStack { NativeChat(connection: row.value).toolbar { Button("إغلاق") { destination = nil } } } }
            .sheet(isPresented: $family) { NavigationStack { NativeFamily().toolbar { Button("إغلاق") { family = false } } } }
            .sheet(isPresented: $calls) { NavigationStack { NativeCalls().toolbar { Button("إغلاق") { calls = false } } } }
            .onChange(of: store.owner) { _ in destination = nil; family = false; calls = false; boundOwner = nil }
            .onReceive(NotificationCenter.default.publisher(for: NisfaynPushCenter.openEvent)) { _ in Task { await openNotification() } }
            .onReceive(NotificationCenter.default.publisher(for: NisfaynCallCenter.event)) { _ in
                if NisfaynPrivacy.shared.mayOpen, NisfaynCallCenter.shared.active, NisfaynCallCenter.shared.snapshot["account"] as? String == store.owner { calls = true }
            }
            .task(id: "\(store.owner ?? "")-\(phase == .active)") {
                guard !store.testing, !store.familyMode, phase == .active, let owner = store.owner else { return }
                while !Task.isCancelled && store.owner == owner {
                    do {
                        if boundOwner != owner || Date().timeIntervalSince(boundAt) > 6 * 3600 {
                            try await store.bindCalls(); try Task.checkCancellation()
                            let settings = await UNUserNotificationCenter.current().notificationSettings()
                            if settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional {
                                let preference = try await store.client.rpc("marriage_push_settings")
                                if preference["enabled"].bool { try await NativeDevice.enablePush(client: store.client) }
                            }
                            boundOwner = owner; boundAt = Date()
                        }
                        await openNotification()
                        _ = try await store.client.rpc("marriage_heartbeat")
                    } catch is CancellationError { return } catch { /* Retry transient connection failures on the next heartbeat. */ }
                    do { try await Task.sleep(nanoseconds: 30_000_000_000) } catch { return }
                }
            }
            .task(id: store.account["user"]["appAccountToken"].string) {
                guard !store.testing, let owner = store.owner, let token = UUID(uuidString: store.account["user"]["appAccountToken"].string) else { return }
                for await result in StoreKit.Transaction.currentEntitlements { await deliver(result, owner: owner, token: token) }
                for await result in StoreKit.Transaction.updates {
                    if Task.isCancelled { return }
                    await deliver(result, owner: owner, token: token)
                }
            }
    }
    private func deliver(_ result: VerificationResult<StoreKit.Transaction>, owner: String, token: UUID) async {
        guard store.owner == owner, case .verified(let transaction) = result, transaction.productID == "com.blindmatch.marriage.monthly", transaction.appAccountToken == token else { return }
        do {
            _ = try await store.client.edge("verify-membership", .object(["signedTransaction": .string(result.jwsRepresentation)]))
            guard store.owner == owner else { return }
            await transaction.finish(); try await store.refresh()
        } catch is CancellationError { } catch { store.error = "لم يكتمل تحديث العضوية. استخدم استعادة المشتريات من صفحة العضوية." }
    }
    private func openNotification() async {
        guard !opening, NisfaynPrivacy.shared.mayOpen, let owner = store.owner, let event = NisfaynPushCenter.shared.pendingOpen else { return }
        opening = true; defer { opening = false }
        do {
            if event["kind"] == "family" {
                // The family RPC resolves only rooms readable by this authenticated account.
                _ = try await store.client.family("state"); guard store.owner == owner else { return }; family = true
            } else {
                let inbox = try await store.client.rpc("marriage_inbox")
                guard store.owner == owner else { return }
                if let row = inbox.rows.first(where: { $0.id == event["requestId"] }), row.value["status"].string == "accepted" {
                    if event["action"] == "reply", let text = event["text"], !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, let id = event["actionId"] {
                        _ = try await store.client.rpc("marriage_message", ["request_id": .string(row.id), "message_body": .string(text), "client_id": .string(id)])
                    } else if event["action"] == "read", let messageID = event["messageId"] {
                        _ = try await store.client.rpc("marriage_mark_thread_read", ["request_id": .string(row.id), "through_id": .string(messageID)])
                    }
                    destination = row
                }
            }
            guard store.owner == owner else { return }
            NisfaynPushCenter.shared.pending.removeAll { $0["actionId"] == event["actionId"] }
        } catch { store.error = error.localizedDescription }
    }
}
