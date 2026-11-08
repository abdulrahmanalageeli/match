import { MotionPressButton, MotionReveal } from '../motion/Reanimated';
import type { MessageReaction, ReactionEmoji } from './data';

const choices: { emoji: ReactionEmoji; label: string }[] = [
  { emoji: '❤️', label: 'قلب' }, { emoji: '😂', label: 'ضحك' },
  { emoji: '😮', label: 'دهشة' }, { emoji: '😢', label: 'حزن' },
  { emoji: '🙏', label: 'امتنان' }, { emoji: '👍', label: 'إعجاب' },
];
const count = new Intl.NumberFormat('ar-SA');

export function ReactionPicker({ reactions = [], pending, choose }: {
  reactions?: MessageReaction[]; pending: boolean; choose: (reaction: ReactionEmoji | null) => void;
}) {
  const mine = reactions.find(reaction => reaction.mine)?.emoji;
  return <div className="cm-reaction-picker">
    <div className="cm-reaction-options" role="group" aria-label="التفاعل مع الرسالة" aria-busy={pending}>
      {choices.map(({ emoji, label }, index) => <MotionReveal key={emoji} delay={index * 28} duration={220} distance={6}>
        <MotionPressButton disabled={pending} aria-label={`${mine === emoji ? 'إزالة تفاعل' : 'تفاعل'} ${label}`}
          aria-pressed={mine === emoji} onClick={() => choose(mine === emoji ? null : emoji)}>
          <span aria-hidden="true">{emoji}</span>
        </MotionPressButton>
      </MotionReveal>)}
    </div>
    <p>{pending ? 'جارٍ حفظ التفاعل…' : mine ? 'اضغط على تفاعلك مرة أخرى لإزالته' : 'اختر تفاعلًا'}</p>
  </div>;
}

export function MessageReactions({ reactions, self, name, pending, disabled, open }: {
  reactions?: MessageReaction[]; self: boolean; name: string; pending: boolean; disabled: boolean; open: () => void;
}) {
  if (!reactions?.length) return null;
  return <div className="cm-message-reactions" data-self={self || undefined} aria-label="تفاعلات الرسالة" aria-busy={pending}>
    {reactions.map(reaction => {
      const label = choices.find(choice => choice.emoji === reaction.emoji)?.label ?? reaction.emoji;
      const who = reaction.mine ? reaction.count > 1 ? `أنت و${name}` : 'أنت' : name;
      return <MotionReveal key={`${reaction.emoji}-${reaction.mine}-${reaction.count}`} distance={4} duration={230}>
        <MotionPressButton disabled={disabled} className="cm-reaction-chip" data-mine={reaction.mine || undefined}
          aria-label={`${label} · ${who} · خيارات التفاعل`} aria-haspopup="dialog" onClick={open}>
          <span className="cm-reaction-pill"><span aria-hidden="true">{reaction.emoji}</span>{reaction.count > 1 && <small aria-hidden="true">{count.format(reaction.count)}</small>}</span>
        </MotionPressButton>
      </MotionReveal>;
    })}
  </div>;
}
