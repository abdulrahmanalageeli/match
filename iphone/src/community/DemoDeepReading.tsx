import type { PublicPerson } from './data';
import type { DeepAnalysisSource } from './deepCompatibilityModel';
import type { WatchUpdates } from './updates';
import { DeepCompatibility } from './DeepCompatibility';
import { Sheet } from './Sheet';

export function DemoDeepReading({ person, read, watch, open, onClose }: {
  person:PublicPerson; read:DeepAnalysisSource; watch:WatchUpdates; open:boolean; onClose():void;
}) {
  if (!open) return null;
  return <DeepCompatibility source={read} watch={watch} connectionId={person.id} peerName={person.alias}
    open={open} onOpenChange={value=>{if(!value)onClose();}} profileRequest
    sheet={content=><Sheet title="تحليل وُدَين المعمّق" className="wd-deep-sheet" onClose={onClose}>{content}</Sheet>}/>;
}
