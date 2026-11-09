import { Check } from "../BrandIcons";
import { skinTones, dressStyles, dressFlexibilities, type SkinTone, type DressStyle } from "../compatibility/appearance";
import { criteriaModes, type MarriageBasics, type PartnerCriteria, type CriteriaMode } from "../compatibility/marriage";
import type { ReactNode } from "react";
import "./appearance-fields.css";

export function ToneChoices({ selected, change, multiple = false }: { selected: readonly SkinTone[]; change: (tone: SkinTone) => void; multiple?: boolean }) {
  return <div className="nf-tone-choices" role="group" aria-label={multiple ? "درجات البشرة المقبولة" : "درجة البشرة"}>
    {skinTones.map(tone => <button type="button" key={tone.value} aria-label={tone.label} aria-pressed={selected.includes(tone.value)} onClick={() => change(tone.value)}>
      <span className="nf-tone-sample" style={{ backgroundColor: tone.color }} aria-hidden="true">{selected.includes(tone.value) && <Check size={15} />}</span><small>{tone.label}</small>
    </button>)}
  </div>;
}

export function SelfAppearanceFields({ value, gender, onChange, sensitiveAllowed = true }: { value: MarriageBasics; gender?: string; onChange: (patch: Partial<MarriageBasics>) => void; sensitiveAllowed?: boolean }) {
  return <>
    {sensitiveAllowed && <fieldset className="nf-appearance-self"><legend>لون البشرة — اختياري</legend><small>اختر الدرجة الأقرب للون بشرتك. قد تختلف الألوان قليلًا بحسب الشاشة.</small>
      <ToneChoices selected={value.skinTone ? [value.skinTone] : []} change={skinTone => onChange({ skinTone: value.skinTone === skinTone ? undefined : skinTone })} />
      <button type="button" className="nf-appearance-clear" onClick={() => onChange({ skinTone: undefined })}>أفضل عدم الإفصاح</button>
    </fieldset>}
    {gender === "woman" && <>
      <label>لباسي الحالي<select value={value.dressStyle ?? ""} onChange={e => onChange({ dressStyle: e.target.value as DressStyle || undefined })}><option value="">أفضل عدم الإفصاح</option>{dressStyles.map(style => <option key={style.value} value={style.value}>{style.label}</option>)}</select></label>
      <label>موقفك من تغيير اللباس<select value={value.dressFlexibility ?? ""} onChange={e => onChange({ dressFlexibility: e.target.value as MarriageBasics["dressFlexibility"] || undefined })}><option value="">أفضل إضافتها لاحقًا</option>{dressFlexibilities.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <small>الانفتاح على النقاش لا يعني الموافقة على التغيير. اختيارك يعود إليكِ.</small>
    </>}
  </>;
}

function Criterion({ title, mode, change, children }: { title: string; mode: CriteriaMode; change: (mode: CriteriaMode) => void; children: ReactNode }) {
  return <fieldset className="nf-criterion"><legend>{title}</legend><div className="nf-criterion-modes" role="group" aria-label={"أهمية " + title}>{criteriaModes.map(item => <button key={item.value} type="button" aria-pressed={mode === item.value} onClick={() => change(item.value)}>{item.label}{mode === item.value && <Check size={12} aria-hidden="true" />}</button>)}</div>{mode !== "any" && <div className="nf-criterion-target">{children}</div>}</fieldset>;
}

export function AppearanceCriteriaFields({ value, gender, onChange, sensitiveAllowed = true }: { value: PartnerCriteria; gender?: string; onChange: (patch: Partial<PartnerCriteria>) => void; sensitiveAllowed?: boolean }) {
  const selectedTones = value.skinTone?.values ?? [];
  const selectedStyles = value.dressStyle?.values ?? [];
  return <>
    {sensitiveAllowed && <Criterion title="لون البشرة" mode={value.skinTone?.mode ?? "any"} change={mode => onChange({ skinTone: mode === "any" ? { mode } : { ...value.skinTone, mode } })}>
      <p>اختر كل الدرجات التي تناسب تفضيلك.</p><ToneChoices multiple selected={selectedTones} change={tone => onChange({ skinTone: { mode: value.skinTone?.mode ?? "prefer", values: selectedTones.includes(tone) ? selectedTones.filter(v => v !== tone) : [...selectedTones, tone] } })} />
    </Criterion>}
    {gender === "man" && <>
      <Criterion title="لباس الشريكة الحالي" mode={value.dressStyle?.mode ?? "any"} change={mode => onChange({ dressStyle: mode === "any" ? { mode } : { ...value.dressStyle, mode } })}>
        <p>اختر الخيارات التي تناسبك كما هي الآن.</p><div className="nf-criterion-checks">{dressStyles.map(style => <label key={style.value}><input type="checkbox" checked={selectedStyles.includes(style.value)} onChange={e => onChange({ dressStyle: { mode: value.dressStyle?.mode ?? "prefer", values: e.target.checked ? [...selectedStyles, style.value] : selectedStyles.filter(v => v !== style.value) } })} />{style.label}</label>)}</div>
      </Criterion>
      <Criterion title="الانفتاح على تغيير اللباس" mode={value.dressFlexibility?.mode ?? "any"} change={mode => onChange({ dressFlexibility: mode === "any" ? { mode } : { target: "open_to_discussion", ...value.dressFlexibility, mode } })}>
        <label>ما الذي يناسبك؟<select value={value.dressFlexibility?.target ?? "open_to_discussion"} onChange={e => onChange({ dressFlexibility: { mode: value.dressFlexibility?.mode ?? "prefer", target: e.target.value as "open_to_discussion" | "open_to_change" } })}><option value="open_to_discussion">منفتحة على النقاش</option><option value="open_to_change">منفتحة على التغيير إذا اقتنعت به</option></select></label>
        <small>الانفتاح على النقاش وحده لا يعني الاستعداد للتغيير. هذه الاختيارات لا تُلغي تفضيلك للباس الحالي.</small>
      </Criterion>
    </>}
  </>;
}
