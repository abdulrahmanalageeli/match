import SwiftUI
import AVFoundation
import WudaynCore

extension NativeStore {
    func bindCalls() async throws {
        guard let owner else { return }
        let center = NisfaynCallCenter.shared
        if center.configured && center.snapshot["account"] as? String == owner && center.active { return }
        if center.snapshot["account"] as? String != owner { center.clear() }
        let value = try await client.edge("native-call", .object(["command": .string("register"), "installation": .string(NativeDevice.installationID), "environment": .string(NisfaynPushCenter.shared.environment), "voipToken": center.voipToken.map(JSONValue.string) ?? .null]))
        guard self.owner == owner else { throw NativeProblem.sessionChanged }
        guard !value["installation"].string.isEmpty, !value["credential"].string.isEmpty else { throw NativeProblem.invalidResponse }
        try center.configure(installation: value["installation"].string, credential: value["credential"].string, account: owner)
    }
}

struct NativeCalls: View {
    @EnvironmentObject private var store: NativeStore
    @Environment(\.scenePhase) private var phase
    var connectionID: String? = nil
    @State private var call: JSONValue = .null
    @State private var muted = false
    @State private var speaker = false
    @State private var connected = false
    @State private var clientID = UUID().uuidString.lowercased()
    var body: some View {
        Form {
            Section {
                Image(systemName: "phone.circle.fill").font(.system(size: 64)).foregroundStyle(NativeTheme.accent).frame(maxWidth: .infinity)
                if !call.isNull {
                    Text(call["person"].title).font(.title2)
                    Text(connected ? "متصل" : call["status"].string == "ringing" ? "جارٍ الاتصال…" : call["status"].string == "active" ? "جارٍ توصيل الصوت…" : "انتهت المكالمة")
                }
                if call.isNull || call["status"].string == "ended" {
                    if let connectionID { NativeAction(title: "بدء مكالمة صوتية") {
                        try await microphone(); try await store.bindCalls()
                        call = try await store.client.rpc("marriage_call_start", ["request_id": .string(connectionID), "client_id": .string(clientID)])
                        if call["status"].string == "ringing" { _ = try? await store.client.service(.callPush, body: .object(["callId": call["id"]])) }
                        try await connect()
                    } }
                } else {
                    if call["direction"].string == "incoming" && call["status"].string == "ringing" {
                        NativeAction(title: "قبول المكالمة") { try await microphone(); try await store.bindCalls(); call = try await store.client.rpc("marriage_call_act", ["call_id": call["id"], "action": .string("accept")]); try await connect() }
                        NativeAction(title: "رفض المكالمة") { try await end("decline") }
                    }
                    Toggle("كتم الميكروفون", isOn: $muted).onChange(of: muted) { value in if !NisfaynCallCenter.shared.setMute(value) { muted = !value } }.disabled(!connected)
                    Toggle("مكبر الصوت", isOn: $speaker).onChange(of: speaker) { value in _ = NisfaynCallCenter.shared.speaker(value) }.disabled(!connected)
                    NativeAction(title: "إنهاء المكالمة") { try await end("end") }
                }
            }
        }.navigationTitle("المكالمات").task(id: phase) {
            guard phase == .active else { return }
            do { repeat {
                let value = try await store.client.rpc("marriage_call_state", ["call_id": call["id"].isNull ? .null : call["id"]]); try Task.checkCancellation(); call = value
                connected = NisfaynCallCenter.shared.snapshot["joined"] as? Bool ?? false
                muted = NisfaynCallCenter.shared.snapshot["muted"] as? Bool ?? false
                if call["status"].string == "active" && !connected { try await store.bindCalls(); try await connect() }
                try await Task.sleep(nanoseconds: 3_000_000_000)
            } while !Task.isCancelled } catch is CancellationError { } catch { store.error = error.localizedDescription }
        }
    }
    private func microphone() async throws { let allowed = await withCheckedContinuation { continuation in AVAudioSession.sharedInstance().requestRecordPermission { continuation.resume(returning: $0) } }; guard allowed else { throw NativeProblem.message("اسمح بالميكروفون من إعدادات iPhone.") } }
    private func connect() async throws {
        guard !call["id"].string.isEmpty, call["status"].string != "ended" else { return }
        let value = try await store.client.edge("voice-token", .object(["callId": call["id"]]))
        guard value["callId"] == call["id"], let credentials = try JSONSerialization.jsonObject(with: value.encoded()) as? [String: Any] else { throw NativeProblem.invalidResponse }
        connected = await withCheckedContinuation { continuation in NisfaynCallCenter.shared.join(credentials) { continuation.resume(returning: $0) } }
        guard connected else { throw NativeProblem.message("تعذّر توصيل صوت المكالمة. حاول مجددًا.") }
    }
    private func end(_ action: String) async throws {
        // Stop local microphone immediately, even when the network is unavailable.
        NisfaynCallCenter.shared.end(server: true); connected = false
        call = try await store.client.rpc("marriage_call_act", ["call_id": call["id"], "action": .string(action)])
        clientID = UUID().uuidString.lowercased()
    }
}
