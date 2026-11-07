import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './style.css';

document.documentElement.lang = 'ar';
document.documentElement.dir = 'rtl';
// Staff still sign in and complete MFA after email verification. Never keep
// ignored confirmation credentials in a shareable browser URL.
if (/access_token=|refresh_token=|error_description=/.test(window.location.hash)) {
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
