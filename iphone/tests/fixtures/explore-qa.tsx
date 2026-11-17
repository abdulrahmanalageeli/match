import {MembershipAccess} from '../../src/membership/access';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Community } from '../../src/community/Community';
import { demoCommunity, demoProfile } from '../../src/community/data';
import { initializeDevicePreferences } from '../../src/settings/preferences';
import { Settings } from '../../src/settings/Settings';
import { MemberTabs } from '../../src/Home';
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
  const [settings, setSettings] = useState(false);
  const [paused, setPaused] = useState(false);
  const show = (next: typeof tab) => { setTab(next); setSettings(false); };
  if (settings) return <div className="phone-app"><Settings source={source} state={null}
    demoMember={{...demoProfile,gender:'man',displayName:'عضو تجريبي'}} demo paused={paused} busy={false}
    onEdit={noop} onMembership={noop} onToggle={()=>setPaused(value=>!value)}
    onDelete={noop} onExit={()=>show('discover')} onPrivacy={noop}>
    <MemberTabs source={source} active="settings" onHome={()=>show('curated')} onDiscover={()=>show('discover')}
      onInbox={()=>show('inbox')} onChats={()=>show('chats')} onAccount={()=>setSettings(true)}/>
  </Settings></div>;
  return <div className="phone-app">
    <Community source={source} tab={tab} onTab={setTab} viewerGender="man"
      onMutual={noop} onConversationOpened={noop} onHome={() => setTab('curated')}
      onAccount={()=>setSettings(true)} paused={paused} onResume={()=>setPaused(false)} />
  </div>;
}

initializeDevicePreferences();
createRoot(document.getElementById('root')!).render(<MembershipAccess.Provider value={{premium:new URLSearchParams(location.search).get('tier')!=='free',upgrade:()=>location.href='/tests/fixtures/membership-qa.html'}}><ExplorePreview /></MembershipAccess.Provider>);
