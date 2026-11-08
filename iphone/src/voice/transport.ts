import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import type { IAgoraRTCClient, IMicrophoneAudioTrack } from "agora-rtc-sdk-ng";
import type { VoiceCredentials } from "./source";

type VoiceEvents = {
  peer: (present: boolean) => void;
  reconnecting: (value: boolean) => void;
  renew: () => void;
  ended: () => void;
  error: (error: unknown) => void;
  playbackBlocked: (blocked?: boolean) => void;
};
export type VoiceTransport = {
  join: (credentials: VoiceCredentials, initiallyMuted?: boolean) => Promise<void>;
  leave: () => Promise<void>;
  mute: (muted: boolean) => Promise<void>;
  speaker: (enabled: boolean) => Promise<void>;
  renew: (token: string) => Promise<void>;
  resume: () => Promise<boolean>;
  play: () => void;
};
interface NativeVoice {
  join(options: Pick<VoiceCredentials, "appId" | "channel" | "token" | "uid"> & { muted?: boolean }): Promise<{ uid: number }>;
  leave(): Promise<void>;
  mute(options: { muted: boolean }): Promise<void>;
  setSpeaker(options: { enabled: boolean }): Promise<void>;
  renewToken(options: { token: string }): Promise<void>;
  addListener(event: string, listener: (data: { state?: number; code?: number; message?: string; reason?: string }) => void): Promise<PluginListenerHandle>;
}
const native = registerPlugin<NativeVoice>("NisfaynVoice");
export const nativeVoice = Capacitor.getPlatform() === "ios" && Capacitor.isNativePlatform();
let nativeCleanup: Promise<void> = Promise.resolve();
let webSdk: Promise<typeof import("agora-rtc-sdk-ng")> | undefined;
const loadWebSdk = () => webSdk ??= import("agora-rtc-sdk-ng").catch(error => { webSdk = undefined; throw error; });
// Warm only the downloaded code while ringing. Capture and channel access still
// wait for the accepted call and its server-issued credentials.
export async function prepareVoiceTransport() {
  if (!nativeVoice) await loadWebSdk();
}

