import { Capacitor } from "@capacitor/core";
import { cloud, cloudSelected, cloudRequest } from "./cloud";

const configured = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const native = Capacitor.isNativePlatform();
export const serviceReady = cloudSelected
  ? Boolean(cloud)
  : native
    ? configured.startsWith("https://")
    : Boolean(configured) || import.meta.env.DEV;
const base = configured || "/api";
export class ServiceError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export async function request<T>(
  path: string,
  method = "GET",
  token?: string,
  body?: unknown,
): Promise<T> {
  if (!serviceReady)
    throw new Error(
      "الخدمة غير متصلة حاليًا. يمكنك استكشاف التجربة التوضيحية.",
    );
  if (cloudSelected)
    return (await cloudRequest(path, method, token, body)) as T;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 18000);
  try {
    const res = await fetch(base + path, {
      method,
      headers: {
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      cache: "no-store",
      signal: controller.signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const fallback: Record<number, string> = {
        400: "راجع البيانات المدخلة وحاول مجددًا.",
        401: "بيانات الدخول غير صحيحة أو انتهت الجلسة.",
        403: "هذا الإجراء غير متاح لحسابك حاليًا.",
        404: "لم يعد هذا الترشيح متاحًا.",
        409: "تعذّر إتمام الطلب. راجع حالة الحساب أو سجّل الدخول.",
        429: "طلبات كثيرة. انتظر قليلًا وحاول مجددًا.",
      };
      const message =
        typeof json?.error === "string" && /[\u0600-\u06ff]/.test(json.error)
          ? json.error
          : fallback[res.status] || "تعذّر الاتصال بالخدمة. حاول مجددًا.";
      throw new ServiceError(message, res.status);
    }
    if (!json) throw new Error("تعذّر قراءة رد الخدمة. حاول مجددًا.");
    return json as T;
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw new Error("تعذّر الاتصال بالخدمة. تحقق من اتصالك وحاول مجددًا.");
  } finally {
    clearTimeout(timer);
  }
}
