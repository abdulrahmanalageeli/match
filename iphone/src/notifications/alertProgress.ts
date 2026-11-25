import type { CommunitySource, Connection, StepProgress } from '../community/data';
import { canRetryRead } from '../community/readRecovery.ts';

const batchSize = 24;

export async function readAlertProgress(source: CommunitySource, connections: Connection[], previous?: Map<string, StepProgress>): Promise<Map<string, StepProgress>> {
  const groups = new Map<CommunitySource, string[]>();
  const progress = new Map<string, StepProgress>();
  for (const connection of connections) {
    const last = previous?.get(connection.id);
    if (last) progress.set(connection.id, last);
    const owner = connection.person.isDemo ? source.demoInteractions ?? source : source;
    const ids = groups.get(owner);
    if (ids) ids.push(connection.id);
    else groups.set(owner, [connection.id]);
  }

  async function readGroup(owner: CommunitySource, ids: string[]) {
    if (owner.alertProgress) {
      try {
        const batch = await owner.alertProgress(ids);
        for (const id of ids) {
          if (batch[id]) progress.set(id, batch[id]);
          else progress.delete(id);
        }
        return;
      } catch (error) {
        // An older deployment can serve these reads via the individual RPC.
        if ((error as { status?: number } | null)?.status !== 404) {
          if (!canRetryRead(error)) for (const id of ids) progress.delete(id);
          return;
        }
      }
    }
    if (owner.progress) {
      const read = owner.progress.bind(owner);
      await Promise.all(ids.map(async id => {
        try { progress.set(id, await read(id)); }
        catch (error) { if (!canRetryRead(error)) progress.delete(id); }
      }));
    }
  }
  const reads = [];
  for (const [owner, ids] of groups) {
    for (let i = 0; i < ids.length; i += batchSize) reads.push(readGroup(owner, ids.slice(i, i + batchSize)));
  }
  await Promise.all(reads);
  return progress;
}
