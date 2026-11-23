import { Capacitor } from '@capacitor/core';
import { callRpc, cloud, cloudConnection } from './cloud';
import { marriageProjectUrl } from './deployment';

// Match the native shell and web origins accepted by the production notification/OTP APIs.
function productionMemberSurface() {
  return window.location.origin === 'https://nisfayn-preview.vercel.app'
    || (Capacitor.isNativePlatform() && Capacitor.getPlatform()==='ios'
      && window.location.protocol==='capacitor:' && window.location.hostname==='localhost');
}

export function launchBuild() {
  const entry=document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.src ?? '';
  const digest=entry.match(/[-.]([A-Za-z0-9_-]{6,24})\.js(?:\?|$)/)?.[1];
  return digest ?? 'unknown';
}

const lastSent = new Map<string, number>();
let anonymousStartSent = false;
export function noteSignupStart() {
  if (!cloud || cloudConnection.url.replace(/\/$/,'')!==marriageProjectUrl || !productionMemberSurface() || anonymousStartSent) return;
  try { if(sessionStorage.getItem('wudayn.signup-start')) return; } catch { /* Storage is optional. */ }
  anonymousStartSent=true;
  void fetch('https://nisfayn-admin.vercel.app/api/launch-start',{method:'POST',keepalive:true,credentials:'omit',referrerPolicy:'no-referrer'}).then(r=>{
    if (!r.ok) { anonymousStartSent=false; return; }
    try {sessionStorage.setItem('wudayn.signup-start','1');} catch { /* Session marker only. */ }
  }).catch(()=>{anonymousStartSent=false;});
}

/** Only catalog keys go to the server. Measurement never blocks the member's action. */
export function launchEvent(kind: string, step: string, owner?: string) {
  if (!cloud || (cloudConnection.url.replace(/\/$/,'')===marriageProjectUrl && !productionMemberSurface())) return;
  const key = [owner ?? '', kind, step].join('|');
  const now = Date.now();
  if ((lastSent.get(key) ?? 0) > now - 15_000) return;
  lastSent.set(key, now);
  void callRpc('marriage_launch_note', { kind_value: kind, step_value: step, platform_value:Capacitor.getPlatform()==='ios'?'ios':'web', build_value:launchBuild() }, owner).catch(() => {
    if (lastSent.get(key) === now) lastSent.delete(key);
  });
}
