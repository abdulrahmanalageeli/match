import { useEffect, useRef, useState } from "react";
import { Check, Copy, Download, Eye, FileJson, Share2, X } from "../BrandIcons";
import { callRpc } from "../cloud";
import { interests } from "../compatibility/model";
import type { Profile } from "../types";

type Props = {
  mode: "export" | "visibility";
  owner: string;
  demo: boolean;
  profile?: Profile | null;
  close: () => void;
};

function sampleCopy(profile?: Profile | null) {
  return { demo: true, exportVersion: 1, exportedAt: new Date().toISOString(), profile: profile ?? null };
}

const ageFormat = new Intl.NumberFormat("ar-SA", { numberingSystem: "arab" });

function CandidatePreview({ profile }: { profile: Profile }) {
  const labels = interests.filter(({ id }) => profile.interestIds?.includes(id)).map(({ label }) => label);
  return <div className="st-candidate-preview">
    <strong>{profile.displayName}</strong>
    <span>{[ageFormat.format(profile.age) + " عامًا", profile.city, profile.profession].filter(Boolean).join(" · ")}</span>
    {profile.bio && <p>{profile.bio}</p>}
    {labels.length > 0 && <small>{labels.join("، ")}</small>}
  </div>;
}

export function MemberData({ mode, owner, demo, profile, close }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const contents = useRef<HTMLTextAreaElement>(null);
  const [attempt, retry] = useState(0);
  const [json, setJson] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [shareMode, setShareMode] = useState<"download" | "file" | "text">("download");
  const isExport = mode === "export";

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  useEffect(() => {
    if (!isExport) return;
    const controller = new AbortController();
    setJson("");
    setError("");
    setStatus("");
    async function load() {
      try {
        const data = demo ? sampleCopy(profile) :
          await callRpc<{ exportVersion: number }>("marriage_personal_data", {}, owner, controller.signal);
        if (controller.signal.aborted) return;
        if (!data || ![1, 2].includes(data.exportVersion)) throw new Error("تعذّر فتح نسخة بياناتك.");
        const body = JSON.stringify(data, null, 2);
        setJson(body);
        if (typeof navigator.share === "function") {
          try {
            const file = new File([body], "nisfayn-data.json", { type: "application/json" });
            setShareMode(navigator.canShare?.({ files: [file] }) ? "file" : "text");
          } catch { setShareMode("text"); }
        }
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error && /[\u0600-\u06ff]/.test(cause.message) ? cause.message : "تعذّر تحميل نسخة بياناتك.");
      }
    }
    void load();
    return () => controller.abort();
  }, [isExport, owner, demo, demo ? profile : null, attempt]);

  async function saveFile() {
    if (shareMode !== "download") {
      try {
        const data = shareMode === "file"
          ? { files: [new File([json], "nisfayn-data.json", { type: "application/json" })] }
          : { text: json };
        await navigator.share({ ...data, title: "نسخة بياناتي في وُدَين" });
      } catch (cause) {
        if (!(cause instanceof DOMException && cause.name === "AbortError")) {
          setStatus("تعذّرت المشاركة. يمكنك نسخ البيانات من النافذة.");
        }
      }
      return;
    }
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "nisfayn-data.json";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(json);
      setStatus("نُسخت البيانات.");
    } catch {
      contents.current?.focus();
      contents.current?.select();
      setStatus("حُدد النص. اختر «نسخ» من قائمة الجهاز.");
    }
  }

  return (
    <dialog className="st-dialog st-data-dialog" ref={dialog} dir="rtl" aria-labelledby="st-data-title"
      aria-describedby="st-data-detail" onCancel={event => { event.preventDefault(); close(); }}>
      <header className="st-data-head">
        <span className="st-dialog-icon" aria-hidden="true">{isExport ? <FileJson /> : <Eye />}</span>
        <button type="button" className="st-data-close" onClick={close} aria-label="إغلاق" autoFocus><X size={20} /></button>
      </header>
      <h2 id="st-data-title">{isExport ? "نسخة من بياناتي" : "خصوصية بيانات الملف"}</h2>
      {isExport ? <>
        <p id="st-data-detail">{demo ? "مثال يضم ملفك في هذه التجربة فقط." :
          "تتضمن نسختك حسابك وملفك وموافقاتك والرسائل التي كتبتها وخطوات التعارف التي وافقت عليها."}</p>
        {error ? <div className="st-data-state"><p role="alert">{error}</p><button type="button" className="btn-secondary" onClick={() => retry(attempt + 1)}>إعادة المحاولة</button></div> :
          json ? <>
            <textarea ref={contents} className="st-data-json" readOnly dir="ltr" aria-label="محتوى نسخة البيانات" value={json} />
            <div className="st-data-actions">
              <button type="button" className="btn-primary" onClick={() => void saveFile()}>
                {shareMode === "download" ? <Download size={16} /> : <Share2 size={16} />}
                {shareMode === "download" ? "تنزيل الملف" : shareMode === "file" ? "مشاركة الملف" : "مشاركة النص"}
              </button>
              <button type="button" className="btn-secondary" onClick={() => void copy()}><Copy size={16} />نسخ النص</button>
            </div>
            {status && <p className="st-data-result" role="status"><Check size={14} />{status}</p>}
          </> : <p className="st-data-state" role="status">جارٍ إعداد نسختك…</p>}
      </> : <>
        <p id="st-data-detail">تختلف المعلومات الظاهرة بحسب مرحلة التعارف.</p>
        <dl className="st-data-visibility">
          <dt>عند الترشيح</dt><dd>{profile ? <CandidatePreview profile={profile} /> : "سيظهر اسم العرض والعمر والمدينة والمهنة والنبذة والاهتمامات بعد إكمال ملفك."}
            يظهر ملخص التوافق للطرف المرشّح، وقد يرى تفضيلك لإشراك الأسرة في الترشيح الخاص.</dd>
          <dt>بعد القبول المتبادل</dt><dd>تتاح المحادثة بعد قبول طلب التعارف. في الترشيح الخاص، تُشارك وسيلة التواصل التي أضفتها عندما يقبل الطرفان.</dd>
          <dt>داخل حسابك</dt><dd>بريد تسجيل الدخول وسجل الموافقات وتفاصيل إجاباتك محفوظة لحسابك. قد تعكس أسباب التوافق موضوعات مشتركة من الإجابات.</dd>
        </dl>
      </>}
    </dialog>
  );
}
