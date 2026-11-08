import type { Message } from "./data";

// Postgres orders on (created_at, id). JavaScript dates drop the microseconds
// in created_at, including those used by the read cursor and page boundaries.
function microseconds(iso: string) {
  const fraction = /\.(\d+)/.exec(iso)?.[1] ?? "";
  return Date.parse(iso) * 1000 + Number(fraction.padEnd(6, "0").slice(3, 6));
}
export function mergeMessages(previous: Message[], incoming: Message[]) {
  const rows = new Map(previous.map((m) => [m.id, m]));
  incoming.forEach((m) => {
    const old = rows.get(m.id);
    // Delayed responses cannot resurrect content or an already consumed photo.
    rows.set(m.id, old?.deletedAt ? old : old?.attachment?.openedAt && m.attachment ? { ...m, attachment: { ...m.attachment, openedAt: old.attachment.openedAt } } : m);
  });
  return [...rows.values()].map(message => {
    if (message.deletedAt) return { ...message, body: 'تم حذف هذه الرسالة', attachment: null, reply: null, reactions: [] };
    const deletedAt = message.reply?.deletedAt || (message.reply && rows.get(message.reply.id)?.deletedAt);
    return deletedAt && message.reply ? { ...message, reply: { ...message.reply, body: 'تم حذف هذه الرسالة', deletedAt } } : message;
  }).sort((a, b) => microseconds(a.createdAt) - microseconds(b.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
