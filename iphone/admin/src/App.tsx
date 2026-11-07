import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { client, call, mode, configurationError, friendly } from './client';
import { createDemoApi, demoOwner, liveApi } from './data';
import { Brand, Login, Mfa } from './Auth';
import { Dashboard } from './Dashboard';
import type { Access } from './types';
import { clearAdminSession } from './sessionStorage';

export default function App() {
  const [demo, setDemo] = useState(mode === 'demo' && !configurationError), [demoSession, setDemoSession] = useState(0);
  const [session, setSession] = useState<Session | null>(null), [access, setAccess] = useState<Access | null>(null), [checking, setChecking] = useState(!!client), [error, setError] = useState('');
  const generation = useRef(0), currentUser = useRef<string | null>(null);
  const demoApi = useMemo(createDemoApi, [demoSession]);
  const validate = useCallback(async (next: Session | null) => {
    const ticket = ++generation.current;
    if (currentUser.current !== next?.user.id) setAccess(null);
    currentUser.current = next?.user.id || null;
    setSession(next); setError('');
    if (!next) { setChecking(false); setAccess(null); return; }
    setChecking(true);
    try { const result = await call<Access>('marriage_admin_access'); if (generation.current === ticket) { if (result.userId !== next.user.id) throw new Error(); setAccess(result); } }
    catch (problem) { if (generation.current === ticket) { setAccess(null); setError(friendly(problem)); } }
    finally { if (generation.current === ticket) setChecking(false); }
  }, []);
  const refresh = useCallback(() => {
    if (!client) return;
    const ticket = ++generation.current;
    // Remove all member records while revalidating, including revoked access.
    setAccess(null); setChecking(true);
    void client.auth.getSession().then(({ data, error: problem }) => {
      if (ticket !== generation.current) return;
      if (problem) throw problem;
      return validate(data.session);
    }).catch(problem => { if (ticket === generation.current) { setAccess(null); setError(friendly(problem)); setChecking(false); } });
  }, [validate]);
  useEffect(() => {
    if (!client) return;
    if (demo) { client.auth.stopAutoRefresh(); return; }
    client.auth.startAutoRefresh();
    let active = true;
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, next) => {
      // Auth callbacks must finish before calling back into the SDK/RPC client.
      const ticket = ++generation.current;
      setAccess(null); setChecking(!!next);
      queueMicrotask(() => { if (active && ticket === generation.current) void validate(next); });
    });
    refresh();
    const visible = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', visible);
    return () => { active = false; generation.current++; subscription.unsubscribe(); document.removeEventListener('visibilitychange', visible); };
  }, [demo, refresh, validate]);
  async function exit() {
    if (demo) { setDemo(false); setDemoSession(v => v + 1); return; }
    generation.current++; setAccess(null); setChecking(true);
    try { await client?.auth.signOut({ scope: 'local' }); }
    finally { generation.current++; currentUser.current = null; clearAdminSession(window); setSession(null); setAccess(null); setChecking(false); window.location.reload(); }
  }
  if (demo) return <Dashboard key={'demo-' + demoSession} api={demoApi} staff={demoOwner} demo onExit={() => void exit()} onAccessChanged={() => {}} />;
  if (checking) return <main className="auth-center"><Brand /><div className="loading-card" role="status"><span className="loading-line" />جارٍ التحقق من صلاحية الدخول…</div></main>;
  if (!session) return <Login onDemo={() => { setDemoSession(v => v + 1); setDemo(true); }} />;
  if (!access?.authorized) return <main className="auth-center"><Brand /><section className="mfa-card"><h1>الوصول مخصص للفريق</h1><p className="muted">{error || 'هذا الحساب غير مفعّل للإدارة. استخدم البريد المحجوز لك، أو راجع مالك المشروع لتفعيل الصلاحية.'}</p><button className="primary" onClick={refresh}>إعادة التحقق</button><button className="text-button" onClick={() => void exit()}>تسجيل الخروج</button></section></main>;
  if (access.mfaRequired) return <Mfa onVerified={refresh} onExit={() => void exit()} />;
  return <Dashboard key={access.userId} api={liveApi} staff={access} demo={false} onExit={() => void exit()} onAccessChanged={refresh} />;
}
