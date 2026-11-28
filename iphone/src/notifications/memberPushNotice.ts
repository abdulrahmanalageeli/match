import { updateEvents, type UpdateEvent } from '../../admin/server/updateEvents.ts';
import type { Connection, ActivityNotification } from '../community/data';
import type { DemoSimulationEvent } from '../community/simulation';
import type { MemberNotice } from './MemberNoticeBanner';
import type { PushControls, PushOpen } from './push';

export type NoticeCategory = 'publication' | keyof Pick<PushControls, 'message' | 'connections' | 'family' | 'reminder' | 'analysis' | 'agreement' | 'account' | 'membership' | 'interest' | 'screenshot'>;
const updateCategories = {
  introduction:'connections', agreement:'agreement', journey:'agreement', rematch:'agreement',
  family_link:'family', family_room:'family', missed_call:'message', analysis:'analysis',
  interest:'interest', screenshot:'screenshot', application:'account', verification:'account',
  support:'account', safety:'account', membership:'membership', gift:'membership',
} as const satisfies Record<UpdateEvent extends `${infer Family}:${string}` ? Family : never, NoticeCategory>;
const deliveryCopy = {
  request:['connections','وصلك طلب تعارف'], mutual:['connections','قُبل طلب التعارف'],
  message:['message','وصلتك رسالة جديدة'], family:['family','وصلتك رسالة في جسر الأهل'],
  reminder:['reminder','تذكير بميثاق التعارف'], analysis:['analysis','لديك تحديث من لونا'],
  publication:['publication','وصلك جديد وُدَين'],
} as const;

export function pushCategory(push: PushOpen): NoticeCategory | undefined {
  if (push.kind === 'simulation') return;
  if (push.kind !== 'update') return deliveryCopy[push.kind][0];
  const family = push.event?.split(':')[0];
  return family && Object.hasOwn(updateCategories, family) ? updateCategories[family as keyof typeof updateCategories] : undefined;
}

export function memberPushNotice(push: PushOpen): Extract<MemberNotice,{kind:'push'}> | undefined {
  if (push.kind === 'simulation') return;
  let title: string;
  if (push.kind === 'update') {
    if (!push.event || !Object.hasOwn(updateEvents, push.event)) return;
    title = updateEvents[push.event][0];
  } else {
    title = push.kind === 'analysis' && push.analysisPhase ? (push.analysisPhase === 'shared'
      ? updateEvents['analysis:shared'][0] : updateEvents['analysis:invited'][0]) : deliveryCopy[push.kind][1];
  }
  // Only use shared semantic IDs for one-time outcomes. Recurring events on the same
  // conversation have distinct delivery IDs (older senders may lack one).
  let key: string;
  if (push.kind === 'request') key = 'request:' + push.requestId;
  else if (push.kind === 'mutual' || push.event === 'introduction:accepted') key = 'match:' + push.requestId;
  else if ((push.kind === 'message' || push.kind === 'family') && push.messageId) key = push.kind + ':' + push.messageId;
  else key = 'push:' + (push.deliveryId ?? crypto.randomUUID());
  return {kind:'push', key, push, title};
}

export function simulatedInterestNotices(rows: ActivityNotification[]) {
  return rows.filter(row => row.kind === 'interest' && row.person.isDemo && !row.readAt).map(row => ({
    kind:'push' as const, key:'interest:' + row.id, at:row.createdAt,
    push:{kind:'update' as const, event:'interest:received' as const, requestId:row.person.id},
    title:'اهتمام بملفك من', actor:row.person.alias,
  }));
}

export function simulatedChatNotices(rows: Connection[], log: DemoSimulationEvent[]) {
  const chats = new Map(rows.filter(row => row.status === 'accepted' && row.person.isDemo).map(row => [row.id,row]));
  const unread = new Map(Array.from(chats, ([id, chat]) => [id,chat.unreadCount ?? 0]));
  // An old reply stays in the simulation log after it has been read. When a new
  // reply arrives, only the unread tail of that specific conversation is eligible.
  return [...log].reverse().flatMap(entry => {
    const chat = entry.connectionId && chats.get(entry.connectionId);
    if (!chat || chat.person.id !== entry.personId) return [];
    const match = entry.kind === 'match';
    if (match) {
      if (chat.celebrationKey !== entry.id) return [];
    } else {
      const remaining = unread.get(chat.id) ?? 0;
      if (entry.kind !== 'reply' || !remaining) return [];
      unread.set(chat.id,remaining - 1);
    }
    const push: PushOpen = match ? {kind:'mutual', requestId:chat.id} : {kind:'message', requestId:chat.id, messageId:entry.id};
    return [{kind:'push' as const, push, at:entry.at, key:match ? 'match:' + chat.id : 'message:' + entry.id,
      title:match ? 'تعارف متبادل مع' : 'وصلتك رسالة من', actor:chat.person.alias}];
  }).reverse();
}
