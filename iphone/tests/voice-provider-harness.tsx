// Browser-only regression harness. Production entry points never import this file.
// The runner replaces only source.ts/transport.ts over Playwright routes.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { VoiceCallsProvider, useVoiceCalls } from "../src/voice/VoiceCalls";
import type { CommunitySource, Connection } from "../src/community/data";

const probe = (window as any).__voiceRace;
const source = { watch(listener: () => void) {
  probe.watchers.add(listener);
  return () => probe.watchers.delete(listener);
} } as CommunitySource;
const connection = { id: "request-fixture", status: "accepted", person: { id: "peer-fixture", alias: "اختبار" } } as Connection;
function Controls() {
  const voice = useVoiceCalls();
  return <button id="start-fixture" onClick={() => voice?.start(connection)}>Start fixture call</button>;
}
function Harness() {
  const [owner, setOwner] = useState("owner-a");
  probe.changeOwner = setOwner;
  return <VoiceCallsProvider key={owner} source={source} owner={owner} demo={false}><Controls/></VoiceCallsProvider>;
}
createRoot(document.getElementById("root")!).render(<Harness/>);
