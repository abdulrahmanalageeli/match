import { describeFit } from '../../../src/compatibility/model.ts';
import { compareBeena } from '../../../src/beena/model.ts';

type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue => !!value && typeof value === 'object' && !Array.isArray(value);
const actors = ['abdulrahman', 'reham'] as const;
type Actor = typeof actors[number];
const reactionEmojis = ['❤️', '😂', '😮', '😢', '🙏', '👍'] as const;
function messageReactions(value: unknown, actor: Actor): unknown {
  if (!record(value)) return value;
  const { reactionBy, reactions: _reactions, ...message } = value;
  const own = record(reactionBy) ? reactionBy : {};
  return { ...message, reactions: value.deletedAt ? [] : reactionEmojis.flatMap(emoji => {
    const count = actors.filter(member => own[member] === emoji).length;
    return count ? [{ emoji, count, mine: own[actor] === emoji }] : [];
  }) };
}
const publicFields = ['displayName', 'age', 'gender', 'city', 'profession', 'bio', 'lookingFor', 'valuesStatement',
  'lifeTogether', 'education', 'marriageIntent', 'familyPreference', 'interestIds', 'appearanceVersion'] as const;
const publicBasics = ['spokenLanguages', 'preferredLanguage', 'languageOpenness', 'heightCm', 'weightKg', 'nationality', 'maritalStatus', 'currentWives', 'polygynyPreference',
  'marriageTimeline', 'meetingPreference', 'childrenCount', 'smoking', 'dressStyle', 'dressFlexibility'] as const;
const sensitiveBasics = ['tribalBackground', 'tribeName', 'religiousAffiliation', 'prayerPractice', 'skinTone'] as const;
function pick(value: RecordValue, keys: readonly string[]): RecordValue {
  return Object.fromEntries(keys.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]]));
}

function peerProfile(value: unknown, publishSensitive: boolean): RecordValue {
  if (!record(value)) return {};
  const result = pick(value, publicFields);
  if (record(value.marriageBasics)) result.marriageBasics = pick(value.marriageBasics,
    publishSensitive ? [...publicBasics, ...sensitiveBasics] : publicBasics);
  if (publishSensitive && record(value.publicAvatar)) result.publicAvatar = pick(value.publicAvatar, ['style', 'skinTone']);
  if (record(value.portrait)) result.portrait = pick(value.portrait, ['id', 'path', 'blur', 'revealPolicy', 'hasClear', 'revealed']);
  // SQL has already applied the member's explicit story-sharing choice.
  if (record(value.beenaStory)) result.beenaStory = pick(value.beenaStory, ['scenarioId', 'text']);
  return result;
}

/** Run on every state-shaped service-role RPC result before it leaves the edge.
 * Scoring uses stored answers unchanged; missing answers are never seeded from a demo.
 */
export function projectPairState<T>(value: T): T {
  if (!record(value) || !Object.hasOwn(value, 'profiles')) return value;
  if (!actors.includes(value.actor as Actor) || !record(value.profiles)) throw Error('Invalid tester state');
  const actor = value.actor as Actor, peer: Actor = actor === 'reham' ? 'abdulrahman' : 'reham';
  const own = record(value.profiles[actor]) ? value.profiles[actor] : {};
  const other = record(value.profiles[peer]) ? value.profiles[peer] : {};
  type ScoringProfile = Parameters<typeof describeFit>[0];
  // describeFit reads optional assessments; it does not require demographic defaults.
  const fit = describeFit({ ...own, id: actor, beena: null } as ScoringProfile,
    { ...other, id: peer, beena: null } as ScoringProfile).fit;
  // The SQL wrapper computes Beena before withholding the peer's private answers.
  fit.beena = record(value.beenaFit) ? value.beenaFit as unknown as ReturnType<typeof compareBeena> : compareBeena();
  const { sensitivePublication, ...state } = value;
  const profiles: RecordValue = {};
  if (Object.hasOwn(value.profiles, actor)) profiles[actor] = value.profiles[actor];
  if (Object.hasOwn(value.profiles, peer)) profiles[peer] = peerProfile(value.profiles[peer],
    record(sensitivePublication) && sensitivePublication[peer] === true);
  return { ...state, pairFit: fit, profiles,
    ...(Array.isArray(state.messages) ? { messages: state.messages.map(message => messageReactions(message, actor)) } : {}) } as T;
}
