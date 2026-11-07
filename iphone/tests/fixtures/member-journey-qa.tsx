import { createRoot } from 'react-dom/client';
import App from '../../src/App';
import '../../src/design.css';
import '../../src/flows.css';
import '../../src/screens.css';
import '../../src/motion.css';
import { initializeKeyboardViewport } from '../../src/mobile/keyboardViewport';
import { initializeDevicePreferences } from '../../src/settings/preferences';
import '../../src/mobile/keyboard.css';
// Uses App's normal fictional demo, without the hosted paired-test login gate.
if (import.meta.env.MODE !== 'demo') throw new Error('Run this fixture with --mode demo.');
initializeDevicePreferences();
const stopKeyboardViewport = initializeKeyboardViewport();
if (import.meta.hot) import.meta.hot.dispose(stopKeyboardViewport);
createRoot(document.getElementById('root')!).render(<App/>);
