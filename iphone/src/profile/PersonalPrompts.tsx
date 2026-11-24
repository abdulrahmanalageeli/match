import { HeartHandshake, Home, UsersRound } from '../BrandIcons';
import { answeredProfilePrompts, type ProfilePromptAnswers } from './profilePrompts';
import './profile-prompts.css';

const promptIcons = { lookingFor: UsersRound, lifeTogether: Home, valuesStatement: HeartHandshake };

export function PersonalPrompts({ answers }: { answers: ProfilePromptAnswers }) {
  const prompts = answeredProfilePrompts(answers);
  if (!prompts.length) return null;
  return <section className="mp-personal-prompts" aria-label="ملامح من حكايتي">
    <div className="mp-prompts-heading"><h2>ملامح من حكايتي</h2></div>
    <ul className="mp-prompt-list" role="list">
      {prompts.map(prompt => {
        const Icon = promptIcons[prompt.key];
        return <li className="mp-prompt-card" key={prompt.key}>
          <Icon size={16} aria-hidden="true"/>
          <div>
            <h3>{prompt.title}</h3>
            <p dir="auto">{prompt.answer}</p>
          </div>
        </li>;
      })}
    </ul>
  </section>;
}
