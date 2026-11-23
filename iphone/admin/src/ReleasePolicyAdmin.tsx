import { useEffect, useRef, useState, type FormEvent } from 'react';
import { call, friendly } from './client';
import './release-policy.css';

type Platform = 'ios' | 'web';
type Policy = {
  minimumBuild: number;
  recommendedBuild: number;
  storeUrl: string | null;
  maintenanceUntil: string | null;
  revision: number;
};
type Draft = { minimum: string; recommended: string; store: string; window: string };
const platforms = { ios: 'iPhone', web: 'الويب' };
const number = new Intl.NumberFormat('ar-SA', { useGrouping: false });
const clock = new Intl.DateTimeFormat('ar-SA-u-ca-gregory', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Riyadh' });
const future = (end: string | null) => end !== null && Date.parse(end) > Date.now();
const endLabel = (end: string) => clock.format(new Date(end)) + ' بتوقيت الرياض';

function fromPolicy(policy: Policy): Draft {
  return { minimum: String(policy.minimumBuild), recommended: String(policy.recommendedBuild), store: policy.storeUrl ?? '', window: future(policy.maintenanceUntil) ? 'keep' : 'off' };
}

function listing(input: string): string | null {
  const value = input.trim();
  const id = /^[1-9][0-9]{0,18}$/.test(value) ? value :
    /^https:\/\/apps\.apple\.com\/(?:[a-z]{2}\/)?app\/(?:[\p{L}\p{N}%._~-]+\/)?id([1-9][0-9]{0,18})\/?$/u.exec(value)?.[1];
  return id ? 'https://apps.apple.com/app/id' + id : null;
}

function PolicySummary({ policy }: { policy: Policy }) {
  return <dl className="wd-release-summary">
    <div><dt>التحديث الإلزامي</dt><dd>{policy.minimumBuild ? 'للبناء الأقدم من ' + number.format(policy.minimumBuild) : 'متوقف'}</dd></div>
    <div><dt>تذكير بالتحديث</dt><dd>{policy.recommendedBuild > policy.minimumBuild ? 'للبناء الأقدم من ' + number.format(policy.recommendedBuild) : 'متوقف'}</dd></div>
    <div><dt>الصيانة</dt><dd>{future(policy.maintenanceUntil) ? 'حتى ' + endLabel(policy.maintenanceUntil!) : 'متوقفة'}</dd></div>
  </dl>;
}

function PolicyEditor({ platform }: { platform: Platform }) {
  const [saved, setSaved] = useState<Policy | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState<Policy | null>(null);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const reviewHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (preview) reviewHeading.current?.focus();
  }, [preview]);

  function accept(policy: Policy) {
    setSaved(policy);
    setDraft(fromPolicy(policy));
    setPreview(null);
  }

  useEffect(() => {
    let live = true;
    setSaved(null);
    setDraft(null);
    setPreview(null);
    setError('');
    setNotice('');
    void call<Policy>('wudayn_release_policy', { target_platform: platform }).then(data => {
      if (live) accept(data);
    }).catch(reason => { if (live) setError(friendly(reason)); });
    return () => { live = false; };
  }, [platform, reload]);

  useEffect(() => {
    const end = saved?.maintenanceUntil;
    if (!end || !future(end)) return;
    const timer = window.setTimeout(() => setDraft(current => current && { ...current, window: current.window === 'keep' ? 'off' : current.window }), Date.parse(end) - Date.now() + 10);
    return () => window.clearTimeout(timer);
  }, [saved?.maintenanceUntil]);

  function edit(key: keyof Draft, value: string) {
    setDraft(current => current && { ...current, [key]: value });
    setNotice('');
    setError('');
  }

  function review(event: FormEvent) {
    event.preventDefault();
    if (!saved || !draft) return;
    setError('');
    setNotice('');
    const minimumBuild = Number(draft.minimum), recommendedBuild = Number(draft.recommended);
    if (![draft.minimum, draft.recommended].every(value => /^\d{1,6}$/.test(value))) {
      setError('أدخل رقم بناء صحيحًا بين ٠ و٩٩٩٩٩٩.');
      return;
    }
    if (recommendedBuild > 0 && recommendedBuild < minimumBuild) {
      setError('اجعل البناء الموصى به مساويًا للحد الإلزامي أو أحدث منه، أو أدخل صفرًا لإيقاف التذكير.');
      return;
    }
    const storeUrl = platform === 'ios' ? listing(draft.store) : null;
    if (platform === 'ios' && !storeUrl && (draft.store.trim() || minimumBuild || recommendedBuild)) {
      setError('أدخل رابط صفحة وُدَين على App Store أو معرّف التطبيق الرقمي.');
      return;
    }
    const currentEnd = future(saved.maintenanceUntil) ? saved.maintenanceUntil : null;
    const maintenanceUntil = draft.window === 'keep' ? currentEnd : draft.window === 'off' ? null : new Date(Date.now() + Number(draft.window) * 60000).toISOString();
    if (minimumBuild === saved.minimumBuild && recommendedBuild === saved.recommendedBuild && storeUrl === saved.storeUrl && maintenanceUntil === currentEnd) {
      setNotice('هذه الإعدادات مطبّقة بالفعل.');
      return;
    }
    setPreview({ revision: saved.revision, minimumBuild, recommendedBuild, storeUrl, maintenanceUntil });
  }

  async function save() {
    if (!preview || lock.current) return;
    if (preview.maintenanceUntil && !future(preview.maintenanceUntil)) {
      setPreview(null);
      setError('انتهت فترة الصيانة أثناء المراجعة. راجع المدة قبل التطبيق.');
      return;
    }
    lock.current = true;
    setSaving(true);
    setError('');
    try {
      accept(await call<Policy>('wudayn_set_release_policy', {
        target_platform: platform, expected_revision: preview.revision, minimum_build: preview.minimumBuild,
        recommended_build: preview.recommendedBuild, store_url: preview.storeUrl, maintenance_until: preview.maintenanceUntil,
      }));
      setNotice('طُبّقت الإعدادات على ' + platforms[platform] + '.');
    } catch (reason) {
      setError(friendly(reason));
      setPreview(null);
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }

  return <div className="wd-release-editor">
    {saved && draft ? preview ? <section className="wd-release-review" aria-label="مراجعة سياسة الإصدار">
      <h3 ref={reviewHeading} tabIndex={-1}>ما سيراه مستخدمو {platforms[platform]}</h3>
      <ul>
        {future(preview.maintenanceUntil) && <li>تتوقف الخدمة حتى {endLabel(preview.maintenanceUntil!)}.</li>}
        {preview.minimumBuild > 0 && <li>يلزم {platform === 'ios' ? 'تحديث التطبيق' : 'إعادة تحميل الموقع'} للبناء الأقدم من {number.format(preview.minimumBuild)} قبل المتابعة.</li>}
        {preview.recommendedBuild > preview.minimumBuild && <li>يمكن {preview.minimumBuild > 0 ? 'لمن يستخدم البناء ' + number.format(preview.minimumBuild) + ' وحتى ' + number.format(preview.recommendedBuild - 1) : 'لمن يستخدم بناءً أقدم من ' + number.format(preview.recommendedBuild)} تأجيل التحديث.</li>}
        {!preview.minimumBuild && !preview.recommendedBuild && !future(preview.maintenanceUntil) && <li>يمكن للجميع الدخول مباشرة.</li>}
      </ul>
      {preview.storeUrl && <a href={preview.storeUrl} target="_blank" rel="noreferrer">فتح صفحة وُدَين في App Store ↗</a>}
      {preview.minimumBuild > saved.minimumBuild && <p>تأكّد من إتاحة البناء المطلوب للمستخدمين قبل تطبيقه.</p>}
      <div className="wd-admin-actions"><button className="primary" type="button" disabled={saving} onClick={() => void save()}>{saving ? 'جارٍ التطبيق…' : 'تأكيد التطبيق'}</button>
        <button className="secondary" type="button" disabled={saving} onClick={() => setPreview(null)}>عودة للتعديل</button></div>
    </section> : <>
      <h3>الإعدادات الحالية</h3>
      <PolicySummary policy={saved}/>
      <form className="wd-conduct-form" onSubmit={review}>
        <fieldset><legend>بناء التطبيق</legend>
          <p className="wd-quiet">استخدم رقم البناء المنشور، أو أدخل صفرًا لإيقاف الشرط.</p>
          <div className="wd-admin-grid">
            <label>الحد الأدنى الإلزامي<input type="number" dir="ltr" min="0" max="999999" required value={draft.minimum} onChange={e => edit('minimum', e.target.value)}/></label>
            <label>البناء الموصى به<input type="number" dir="ltr" min="0" max="999999" required value={draft.recommended} onChange={e => edit('recommended', e.target.value)}/></label>
          </div>
          {platform === 'ios' && <label>رابط App Store أو معرّف التطبيق<input type="text" dir="ltr" value={draft.store} placeholder="apps.apple.com" onChange={e => edit('store', e.target.value)}/></label>}
        </fieldset>
        <label><span id="wd-release-maintenance-label">مدة الصيانة</span><select aria-labelledby="wd-release-maintenance-label" value={draft.window} onChange={e => edit('window', e.target.value)}>
          <option value="off">الصيانة متوقفة</option>
          {future(saved.maintenanceUntil) && <option value="keep">حتى {endLabel(saved.maintenanceUntil!)}</option>}
          <option value="30">٣٠ دقيقة</option><option value="60">ساعة واحدة</option><option value="120">ساعتان</option><option value="1440">٢٤ ساعة</option>
        </select></label>
        <p className="wd-quiet">تبقى لوحة الإدارة متاحة أثناء الصيانة والتحديث الإلزامي.</p>
        <div className="wd-admin-actions"><button className="primary">مراجعة التغييرات</button>
          {(saved.minimumBuild > 0 || saved.recommendedBuild > 0 || future(saved.maintenanceUntil)) && <button className="text-button" type="button" onClick={() => {
            setError(''); setNotice(''); setPreview({ ...saved, minimumBuild: 0, recommendedBuild: 0, maintenanceUntil: null });
          }}>إيقاف التحديثات والصيانة</button>}</div>
      </form>
    </> : !error && <p role="status" className="wd-quiet">جارٍ تحميل إعدادات الإصدار…</p>}
    {error && <div className="notice error" role="alert">{error} <button type="button" className="text-button" onClick={() => setReload(n => n + 1)}>إعادة تحميل الإعدادات</button></div>}
    {notice && <p className="notice" role="status">{notice}</p>}
  </div>;
}

export function ReleasePolicyAdmin() {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<Platform>('ios');
  return <details className="panel wd-release" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>إصدارات التطبيق والصيانة</summary>
    {open && <><div className="wd-conduct-nav" role="group" aria-label="منصة الإصدار">
      {(Object.keys(platforms) as Platform[]).map(key => <button type="button" key={key} aria-pressed={key === platform} onClick={() => setPlatform(key)}>{platforms[key]}</button>)}
    </div><PolicyEditor key={platform} platform={platform}/></>}
  </details>;
}