export function createVoiceTransport(events: VoiceEvents): VoiceTransport {
  let closed = false;
  if (nativeVoice) {
    const listeners: PluginListenerHandle[] = [];
    let leaving: Promise<void> | undefined;
    async function listen(name: string, callback: Parameters<NativeVoice["addListener"]>[1]) {
      const listener = await native.addListener(name, data => { if (!closed) callback(data); });
      if (closed) await listener.remove(); else listeners.push(listener);
    }
    return {
      async join(credentials, initiallyMuted=false) {
        await nativeCleanup;
        if (closed) return;
        await Promise.all([
          listen("remoteJoined", () => events.peer(true)),
          listen("remoteLeft", () => events.peer(false)),
          listen("left", events.ended),
          listen("error", data => events.error(new Error(data.message || "Voice connection failed"))),
          listen("tokenWillExpire", events.renew),
          listen("tokenExpired", events.renew),
          listen("connectionStateChanged", data => {
            if (data.state === 5) events.error(new Error("Voice connection failed"));
            else events.reconnecting(data.state === 4);
          }),
        ]);
        if (closed) return;
        await native.join({...credentials,muted:initiallyMuted});
      },
      leave() {
        if (leaving) return leaving;
        closed = true;
        // Start native teardown immediately. A later call waits for destruction,
        // so a delayed leave from this transport cannot stop a new session.
        leaving = Promise.all([native.leave(), ...listeners.splice(0).map(listener => listener.remove())]).then(() => {});
        nativeCleanup = leaving.catch(() => {});
        return leaving;
      },
      mute: muted => native.mute({ muted }),
      speaker: enabled => native.setSpeaker({ enabled }),
      renew: token => native.renewToken({ token }),
      async resume() { return !closed; },
      play() {},
    };
  }
  let client: IAgoraRTCClient | undefined;
  let microphone: IMicrophoneAudioTrack | undefined;
  let removeAutoplay: (() => void) | undefined;
  let resumeAudio: (() => void) | undefined;
  let leaving: Promise<void> | undefined;
  const releaseMicrophone = () => {
    microphone?.removeAllListeners();
    microphone?.stop();
    microphone?.close();
  };
  const play = () => {
    if (closed) return;
    resumeAudio?.();
    client?.remoteUsers.forEach(user => user.audioTrack?.play());
  };
  return {
    async join(credentials, initiallyMuted=false) {
      const { default: Agora } = await loadWebSdk();
      if (closed) return;
      Agora.setLogLevel(4);
      Agora.disableLogUpload();
      const blocked = () => { if (!closed) events.playbackBlocked(); };
      const audioState = (state: string) => {
        if (state === "interrupted" || state === "suspended") blocked();
        else if (!closed && state === "running") events.playbackBlocked(false);
      };
      Agora.onAutoplayFailed = blocked;
      Agora.on("audio-context-state-changed", audioState);
      resumeAudio = () => Agora.resumeAudioContext();
      removeAutoplay = () => {
        if (Agora.onAutoplayFailed === blocked) Agora.onAutoplayFailed = undefined;
        Agora.off("audio-context-state-changed", audioState);
      };
      const rtc = Agora.createClient({ mode: "rtc", codec: "vp8" });
      client = rtc;
      rtc.on("user-joined", () => { if (!closed) events.peer(true); });
      rtc.on("user-left", () => { if (!closed) events.peer(false); });
      rtc.on("user-published", (user, mediaType) => {
        if (closed || mediaType !== "audio") return;
        void rtc.subscribe(user, "audio").then(() => {
          if (!closed) { user.audioTrack?.play(); events.peer(true); }
        }).catch(error => { if (!closed) events.error(error); });
      });
      rtc.on("connection-state-change", state => {
        if (closed) return;
        if (state === "DISCONNECTED") events.error(new Error("Voice connection failed"));
        else events.reconnecting(state === "RECONNECTING");
      });
      rtc.on("token-privilege-will-expire", () => { if (!closed) events.renew(); });
      rtc.on("token-privilege-did-expire", () => { if (!closed) events.renew(); });
      try {
        microphone = await Agora.createMicrophoneAudioTrack({ AEC: true, ANS: true, AGC: true, encoderConfig: "speech_standard" });
        if (closed) { microphone.close(); return; }
        microphone.on("track-ended", () => { if (!closed) events.error(new Error("Microphone capture interrupted")); });
        await rtc.join(credentials.appId, credentials.channel, credentials.token, credentials.uid);
        if (closed) { microphone.close(); await rtc.leave(); return; }
        if(initiallyMuted)await microphone.setMuted(true);
        if(closed){microphone.close();await rtc.leave();return;}
        await rtc.publish(microphone);
        if (closed) { microphone.close(); await rtc.leave(); }
      } catch (error) {
        closed = true;
        releaseMicrophone();
        rtc.removeAllListeners(); removeAutoplay?.();
        await rtc.leave().catch(() => {});
        throw error;
      }
    },
    leave() {
      if (leaving) return leaving;
      closed = true;
      releaseMicrophone();
      client?.remoteUsers.forEach(user => user.audioTrack?.stop());
      client?.removeAllListeners();
      removeAutoplay?.();
      leaving = Promise.resolve(client?.leave()).then(() => {});
      return leaving;
    },
    async mute(muted) { if (!closed) await microphone?.setMuted(muted); },
    async speaker() {}, // Browsers select the audio output; only iOS exposes this control.
    async renew(token) { if (!closed) await client?.renewToken(token); },
    async resume() {
      if (closed || !microphone || microphone.getMediaStreamTrack().readyState === "ended" || client?.connectionState === "DISCONNECTED") return false;
      play();
      return true;
    },
    play,
  };
}
