import Capacitor

final class MarriageBridgeController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(AppleMembershipPlugin())
        bridge?.registerPluginInstance(PrivateSessionPlugin())
        bridge?.registerPluginInstance(PrivatePhotoPlugin())
        bridge?.registerPluginInstance(NisfaynPushPlugin())
        bridge?.registerPluginInstance(NisfaynVoicePlugin())
        bridge?.registerPluginInstance(NisfaynFeedbackPlugin())
    }
}
