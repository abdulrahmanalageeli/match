import { HeartHandshake, Home, MessageCircle, UsersRound } from '../BrandIcons';
import { answeredProfilePrompts, type ProfilePromptAnswers, type PublicStarterKey } from './profilePrompts';
import './profile-prompts.css';

const promptIcons = { lookingFor: UsersRound, lifeTogether: Home, valuesStatement: HeartHandshake };

export function ProfileStarterAction({onClick, title, compact = false}: {onClick: () => void; title: string; compact?: boolean}) {
  return <button type="button" className="mp-ask-starter" data-compact={compact || undefined} title="اسأل عن هالنقطة" onClick={onClick} aria-label={`اسأل عن هالنقطة · ${title}`}>
    <MessageCircle size={14} aria-hidden="true"/>{!compact && <span>اسأل عن هالنقطة</span>}
  </button>;
}

export function PersonalPrompts({ answers, onAsk, askLabelShown }: { answers: ProfilePromptAnswers; askLabelShown?: boolean; onAsk?: (key: PublicStarterKey) => void }) {
  const prompts = answeredProfilePrompts(answers);
  if (!prompts.length) return null;
  return <section className="mp-personal-prompts" aria-label="ملامح من حكايتي">
    <div className="mp-prompts-heading"><h2>ملامح من حكايتي</h2></div>
    <ul className="mp-prompt-list" role="list">
      {prompts.map((prompt, index) => {
        const Icon = promptIcons[prompt.key];
        return <li className="mp-prompt-card" key={prompt.key}>
          <Icon size={16} aria-hidden="true"/>
          <div>
            <div className="mp-prompt-title"><h3>{prompt.title}</h3>
              {onAsk && <ProfileStarterAction title={prompt.title} compact={askLabelShown || index > 0} onClick={() => onAsk(prompt.key)}/>}
            </div>
            <p dir="auto">{prompt.answer}</p>
          </div>
        </li>;
      })}
    </ul>
  </section>;
}
