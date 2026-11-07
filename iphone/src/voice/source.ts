import { callRpc, cloud, cloudSessionId, CloudError } from "../cloud";
import type { PublicPerson } from "../community/data";

export type VoiceCall = {
  id: string;
  requestId: string;
  status: "ringing" | "active" | "ended";
  direction: "incoming" | "outgoing";
  createdAt: string;
  ringingUntil: string;
  acceptedAt: string | null;
  endedAt: string | null;
  endReason: "declined" | "cancelled" | "ended" | "missed" | "expired" | "unavailable" | null;
  person: PublicPerson | null;
};
export type VoiceCredentials = { appId: string; channel: string; uid: number; token: string; expiresAt: string; callId: string };
export type CallAction = "accept" | "decline" | "end";

export function voiceSource(owner: string) {
  async function rpc<T>(name: string, params: Record<string, unknown>) {
    return callRpc<T>(name, params, owner, AbortSignal.timeout(12_000));
  }
  return {
    start: (requestId: string, clientId: string) => rpc<VoiceCall>("marriage_call_start", { request_id: requestId, client_id: clientId }),
    state: (callId: string | null) => rpc<VoiceCall | null>("marriage_call_state", { call_id: callId }),
    act: (callId: string, action: CallAction) => rpc<VoiceCall>("marriage_call_act", { call_id: callId, action }),
    async credentials(callId: string): Promise<VoiceCredentials> {
      if (!cloud || await cloudSessionId() !== owner) throw new CloudError("يرجى تسجيل الدخول مجددًا.", 401);
      const { data, error } = await cloud.functions.invoke<VoiceCredentials>("voice-token", {
        body: { callId }, signal: AbortSignal.timeout(12_000),
      });
      if (error || !data || data.callId !== callId || !data.token || !data.appId || !data.channel || !Number.isInteger(data.uid)) {
        throw new Error("تعذّر الاتصال الآمن. حاول مجددًا.");
      }
      return data;
    },
  };
}

export function callProblem(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/PERMISSION|NotAllowed|denied|microphone/i.test(message)) return "اسمح باستخدام الميكروفون من إعدادات الجهاز لبدء المكالمة.";
  return /[\u0600-\u06ff]/.test(message) ? message : "تعذّر إتمام المكالمة. تحقق من الاتصال وحاول مجددًا.";
}
