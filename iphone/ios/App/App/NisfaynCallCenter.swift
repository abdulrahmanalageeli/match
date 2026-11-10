import UIKit
import AVFoundation
import AgoraRtcKit
import CallKit
import PushKit
import Security

/// Owns the phone call independently of the web view and its JavaScript timers.
/// All mutations and short-lived audio grants still pass server authorization.
final class NisfaynCallCenter: NSObject, CXProviderDelegate, PKPushRegistryDelegate, AgoraRtcEngineDelegate {
    static let shared = NisfaynCallCenter()
    static let event = Notification.Name("NisfaynNativeVoiceEvent")
    private let provider: CXProvider
    private let controller = CXCallController()
    private var registry: PKPushRegistry?
    private var auth: [String: String]?
    private var rtc: AgoraRtcEngineKit?
    private var pendingCredentials: [String: Any]?
    private var joined = false
    private var audioActive = false
    private var stopping = false
    private var joining: [(Bool) -> Void] = []
    private var timer: Timer?
    private var expiry: DispatchWorkItem?
    private var requestBusy = false
    private var answering = false
    private var renewedAt = Date.distantPast
    private var generation = UUID()
    private var id: UUID?
    private var direction = "incoming"
    private var muted = false
    private var peer = false
    private var remoteMissingAt: Date?
    private var tokenDeadline = Date.distantPast
    private var keychainQuery: [String: Any] { [kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:"com.blindmatch.marriage.calls",kSecAttrAccount as String:"device"] }
    var configured: Bool { auth != nil }
    var active: Bool { id != nil }
    var voipToken: String? { registry?.pushToken(for: .voIP)?.map { String(format:"%02x",$0) }.joined() }
    var snapshot: [String: Any] { ["managed":configured,"account":auth?["account"] as Any? ?? NSNull(),"callId":id?.uuidString.lowercased() as Any? ?? NSNull(),"joined":joined,"muted":muted,"peer":peer,"route":routeName] }
    private var routeName: String { AVAudioSession.sharedInstance().currentRoute.outputs.first?.portName ?? "iPhone" }

