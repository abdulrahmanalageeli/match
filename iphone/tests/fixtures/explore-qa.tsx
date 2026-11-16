import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Community } from '../../src/community/Community';
import { demoCommunity, demoProfile } from '../../src/community/data';
import { initializeDevicePreferences } from '../../src/settings/preferences';
import '../../src/design.css';
import '../../src/flows.css';
import '../../src/screens.css';
import '../../src/motion.css';
import '../../src/community/arrivalDiscovery.css';
import '../../src/community/arrivalChat.css';
import '../../src/arrivalSurfaces.css';
import '../../src/typography.css';

// The real Explore components with fictional local data; no login or hosted writes.
const source = demoCommunity(() => ({ ...demoProfile, gender: 'man' }));
const noop = () => {};

function ExplorePreview() {
  const [tab, setTab] = useState<'discover' | 'curated' | 'inbox' | 'chats'>('discover');
  return <div className="phone-app">
    <Community source={source} tab={tab} onTab={setTab} viewerGender="man"
      onMutual={noop} onConversationOpened={noop} onHome={() => setTab('curated')}
      onAccount={noop} paused={false} onResume={noop} />
  </div>;
}

initializeDevicePreferences();
createRoot(document.getElementById('root')!).render(<ExplorePreview />);
