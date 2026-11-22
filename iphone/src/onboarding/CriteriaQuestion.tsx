import { createContext, useContext, useId, type ReactNode } from 'react';
import { Check } from '../BrandIcons';
import { criteriaModes, type CriteriaMode, type PartnerCriteria } from '../compatibility/marriage';

export const CriteriaFeedback = createContext<{criterion?: keyof PartnerCriteria; text:string} | null>(null);

export function CriteriaQuestion({criterion, title, value, onChange, anyLabel, controls, children}: {
  criterion:keyof PartnerCriteria; title:string; value?:CriteriaMode; onChange:(mode:CriteriaMode)=>void;
  anyLabel?:string; controls?:ReactNode; children:ReactNode;
}) {
  const feedback = useContext(CriteriaFeedback);
  const message = feedback?.criterion === criterion ? feedback.text : undefined;
  const messageId = useId();
  return <fieldset className="nf-criterion" data-criterion={criterion} tabIndex={-1}
    aria-invalid={message ? true : undefined} aria-describedby={message ? messageId : undefined}>
    <legend>{title}</legend>
    {message && <p className="nf-intake-error" role="alert" id={messageId}>{message}</p>}
    {controls ?? <div className="nf-criterion-modes" role="group" aria-label={'أهمية ' + title}>
      {criteriaModes.map(mode=><button type="button" key={mode.value} aria-pressed={mode.value===value} onClick={()=>onChange(mode.value)}>
        {mode.value==='any' && anyLabel ? anyLabel : mode.label}{mode.value===value && <Check size={12} aria-hidden="true"/>}
      </button>)}
    </div>}
    {value && value!=='any' && <div className="nf-criterion-target">{children}</div>}
  </fieldset>;
}
