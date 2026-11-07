import AVFoundation
import AgoraRtcKit
import Capacitor
import UIKit

/// Audio transport only. The authenticated server owns invitation, consent and channel access.
@objc(NisfaynVoicePlugin)
final class NisfaynVoicePlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "NisfaynVoicePlugin"
    let jsName = "NisfaynVoice"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "join", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "leave", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "mute", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSpeaker", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "renewToken", returnType: CAPPluginReturnPromise)
    ]

    private var engine: AgoraRtcEngineKit?
    private var joinCall: CAPPluginCall?
    private var leaveCalls: [CAPPluginCall] = []
    private var joinTimeout: DispatchWorkItem?
    private var generation = UUID()
    private var joined = false
    private var stopping = false
    private var previousAudio: (AVAudioSession.Category, AVAudioSession.Mode, AVAudioSession.CategoryOptions)?

    override func load() {
        NotificationCenter.default.addObserver(self, selector: #selector(backgrounded), name: UIApplication.didEnterBackgroundNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(interrupted(_:)), name: AVAudioSession.interruptionNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(mediaServicesReset), name: AVAudioSession.mediaServicesWereResetNotification, object: nil)
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
        joinTimeout?.cancel()
        if let engine {
            engine.delegate = nil
            engine.muteLocalAudioStream(true)
            engine.disableAudio()
            engine.leaveChannel(nil)
            let audio = previousAudio
            AgoraRtcEngineKit.destroy {
                DispatchQueue.main.async { Self.restoreAudio(audio) }
            }
        }
    }

    @objc func join(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.engine == nil, self.joinCall == nil, !self.stopping else {
                call.reject("توجد مكالمة قيد التنفيذ. انتظر انتهاءها ثم حاول مجددًا.", "VOICE_BUSY"); return
            }
            guard UIApplication.shared.applicationState != .background else {
                call.reject("افتح التطبيق للانضمام إلى المكالمة.", "VOICE_FOREGROUND_ONLY"); return
            }
            guard let appId = call.getString("appId"), appId.range(of: "^[a-fA-F0-9]{32}$", options: .regularExpression) != nil,
                  let channel = call.getString("channel"), channel.range(of: "^[A-Za-z0-9_-]{1,64}$", options: .regularExpression) != nil,
                  let token = call.getString("token"), !token.isEmpty, token.utf8.count <= 8192,
                  let uid = call.getInt("uid"), uid > 0, UInt64(uid) <= UInt64(UInt32.max) else {
                call.reject("تعذّر التحقق من بيانات المكالمة. حاول مجددًا.", "VOICE_ARGUMENTS"); return
            }
            self.joinCall = call
            let attempt = UUID()
            self.generation = attempt
            // Never request microphone access when receiving an invitation, only on explicit join.
            AVAudioSession.sharedInstance().requestRecordPermission { [weak self] granted in
                DispatchQueue.main.async {
                    guard let self, self.generation == attempt, self.joinCall != nil else { return }
                    guard granted else {
                        self.fail(code: -1, key: "VOICE_MICROPHONE_DENIED", message: "اسمح لنصفين باستخدام الميكروفون من إعدادات iPhone لإجراء المكالمة.")
                        return
                    }
                    guard UIApplication.shared.applicationState != .background else {
                        self.stop(reason: "background"); return
                    }
                    self.start(appId: appId, channel: channel, token: token, uid: UInt(uid), attempt: attempt)
                }
            }
        }
    }

    private func start(appId: String, channel: String, token: String, uid: UInt, attempt: UUID) {
        let session = AVAudioSession.sharedInstance()
        previousAudio = (session.category, session.mode, session.categoryOptions)
        let config = AgoraRtcEngineConfig()
        config.appId = appId
        config.channelProfile = .communication
        config.audioScenario = .default
        let logs = AgoraLogConfig()
        logs.level = .none
        config.logConfig = logs
        let rtc = AgoraRtcEngineKit.sharedEngine(with: config, delegate: self)
        engine = rtc
        // Preserve voiceChat/HFP routing while allowing Agora to manage session activation.
        rtc.setAudioSessionOperationRestriction(.configureSession)
        do {
            try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth])
            try session.setActive(true)
        } catch {
            fail(code: -1, key: "VOICE_AUDIO_SESSION", message: "تعذّر تشغيل صوت المكالمة. حاول مجددًا.")
            return
        }
        // The linked SDK is audio-only; no camera permission or video track is used.
        let audioResult = rtc.enableAudio()
        guard audioResult == 0 else {
            fail(code: Int(audioResult), key: "VOICE_AUDIO", message: "تعذّر تشغيل الميكروفون للمكالمة."); return
        }
        rtc.setAudioProfile(.speechStandard)
        rtc.setDefaultAudioRouteToSpeakerphone(false)
        rtc.muteLocalAudioStream(joinCall?.getBool("muted") ?? false)
        let media = AgoraRtcChannelMediaOptions()
        media.channelProfile = .communication
        media.clientRoleType = .broadcaster
        media.publishMicrophoneTrack = true
        media.publishCameraTrack = false
        media.autoSubscribeAudio = true
        media.autoSubscribeVideo = false
        let result = rtc.joinChannel(byToken: token, channelId: channel, uid: uid, mediaOptions: media, joinSuccess: nil)
        guard result == 0 else {
            fail(code: Int(result), key: "VOICE_JOIN", message: "تعذّر الاتصال بالمكالمة. حاول مجددًا."); return
        }
        let timeout = DispatchWorkItem { [weak self] in
            guard let self, self.generation == attempt, self.joinCall != nil else { return }
            self.fail(code: -1, key: "VOICE_TIMEOUT", message: "استغرق الاتصال وقتًا طويلًا. تحقق من اتصالك وحاول مجددًا.")
        }
        joinTimeout = timeout
        DispatchQueue.main.asyncAfter(deadline: .now() + 30, execute: timeout)
    }

    @objc func leave(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.leaveCalls.append(call)
            if !self.stopping { self.stop(reason: "local") }
        }
    }

    @objc func mute(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let rtc = self.engine, self.joined, let muted = call.getBool("muted") else {
                call.reject("لا توجد مكالمة متصلة.", "VOICE_NOT_JOINED"); return
            }
            let result = rtc.muteLocalAudioStream(muted)
            guard result == 0 else { call.reject("تعذّر تغيير حالة الميكروفون.", "VOICE_MUTE"); return }
            call.resolve()
        }
    }

    @objc func setSpeaker(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let rtc = self.engine, self.joined, let enabled = call.getBool("enabled") else {
                call.reject("لا توجد مكالمة متصلة.", "VOICE_NOT_JOINED"); return
            }
            let result = rtc.setEnableSpeakerphone(enabled)
            guard result == 0 else { call.reject("تعذّر تغيير مخرج الصوت.", "VOICE_SPEAKER"); return }
            call.resolve()
        }
    }

    @objc func renewToken(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let rtc = self.engine, !self.stopping,
                  let token = call.getString("token"), !token.isEmpty, token.utf8.count <= 8192 else {
                call.reject("تعذّر تجديد الاتصال بالمكالمة.", "VOICE_RENEW"); return
            }
            let result = rtc.renewToken(token)
            guard result == 0 else { call.reject("تعذّر تجديد الاتصال بالمكالمة.", "VOICE_RENEW"); return }
            call.resolve()
        }
    }

    private func fail(code: Int, key: String, message: String) {
        joinCall?.reject(message, key)
        joinCall = nil
        notifyListeners("error", data: ["code": code, "message": message])
        stop(reason: "error")
    }

    private func stop(reason: String) {
        guard !stopping else { return }
        let hadCall = engine != nil || joinCall != nil
        generation = UUID() // Discard late permission and join callbacks.
        joinTimeout?.cancel()
        joinTimeout = nil
        joinCall?.reject("انتهت محاولة الاتصال بالمكالمة.", "VOICE_CANCELLED")
        joinCall = nil
        joined = false
        guard let rtc = engine else {
            finishStop(reason: reason, notify: hadCall)
            return
        }
        stopping = true
        engine = nil
        rtc.delegate = nil
        rtc.muteLocalAudioStream(true)
        rtc.disableAudio()
        rtc.leaveChannel(nil)
        // Agora 4.7 supports asynchronous destruction; never destroy on an SDK callback stack.
        let audio = previousAudio
        AgoraRtcEngineKit.destroy { [weak self] in
            DispatchQueue.main.async {
                if let self { self.finishStop(reason: reason, notify: hadCall) }
                else { Self.restoreAudio(audio) }
            }
        }
    }

    private func finishStop(reason: String, notify: Bool) {
        Self.restoreAudio(previousAudio)
        previousAudio = nil
        stopping = false
        let waiting = leaveCalls
        leaveCalls.removeAll()
        waiting.forEach { $0.resolve() }
        if notify { notifyListeners("left", data: ["reason": reason]) }
    }

    private static func restoreAudio(_ previous: (AVAudioSession.Category, AVAudioSession.Mode, AVAudioSession.CategoryOptions)?) {
        guard let previous else { return }
        let session = AVAudioSession.sharedInstance()
        try? session.setActive(false, options: [.notifyOthersOnDeactivation])
        try? session.setCategory(previous.0, mode: previous.1, options: previous.2)
    }

    @objc private func backgrounded() {
        DispatchQueue.main.async { self.stop(reason: "background") }
    }

    @objc private func interrupted(_ notification: Notification) {
        guard let raw = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              AVAudioSession.InterruptionType(rawValue: raw) == .began else { return }
        DispatchQueue.main.async { self.stop(reason: "interrupted") }
    }

    @objc private func mediaServicesReset() {
        DispatchQueue.main.async { self.stop(reason: "audio_reset") }
    }
}

