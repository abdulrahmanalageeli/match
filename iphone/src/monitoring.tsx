import { Component, type ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import { cloud } from "./cloud";
import { isChunkLoadFailure, recoverStaleChunk } from "./chunkRecovery";

type Fault = "render_error" | "unhandled_error" | "unhandled_rejection";
let lastReport = 0;
export async function reportClientFault(event: Fault) {
  if (!cloud || document.hidden || Date.now()-lastReport<60_000) return;
  lastReport=Date.now();
  try {
    const { data }=await cloud.auth.getSession();
    if (!data.session) return;
    const timeout=new AbortController();
    const timer=window.setTimeout(()=>timeout.abort(),3000);
    try {
      await cloud.rpc("marriage_record_client_fault", {
        event_code:event, app_release:"0.2.0", client_platform:Capacitor.getPlatform()==="ios"?"ios":"web",
      }).abortSignal(timeout.signal);
    } finally { window.clearTimeout(timer); }
  } catch { /* Fault reporting must never interrupt the member's session. */ }
}
export function initializeFaultReporting() {
  const error=()=>{void reportClientFault("unhandled_error");};
  const rejection=()=>{void reportClientFault("unhandled_rejection");};
  window.addEventListener("error",error);
  window.addEventListener("unhandledrejection",rejection);
  return ()=>{window.removeEventListener("error",error);window.removeEventListener("unhandledrejection",rejection);};
}
async function latestDeployedEntry() {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 4000);
  try {
    const url = new URL(window.location.pathname, window.location.origin);
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal, headers: { Accept: 'text/html' } });
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) return null;
    const page = new DOMParser().parseFromString(await response.text(), 'text/html');
    const entry = page.querySelector<HTMLScriptElement>('script[type="module"][src]')?.getAttribute('src');
    return entry ? new URL(entry, url).href : null;
  } finally { window.clearTimeout(timer); }
}
export class AppBoundary extends Component<{children:ReactNode},{failed:boolean;chunkFailure:boolean;recovering:boolean;offline:boolean}> {
  state={failed:false,chunkFailure:false,recovering:false,offline:false};
  static getDerivedStateFromError(error:unknown){const chunkFailure=isChunkLoadFailure(error);return{failed:true,chunkFailure,recovering:chunkFailure,offline:false};}
  componentDidCatch(error:unknown){void reportClientFault("render_error");if(isChunkLoadFailure(error))void this.recover(error);}
  async recover(error:unknown) {
    try {
      const result = await recoverStaleChunk(error, {
        online: navigator.onLine !== false,
        currentEntry: document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.src || null,
        latestEntry: latestDeployedEntry, storage: window.sessionStorage, reload: () => window.location.reload(),
      });
      this.setState({recovering:false,offline:result==='offline'});
    } catch { this.setState({recovering:false,offline:navigator.onLine===false}); }
  }
  reopen=()=>{
    if(this.state.chunkFailure&&navigator.onLine===false){this.setState({offline:true});return;}
    window.location.reload();
  };
  render(){return this.state.failed?<main className="loading-stage" dir="rtl" lang="ar">
    <img src="/brand/nisfayn-wordmark.png" alt="نصفين" width="160" />
    <h1>{this.state.recovering?'لحظة واحدة':this.state.offline?'تحقق من الاتصال':'لنحاول من جديد'}</h1>
    <p role="status">{this.state.recovering?'جارٍ التحقق من أحدث نسخة للتطبيق…':this.state.offline?'اتصل بالإنترنت، ثم أعد المحاولة لفتح الصفحة.':this.state.chunkFailure?'تعذّر تحميل هذه الصفحة. أعد فتح التطبيق لتحميل النسخة المتاحة.':'تعذّر عرض هذه الصفحة. يمكنك إعادة فتح التطبيق.'}</p>
    <button className="btn-primary" disabled={this.state.recovering} onClick={this.reopen}>{this.state.offline?'إعادة المحاولة':'إعادة فتح التطبيق'}</button>
  </main>:this.props.children;}
}
