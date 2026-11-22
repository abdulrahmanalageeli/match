import { ChevronDown } from '../BrandIcons';
import { arabicNumber } from './draft';

export function RegistrationProgress({ stages, index }: {
  stages: readonly { key: string; label: string }[];
  index: number;
}) {
  const position = `المرحلة ${arabicNumber(index + 1)} من ${arabicNumber(stages.length)}`;
  return <details className="wd-registration-progress">
    <summary aria-label={`مراحل إعداد الملف، ${position}، ${stages[index].label}`}>
      <span className="wd-stage-label">{stages[index].label}<ChevronDown size={15} aria-hidden="true"/></span>
      <span className="wd-stage-count">{position}</span>
      <span className="nf-intake-meter" aria-hidden="true">
        {stages.map((stage, i) => <i key={stage.key} data-state={i < index ? 'done' : i === index ? 'current' : undefined}/>)}
      </span>
    </summary>
    <ol aria-label="ترتيب مراحل التسجيل">
      {stages.map((stage, i) => <li key={stage.key} aria-current={i === index ? 'step' : undefined}>
        <span aria-hidden="true">{arabicNumber(i + 1)}</span>
        {stage.label}
        {i === index && <small>أنت هنا</small>}
      </li>)}
    </ol>
  </details>;
}