extension NisfaynVoicePlugin: AgoraRtcEngineDelegate {
    func rtcEngine(_ engine: AgoraRtcEngineKit, didJoinChannel channel: String, withUid uid: UInt, elapsed: Int) {
        DispatchQueue.main.async {
            guard self.engine === engine else { return }
            self.joinTimeout?.cancel()
            self.joinTimeout = nil
            self.joined = true
            self.joinCall?.resolve(["uid": uid])
            self.joinCall = nil
            self.notifyListeners("joined", data: ["channel": channel, "uid": uid])
        }
    }

    func rtcEngine(_ engine: AgoraRtcEngineKit, didJoinedOfUid uid: UInt, elapsed: Int) {
        DispatchQueue.main.async {
            guard self.engine === engine else { return }
            self.notifyListeners("remoteJoined", data: ["uid": uid])
        }
    }

    func rtcEngine(_ engine: AgoraRtcEngineKit, didOfflineOfUid uid: UInt, reason: AgoraUserOfflineReason) {
        DispatchQueue.main.async {
            guard self.engine === engine else { return }
            self.notifyListeners("remoteLeft", data: ["uid": uid, "reason": reason.rawValue])
        }
    }

    func rtcEngine(_ engine: AgoraRtcEngineKit, didOccurError errorCode: AgoraErrorCode) {
        DispatchQueue.main.async {
            guard self.engine === engine else { return }
            self.fail(code: errorCode.rawValue, key: "VOICE_SDK", message: "تعذّر استمرار الاتصال الصوتي. حاول مجددًا.")
        }
    }

    func rtcEngine(_ engine: AgoraRtcEngineKit, tokenPrivilegeWillExpire token: String) {
        DispatchQueue.main.async {
            guard self.engine === engine else { return }
            // Never forward the expiring credential to logs or event payloads.
            self.notifyListeners("tokenWillExpire", data: [:])
        }
    }

    func rtcEngineRequestToken(_ engine: AgoraRtcEngineKit) {
        DispatchQueue.main.async {
            guard self.engine === engine else { return }
            self.notifyListeners("tokenExpired", data: [:])
        }
    }

    func rtcEngine(_ engine: AgoraRtcEngineKit, connectionChangedTo state: AgoraConnectionState, reason: AgoraConnectionChangedReason) {
        DispatchQueue.main.async {
            guard self.engine === engine else { return }
            self.notifyListeners("connectionStateChanged", data: ["state": state.rawValue, "reason": reason.rawValue])
            if state == .failed {
                self.fail(code: reason.rawValue, key: "VOICE_CONNECTION", message: "انقطع الاتصال بالمكالمة. حاول مجددًا.")
            }
        }
    }
}
