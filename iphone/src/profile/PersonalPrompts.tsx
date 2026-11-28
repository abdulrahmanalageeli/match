import { HeartHandshake, Home, MessageCircle, UsersRound } from '../BrandIcons';
import { answeredProfilePrompts, type ProfilePromptAnswers, type PublicStarterKey } from './profilePrompts';
import './profile-prompts.css';

const promptIcons = { lookingFor: UsersRound, lifeTogether: Home, valuesStatement: HeartHandshake };
const familyPromptTitles = { lookingFor: 'صفات الشريك', lifeTogether: 'تصوّر الحياة المشتركة', valuesStatement: 'القيم في العلاقة' };

export function ProfileStarterAction({onClick, title, compact = false}: {onClick: () => void; title: string; compact?: boolean}) {
  return <button type="button" className="mp-ask-starter" data-compact={compact || undefined} title="اسأل عن هالنقطة" onClick={onClick} aria-label={`اسأل عن هالنقطة · ${title}`}>
    <MessageCircle size={14} aria-hidden="true"/>{!compact && <span>اسأل عن هالنقطة</span>}
  </button>;
}

export function PersonalPrompts({ answers, onAsk, askLabelShown, familyManaged = false }: { answers: ProfilePromptAnswers; askLabelShown?: boolean; familyManaged?: boolean; onAsk?: (key: PublicStarterKey) => void }) {
  const prompts = answeredProfilePrompts(answers);
  if (!prompts.length) return null;
  const heading = familyManaged ? 'تطلعات وقيم' : 'ملامح من حكايتي';
  return <section className="mp-personal-prompts" aria-label={heading}>
    <div className="mp-prompts-heading"><h2>{heading}</h2></div>
    <ul className="mp-prompt-list" role="list">
      {prompts.map((prompt, index) => {
        const Icon = promptIcons[prompt.key];
        const title = familyManaged ? familyPromptTitles[prompt.key] : prompt.title;
        return <li className="mp-prompt-card" key={prompt.key}>
          <Icon size={16} aria-hidden="true"/>
          <div>
            <div className="mp-prompt-title"><h3>{title}</h3>
              {onAsk && <ProfileStarterAction title={title} compact={askLabelShown || index > 0} onClick={() => onAsk(prompt.key)}/>}
            </div>
            <p dir="auto">{prompt.answer}</p>
          </div>
        </li>;
      })}
    </ul>
  </section>;
}
