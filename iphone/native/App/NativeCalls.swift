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
    @State private var locallyEndedID: String?
    @State private var visible = false
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
            while !Task.isCancelled { do {
                let value = try await store.client.rpc("marriage_call_state", ["call_id": call["id"].isNull ? .null : call["id"]]); try Task.checkCancellation(); call = value
                connected = NisfaynCallCenter.shared.snapshot["joined"] as? Bool ?? false
                muted = NisfaynCallCenter.shared.snapshot["muted"] as? Bool ?? false
                if call.isNull || call["status"].string == "ended" { connected = false }
                if call["status"].string == "active" && !connected { try await store.bindCalls(); try await connect() }
            } catch is CancellationError { return } catch {
                if NativeProblem.isAccessDenied(error) { NisfaynCallCenter.shared.end(server: false); call = .null; connected = false }
                store.error = error.localizedDescription
            }
                do { try await Task.sleep(nanoseconds: 3_000_000_000) } catch { return }
            }
        }
        .onChange(of: call["status"].string) { status in if status == "ended" { clientID = UUID().uuidString.lowercased() } }
        .onAppear { visible = true }.onDisappear { visible = false }
    }
    private func microphone() async throws {
        let owner = store.owner
        let allowed = await withCheckedContinuation { continuation in AVAudioSession.sharedInstance().requestRecordPermission { continuation.resume(returning: $0) } }
        guard visible, phase == .active, store.owner == owner, NisfaynPrivacy.shared.mayOpen else { throw CancellationError() }
        guard allowed else { throw NativeProblem.message("اسمح بالميكروفون من إعدادات iPhone.") }
    }
    private func connect() async throws {
        guard !call["id"].string.isEmpty, call["status"].string != "ended", locallyEndedID != call["id"].string else { return }
        let owner = store.owner, callID = call["id"]
        let value = try await store.client.edge("voice-token", .object(["callId": call["id"]]))
        guard store.owner == owner, locallyEndedID != callID.string, call["id"] == callID else { return }
        guard value["callId"] == callID, let credentials = try JSONSerialization.jsonObject(with: value.encoded()) as? [String: Any] else { throw NativeProblem.invalidResponse }
        connected = await withCheckedContinuation { continuation in NisfaynCallCenter.shared.join(credentials) { continuation.resume(returning: $0) } }
        guard connected else { throw NativeProblem.message("تعذّر توصيل صوت المكالمة. حاول مجددًا.") }
    }
    private func end(_ action: String) async throws {
        // Stop local microphone immediately, even when the network is unavailable.
        locallyEndedID = call["id"].string
        NisfaynCallCenter.shared.end(server: action == "end"); connected = false
        call = try await store.client.rpc("marriage_call_act", ["call_id": call["id"], "action": .string(action)])
        clientID = UUID().uuidString.lowercased()
    }
}