    private override init() {
        let config = CXProviderConfiguration()
        config.supportsVideo = false; config.maximumCallGroups = 1; config.maximumCallsPerCallGroup = 1
        config.supportedHandleTypes = [.generic]
        // Keep personal introductions out of the system's shared Recents list.
        config.includesCallsInRecents = false
        provider = CXProvider(configuration: config)
        super.init()
        provider.setDelegate(self, queue: .main)
        var query = keychainQuery; query[kSecReturnData as String] = true; query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        if SecItemCopyMatching(query as CFDictionary,&result) == errSecSuccess, let data = result as? Data {
            auth = (try? JSONSerialization.jsonObject(with:data)) as? [String:String]
        }
        NotificationCenter.default.addObserver(self,selector:#selector(routeChanged),name:AVAudioSession.routeChangeNotification,object:nil)
        NotificationCenter.default.addObserver(self,selector:#selector(audioInterrupted(_:)),name:AVAudioSession.interruptionNotification,object:nil)
        NotificationCenter.default.addObserver(self,selector:#selector(audioReset),name:AVAudioSession.mediaServicesWereResetNotification,object:nil)
    }
    func boot() {
        guard registry == nil else { return }
        let registry = PKPushRegistry(queue: .main); self.registry = registry
        registry.delegate = self
        // Registration has no microphone prompt; accepting a call remains explicit.
        registry.desiredPushTypes = [.voIP]
    }
    func configure(installation: String, credential: String, account: String) throws {
        guard UUID(uuidString:installation) != nil, credential.range(of:"^[0-9a-f]{64}$",options:.regularExpression) != nil else { throw NSError(domain:"NativeCall",code:400) }
        let next = ["installation":installation,"credential":credential,"account":account]
        let data = try JSONSerialization.data(withJSONObject:next)
        let values:[String:Any] = [kSecValueData as String:data,kSecAttrAccessible as String:kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        var status = SecItemUpdate(keychainQuery as CFDictionary,values as CFDictionary)
        if status == errSecItemNotFound { status = SecItemAdd(keychainQuery.merging(values){_,new in new} as CFDictionary,nil) }
        guard status == errSecSuccess else { throw NSError(domain:"NativeCall",code:Int(status)) }
        auth = next; boot()
        if let voipToken { request("device",extra:["voipToken":voipToken]) {_,_ in} }
    }
    func clear() {
        end(server:true)
        request("unregister") {_,_ in}
        auth = nil; SecItemDelete(keychainQuery as CFDictionary)
    }
    private func emit(_ name:String,_ data:[String:Any] = [:]) {
        NotificationCenter.default.post(name:Self.event,object:nil,userInfo:["name":name,"data":data])
    }
    private func request(_ command:String,callId:UUID? = nil,extra:[String:Any] = [:],completion:@escaping ([String:Any]?,Int)->Void) {
        guard let saved = auth else { completion(nil,401); return }
        var body:[String:Any] = ["installation":saved["installation"] ?? "","credential":saved["credential"] ?? ""]
        body["command"] = command
        if let callId = callId ?? id { body["callId"] = callId.uuidString.lowercased() }
        body.merge(extra){_,new in new}
        var req = URLRequest(url:URL(string:"https://wupkifqbwhhebwrgvwai.supabase.co/functions/v1/native-call")!)
        req.httpMethod = "POST"; req.timeoutInterval = 10
        req.setValue("application/json",forHTTPHeaderField:"Content-Type")
        req.httpBody = try? JSONSerialization.data(withJSONObject:body)
        URLSession.shared.dataTask(with:req) { data,response,_ in
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            let json = data.flatMap { try? JSONSerialization.jsonObject(with:$0) } as? [String:Any]
            DispatchQueue.main.async { completion(status == 200 ? json : nil,status) }
        }.resume()
    }
    func pushRegistry(_ registry:PKPushRegistry,didUpdate pushCredentials:PKPushCredentials,for type:PKPushType) {
        guard type == .voIP else { return }
        if let voipToken, configured { request("device",extra:["voipToken":voipToken]) {_,_ in} }
    }
    func pushRegistry(_ registry:PKPushRegistry,didInvalidatePushTokenFor type:PKPushType) {
        request("device",extra:["voipToken":NSNull()]) {_,_ in}
    }
    func pushRegistry(_ registry:PKPushRegistry,didReceiveIncomingPushWith payload:PKPushPayload,for type:PKPushType,completion:@escaping ()->Void) {
        let callId = (payload.dictionaryPayload["callId"] as? String).flatMap(UUID.init(uuidString:)) ?? UUID()
        // Report before network I/O, including malformed/stale pushes, as required by iOS.
        let update = CXCallUpdate(); update.remoteHandle = CXHandle(type:.generic,value:"نصفين")
        update.localizedCallerName = "مكالمة نصفين"; update.hasVideo = false
        update.supportsHolding = false; update.supportsGrouping = false; update.supportsUngrouping = false
        provider.reportNewIncomingCall(with:callId,update:update) { [weak self] error in
            DispatchQueue.main.async {
                guard let self else { completion(); return }
                completion()
                if self.id == callId { return } // Duplicate delivery, same system call.
                guard error == nil else { return }
                guard self.id == nil, self.auth?["installation"] == payload.dictionaryPayload["installation"] as? String else {
                    self.provider.reportCall(with:callId,endedAt:Date(),reason:.failed); return
                }
                self.id = callId; self.direction = "incoming"; self.generation = UUID()
                self.muted = false
                self.watch(); self.refreshState()
                self.armExpiry(seconds:45)
                self.emit("incoming",["callId":callId.uuidString.lowercased()])
            }
        }
    }
    func join(_ credentials:[String:Any],completion:@escaping (Bool)->Void) {
        guard let raw = credentials["callId"] as? String, let callId = UUID(uuidString:raw), configured, !stopping else { completion(false); return }
        if id == callId && joined { completion(true); emit("remoteJoined",["present":peer]); emit("controls",snapshot); return }
        guard id == nil || id == callId else { completion(false); return }
        joining.append(completion)
        if id == nil {
            id = callId; direction = credentials["uid"] as? Int == 2 ? "incoming" : "outgoing"; generation = UUID()
            muted = credentials["muted"] as? Bool ?? false
            if direction == "incoming" {
                let update = CXCallUpdate();update.remoteHandle = CXHandle(type:.generic,value:"نصفين")
                update.hasVideo = false;update.supportsHolding = false;update.supportsGrouping = false;update.supportsUngrouping = false
                provider.reportNewIncomingCall(with:callId,update:update) { [weak self] error in
                    DispatchQueue.main.async {
                        guard let self,self.id == callId else { return }
                        if error != nil { self.fail();return }
                        self.controller.request(CXTransaction(action:CXAnswerCallAction(call:callId))) { error in
                            DispatchQueue.main.async { if self.id == callId,error != nil { self.fail() } }
                        }
                    }
                }
            } else {
                let action = CXStartCallAction(call:callId,handle:CXHandle(type:.generic,value:"نصفين"))
                action.isVideo = false
                controller.request(CXTransaction(action:action)) { [weak self] error in
                    DispatchQueue.main.async { if self?.id == callId,error != nil { self?.fail() } }
                }
            }
        } else if direction == "incoming",!audioActive,!answering {
            controller.request(CXTransaction(action:CXAnswerCallAction(call:callId))) { [weak self] error in
                DispatchQueue.main.async { if self?.id == callId,error != nil { self?.fail() } }
            }
        }
        pendingCredentials = credentials
        if let date = credentials["expiresAt"] as? String { tokenDeadline = Self.date(date) ?? Date() }
        renewedAt = Date(); watch(); connectIfReady()
        armExpiry(seconds:30)
    }
    private static func date(_ value:String)->Date? {
        let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime,.withFractionalSeconds]
        return formatter.date(from:value) ?? ISO8601DateFormatter().date(from:value)
    }
    private func armExpiry(seconds:Double) {
        expiry?.cancel()
        let generation = generation
        let work = DispatchWorkItem { [weak self] in
            guard let self,self.generation == generation,!self.joined else { return }
            self.end(server:true,reason:.unanswered)
        }
        expiry = work; DispatchQueue.main.asyncAfter(deadline:.now()+seconds,execute:work)
    }
    private func audioConfiguration() throws {
        try AVAudioSession.sharedInstance().setCategory(.playAndRecord,mode:.voiceChat,options:[.allowBluetooth])
    }
    func provider(_ provider:CXProvider,perform action:CXStartCallAction) {
        guard action.callUUID == id else { action.fail(); return }
        do { try audioConfiguration(); action.fulfill(); provider.reportOutgoingCall(with:action.callUUID,startedConnectingAt:Date()) }
        catch { action.fail(); fail() }
    }
    func provider(_ provider:CXProvider,perform action:CXAnswerCallAction) {
        guard action.callUUID == id else { action.fail(); return }
        answering = true
        let attempt = generation
        AVAudioSession.sharedInstance().requestRecordPermission { [weak self] granted in
            DispatchQueue.main.async {
                guard let self,self.generation == attempt else { action.fail(); return }
                guard granted else { action.fail(); self.end(server:true); return }
                self.request("accept") { state,status in
                    guard self.generation == attempt else { action.fail(); return }
                    guard status == 200,state?["status"] as? String == "active" else { action.fail(); self.fail(); return }
                    self.request("token") { credentials,status in
                        guard self.generation == attempt else { action.fail(); return }
                        guard status == 200,let credentials else { action.fail(); self.fail(); return }
                        do { try self.audioConfiguration() } catch { action.fail(); self.fail(); return }
                        self.pendingCredentials = credentials; self.renewedAt = Date()
                        self.tokenDeadline = Self.date(credentials["expiresAt"] as? String ?? "") ?? Date()
                        self.armExpiry(seconds:30); self.watch()
                        // Audio starts only in didActivate, after CallKit grants the session.
                        action.fulfill(); self.connectIfReady(); self.emit("accepted");self.answering = false
                    }
                }
            }
        }
    }
    func provider(_ provider:CXProvider,perform action:CXEndCallAction) {
        guard action.callUUID == id else { action.fulfill(); return }
        end(server:true,report:false); action.fulfill()
    }
    func provider(_ provider:CXProvider,perform action:CXSetMutedCallAction) {
        guard action.callUUID == id, let rtc, rtc.muteLocalAudioStream(action.isMuted) == 0 else { action.fail(); return }
        muted = action.isMuted; emit("controls",snapshot); action.fulfill()
    }
    func provider(_ provider:CXProvider,timedOutPerforming action:CXAction) {
        action.fail()
        if let callAction = action as? CXCallAction,callAction.callUUID == id { end(server:true,reason:.failed) }
    }
    func providerDidReset(_ provider:CXProvider) { end(server:true,report:false) }
    func provider(_ provider:CXProvider,didActivate audioSession:AVAudioSession) {
        audioActive = true; connectIfReady(); rtc?.muteLocalAudioStream(muted); emit("connectionStateChanged",["state":3])
    }
    func provider(_ provider:CXProvider,didDeactivate audioSession:AVAudioSession) {
        audioActive = false; rtc?.muteLocalAudioStream(true)
        if active { emit("connectionStateChanged",["state":4]) }
    }
    private func connectIfReady() {
        guard audioActive,rtc == nil,!stopping,let value = pendingCredentials,let callId = id,
              value["callId"] as? String == callId.uuidString.lowercased(),
              let appId = value["appId"] as? String,appId.range(of:"^[0-9a-fA-F]{32}$",options:.regularExpression) != nil,
              let channel = value["channel"] as? String,channel == "n_"+callId.uuidString.lowercased().replacingOccurrences(of:"-",with:""),
              let token = value["token"] as? String,let uid = value["uid"] as? Int,[1,2].contains(uid) else { return }
        let attempt = generation
        AVAudioSession.sharedInstance().requestRecordPermission { [weak self] granted in
            DispatchQueue.main.async {
                guard let self,self.generation == attempt,self.rtc == nil else { return }
                guard granted else { self.fail(); return }
                let config = AgoraRtcEngineConfig(); config.appId = appId; config.channelProfile = .communication
                let logs = AgoraLogConfig(); logs.level = .none; config.logConfig = logs
                let rtc = AgoraRtcEngineKit.sharedEngine(with:config,delegate:self); self.rtc = rtc
                // CallKit owns activation; Agora must not deactivate another phone call.
                rtc.setAudioSessionOperationRestriction(.all)
                rtc.enableAudio(); rtc.setAudioProfile(.speechStandard); rtc.setDefaultAudioRouteToSpeakerphone(false)
                rtc.muteLocalAudioStream(self.muted)
                let media = AgoraRtcChannelMediaOptions(); media.channelProfile = .communication
                media.clientRoleType = .broadcaster; media.publishMicrophoneTrack = true; media.publishCameraTrack = false
                media.autoSubscribeAudio = true; media.autoSubscribeVideo = false
                if rtc.joinChannel(byToken:token,channelId:channel,uid:UInt(uid),mediaOptions:media,joinSuccess:nil) != 0 { self.fail() }
            }
        }
    }
    private func watch() {
        guard timer == nil else { return }
        timer = Timer.scheduledTimer(withTimeInterval:5,repeats:true) { [weak self] _ in self?.tick() }
    }
    private func tick() {
        guard active else { return }
        if joined,Date() >= tokenDeadline { fail(); return }
        if let remoteMissingAt,Date().timeIntervalSince(remoteMissingAt)>45 { fail(); return }
        if joined,Date().timeIntervalSince(renewedAt)>=45 { renew(); return }
        refreshState()
    }
    private func refreshState() {
        guard !requestBusy,let callId = id else { return }
        requestBusy = true; let attempt = generation
        request("state") { [weak self] state,status in
            guard let self,self.generation == attempt,self.id == callId else { return }
            self.requestBusy = false
            if [401,403,404,409].contains(status) || (status == 200 && (state == nil || state?["status"] as? String == "ended")) { self.end(server:false); return }
            // A call answered on another device must not start this device's microphone.
            if status == 200,state?["status"] as? String == "active",self.rtc == nil,self.pendingCredentials == nil,!self.answering {
                self.end(server:false,reason:.answeredElsewhere)
            }
        }
    }
    private func renew() {
        guard !requestBusy,id != nil else { return }
        requestBusy = true; let attempt = generation
        request("token") { [weak self] value,status in
            guard let self,self.generation == attempt else { return }
            self.requestBusy = false
            if [401,403,404,409].contains(status) { self.end(server:false); return }
            guard status == 200,let token = value?["token"] as? String else { self.emit("connectionStateChanged",["state":4]); return }
            guard self.rtc?.renewToken(token) == 0 else { self.fail(); return }
            self.renewedAt = Date(); self.tokenDeadline = Self.date(value?["expiresAt"] as? String ?? "") ?? Date()
        }
    }
    func setMute(_ value:Bool)->Bool {
        guard let rtc,joined,rtc.muteLocalAudioStream(value) == 0 else { return false }
        muted = value; emit("controls",snapshot); return true
    }
    func speaker(_ value:Bool)->Bool {
        guard rtc != nil,joined else { return false }
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setPreferredInput(session.availableInputs?.first(where:{$0.portType == .builtInMic}))
            try session.overrideOutputAudioPort(value ? .speaker : .none)
            routeChanged(); return true
        }catch{return false}
    }
    func showRoutes(from view:UIViewController) {
        guard joined else { return }
        let sheet = UIAlertController(title:"مخرج الصوت",message:nil,preferredStyle:.actionSheet)
        sheet.addAction(UIAlertAction(title:"iPhone",style:.default){[weak self] _ in _ = self?.speaker(false)})
        sheet.addAction(UIAlertAction(title:"مكبر الصوت",style:.default){[weak self] _ in _ = self?.speaker(true)})
        for input in AVAudioSession.sharedInstance().availableInputs ?? [] where input.portType != .builtInMic {
            sheet.addAction(UIAlertAction(title:input.portName,style:.default){[weak self] _ in
                do { try AVAudioSession.sharedInstance().overrideOutputAudioPort(.none); try AVAudioSession.sharedInstance().setPreferredInput(input); self?.routeChanged() }
                catch { self?.emit("routeError") }
            })
        }
        sheet.addAction(UIAlertAction(title:"إلغاء",style:.cancel))
        sheet.popoverPresentationController?.sourceView = view.view
        sheet.popoverPresentationController?.sourceRect = CGRect(x:view.view.bounds.midX,y:view.view.bounds.maxY-60,width:1,height:1)
        view.present(sheet,animated:true)
    }
    @objc private func routeChanged() { emit("controls",snapshot) }
    @objc private func audioInterrupted(_ note:Notification) {
        guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt else { return }
        if AVAudioSession.InterruptionType(rawValue:raw) == .began { rtc?.muteLocalAudioStream(true); emit("connectionStateChanged",["state":4]) }
        // Resumption is controlled by CallKit didActivate, never by forcing setActive.
    }
    @objc private func audioReset() { if active { fail() } }
    private func fail() { emit("error",["message":"تعذّر استمرار المكالمة. يمكنك إعادة الاتصال."]); end(server:true,reason:.failed) }
    func end(server:Bool,report:Bool = true,reason:CXCallEndedReason = .remoteEnded) {
        guard let callId = id else { return }
        if server { request("end",callId:callId) {_,_ in} }
        if report { provider.reportCall(with:callId,endedAt:Date(),reason:reason) }
        generation = UUID(); id = nil; timer?.invalidate(); timer = nil; expiry?.cancel(); expiry = nil
        joined = false; peer = false; remoteMissingAt = nil; pendingCredentials = nil; audioActive = false; requestBusy = false; answering = false
        let callbacks = joining; joining = []; callbacks.forEach{$0(false)}
        if let rtc {
            stopping = true; self.rtc = nil; rtc.delegate = nil; rtc.muteLocalAudioStream(true); rtc.disableAudio(); rtc.leaveChannel(nil)
            AgoraRtcEngineKit.destroy { [weak self] in DispatchQueue.main.async { self?.stopping = false } }
        }
        emit("left",["reason":"ended"])
    }
    func rtcEngine(_ engine:AgoraRtcEngineKit,didJoinChannel channel:String,withUid uid:UInt,elapsed:Int) {
        DispatchQueue.main.async {
            guard self.rtc === engine else { return }
            self.joined = true; self.expiry?.cancel(); self.expiry = nil
            if !self.peer { self.remoteMissingAt = Date() }
            let callbacks = self.joining; self.joining = []; callbacks.forEach{$0(true)}
            self.emit("joined",["uid":uid]); self.emit("controls",self.snapshot)
        }
    }
    func rtcEngine(_ engine:AgoraRtcEngineKit,didJoinedOfUid uid:UInt,elapsed:Int) {
        DispatchQueue.main.async {
            guard self.rtc === engine else { return }; self.peer = true; self.remoteMissingAt = nil
            if let id = self.id,self.direction == "outgoing" { self.provider.reportOutgoingCall(with:id,connectedAt:Date()) }
            self.emit("remoteJoined",["present":true])
        }
    }
    func rtcEngine(_ engine:AgoraRtcEngineKit,didOfflineOfUid uid:UInt,reason:AgoraUserOfflineReason) {
        DispatchQueue.main.async { guard self.rtc === engine else { return };self.peer = false;self.remoteMissingAt = Date();self.emit("remoteLeft") }
    }
    func rtcEngine(_ engine:AgoraRtcEngineKit,tokenPrivilegeWillExpire token:String) { DispatchQueue.main.async { if self.rtc === engine { self.renew() } } }
    func rtcEngineRequestToken(_ engine:AgoraRtcEngineKit) { DispatchQueue.main.async { if self.rtc === engine { self.renew() } } }
    func rtcEngine(_ engine:AgoraRtcEngineKit,connectionChangedTo state:AgoraConnectionState,reason:AgoraConnectionChangedReason) {
        DispatchQueue.main.async {
            guard self.rtc === engine else { return };self.emit("connectionStateChanged",["state":state.rawValue])
            if state == .failed { self.fail() }
        }
    }
    func rtcEngine(_ engine:AgoraRtcEngineKit,didOccurError errorCode:AgoraErrorCode) { DispatchQueue.main.async { if self.rtc === engine { self.fail() } } }
}
