const PUBLIC_API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5dHdkZ2lpaGZteGlmbHd1eHRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEyMjgwNTEsImV4cCI6MjA2NjgwNDA1MX0.uZL22mbI2wJ4egen2tt7I11qTQrU8kPlN-u5yE8e1qI';
export const choices = ['أتقبّل', 'أتقبّل بشروط', 'صعب أتنازل', 'خط أحمر'];
export async function api(action, data = {}) {
  const response = await fetch('/api/circle-event', {
    method: 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${PUBLIC_API_KEY}`, apikey: PUBLIC_API_KEY },
    body: JSON.stringify({action, ...data}), signal: AbortSignal.timeout(15000)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(body.error || 'تعذّر الاتصال. حاول مرة ثانية.'); error.status = response.status; throw error; }
  return body;
}
export function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
export function clock(endsAt) {
  const seconds = Math.max(0, Math.ceil((new Date(endsAt).getTime() - Date.now()) / 1000)) || 0;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
