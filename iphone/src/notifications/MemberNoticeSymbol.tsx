import type { PushOpen } from './push';
import type { UpdateEvent } from '../../admin/server/updateEvents';

// Each enamel silhouette has its own Arabic notification meaning. The lighter detail
// is a separate inlay so it can catch the light once as the capsule opens.
const symbols = {
  message: {
    body: 'M18 4.7h5.7a5.1 5.1 0 0 1 5.1 5.1v6.7l1.1 4.1-4.7-1.2v-5.2c0-3.7-2.5-6.6-6-6.6h-5.9a5.5 5.5 0 0 1 4.7-2.9ZM9 9h10a5 5 0 0 1 5 5v5a5 5 0 0 1-5 5h-7l-6 4 1-5a5 5 0 0 1-4-5v-4a5 5 0 0 1 6-5Z',
    detail: 'M8 15h11M8 18.5h7',
  },
  match: {
    body: 'M11.5 3.8a9 9 0 1 1 0 18 9 9 0 0 1 0-18Zm0 3.2a5.8 5.8 0 1 0 0 11.6 5.8 5.8 0 0 0 0-11.6ZM20.5 10.2a9 9 0 1 1 0 18 9 9 0 0 1 0-18Zm0 3.2a5.8 5.8 0 1 0 0 11.6 5.8 5.8 0 0 0 0-11.6Z',
    detail: 'M5.3 9.3a7.3 7.3 0 0 1 5.7-4.1m10.6 6.6a7.2 7.2 0 0 1 5 3.5',
  },
  interest: {
    body: 'M16 27C12 24.1 2.8 18 2.8 11c0-6.6 8-10.1 13.2-3.3 5.2-6.8 13.2-3.3 13.2 3.3 0 7-9.2 13.1-13.2 16Z',
    detail: 'M6.3 12c0-2.9 1.9-5 4.7-5',
  },
  reminder: {
    body: 'M16 2.7a13.3 13.3 0 1 1 0 26.6 13.3 13.3 0 1 1 0-26.6Z',
    detail: 'M16 8.1v8l5 3.1M8.1 16h.35M23.6 16h.35M16 23.4v.45',
  },
  family: {
    body: 'M6 7.8a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Zm20 0a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7ZM16 4a4.8 4.8 0 1 1 0 9.6A4.8 4.8 0 0 1 16 4ZM5.8 16q2-.2 3.4 1-2.7 2.4-3 7h-5v-2q0-5.5 4.6-6Zm20.4 0q4.6.5 4.6 6v2h-5q-.3-4.6-3-7 1.4-1.2 3.4-1ZM16 15.6c5 0 8 3.5 8 8.7V27H8v-2.7c0-5.2 3-8.7 8-8.7Z',
    detail: 'M11.5 23c.2-2.4 1.3-3.8 3-4.4',
  },
  familyLink: {
    body: 'M5 15 12 8a6.2 6.2 0 0 1 9 8l-2.6 2.7-2-2.1 2.5-2.7a3.2 3.2 0 1 0-4.7-4.3l-7 7a3.2 3.2 0 0 0 3.9 5l1.7 2.6A6.2 6.2 0 0 1 5 15Zm14-8a6.3 6.3 0 0 1 8.3 9.2l-7.1 7.1a6.2 6.2 0 0 1-9-8.6l2.8-2.8 2 2.1-2.7 2.8a3.2 3.2 0 1 0 4.6 4.5l7.1-7.1a3.2 3.2 0 0 0-4-4.8Z',
    detail: 'M5.1 19c0-1.1.4-2 1-2.7l5-5',
  },
  analysis: {
    body: 'M14 3c1.3 7.2 4.4 10.4 10.8 12-6.4 1.6-9.5 4.8-10.8 12-1.5-7.2-4.6-10.4-11-12C9.4 13.4 12.5 10.2 14 3Zm11.4-1.5c.4 3 1.6 4.4 4.4 5.1-2.8.7-4 2.1-4.4 5.1-.6-3-1.7-4.4-4.5-5.1 2.8-.7 3.9-2.1 4.5-5.1Z',
    detail: 'M9.2 15.1c2.3-1 3.8-2.7 4.8-5',
  },
  publication: {
    body: 'M16.1 7.4C12.5 4.9 7.9 4.5 3 5.5v19c5.6-1.5 9.5-.1 13.1 2.7 3.5-2.8 7.5-4.2 12.9-2.7v-19c-4.9-1-9.3-.6-12.9 1.9Z',
    detail: 'M16 9.1v15.1M6.5 10.2c2.1-.3 4.2.1 6.3 1.1M19.4 11.3c2-1 4.1-1.4 6.3-1.1',
  },
  agreement: {
    body: 'M7 3.7h12l5.1 5.1v7.5l-6.6 6.6-1 4.6H7a2.2 2.2 0 0 1-2.2-2.2V5.9A2.2 2.2 0 0 1 7 3.7Zm11.5 20.1 7.8-7.8 2.8 2.8-7.8 7.8-3.6.9Z',
    detail: 'M9 10.4h6.1M9 14.9h9M9 19.4h4.8',
  },
  journey: {
    body: 'M8 3.4a4.2 4.2 0 1 1-1.2 8.2v3c0 1.7 1 2.4 2.7 2.4h10.1c3.2 0 5.2 1.9 5.2 5v.3a4.2 4.2 0 1 1-2.7.1V22c0-1.6-.9-2.3-2.5-2.3H9.4c-3.2 0-5.3-1.9-5.3-5.1V9.2A4.2 4.2 0 0 1 8 3.4Z',
    detail: 'M7.8 6.2h.25M23.6 25.7h.25',
  },
  history: {
    body: 'M6 7h20l3.2 6v11.4a2 2 0 0 1-2 2H4.8a2 2 0 0 1-2-2V13L6 7Z',
    detail: 'M4.3 14h7.5l1.7 3.3h5l1.7-3.3h7.5M8 10.1h15.8',
  },
  call: {
    body: 'M5.5 3.8 10 3l3.1 6.6-3.3 2.9c1.9 3.8 5.1 7 9 8.9l2.7-3.4 6.9 3.3-.7 4.3c-.3 2.3-2.4 3.5-4.5 3C13.2 26.3 5.5 18.5 2.8 8.3c-.6-2.1.6-4.2 2.7-4.5Z',
    detail: 'M6.3 6.4c-.6.3-.8.8-.6 1.6.5 1.8 1 3.2 1.9 4.8',
  },
  screenshot: {
    body: 'M3 4h8v2.8H5.8V12H3Zm18 0h8v8h-2.8V6.8H21ZM3 20h2.8v5.2H11V28H3Zm23.2 0H29v8h-8v-2.8h5.2ZM9 12.2h3l1.4-2.4h5.2l1.4 2.4h3V22H9Z',
    detail: 'M18.3 16.9a2.3 2.3 0 1 1-4.6 0 2.3 2.3 0 0 1 4.6 0Z',
  },
  application: {
    body: 'M6.5 6.3H12V4h8v2.3h5.5v21.8h-19Z',
    detail: 'M12.1 8.4h7.8M11 17.8l3.1 3.1 6.5-7',
  },
  verification: {
    body: 'M16 2.9c3.3 2.3 6.4 3.2 11.2 3.7v9.1c0 6.5-5.8 10.8-11.2 13.4C10.6 26.5 4.8 22.2 4.8 15.7V6.6C9.6 6.1 12.7 5.2 16 2.9Z',
    detail: 'm10.7 15.6 3.6 3.6 7-7.6',
  },
  verificationReview: {
    body: 'M16 2.9c3.3 2.3 6.4 3.2 11.2 3.7v9.1c0 6.5-5.8 10.8-11.2 13.4C10.6 26.5 4.8 22.2 4.8 15.7V6.6C9.6 6.1 12.7 5.2 16 2.9Z',
    detail: 'M11.6 13.2h8.8M11.6 17.4h5.7',
  },
  safety: {
    body: 'M8.2 13V10a7.8 7.8 0 0 1 15.6 0v3h2v14h-20V13Zm3 0h9.6v-3a4.8 4.8 0 0 0-9.6 0Z',
    detail: 'M16 18.4v3.7',
  },
  support: {
    body: 'M4.1 15.3a11.9 11.9 0 0 1 23.8 0v5.2c0 4.6-3.4 7.3-8.7 7.3H16v-2.7h3.2c3.1 0 5-.9 5.7-2.6h-2.4V14h2.7a9.3 9.3 0 0 0-18.4 0h2.7v8.5H6.8a3.4 3.4 0 0 1-3.4-3.4v-2.7q0-.8.7-1.1Z',
    detail: 'M6.1 16.8v2.9M25.4 16.8v2.9',
  },
  membership: {
    body: 'M2.9 8.2 10 13l6-9 6 9 7.1-4.8-3.5 15.9H6.4ZM6.6 26h18.8v2H6.6Z',
    detail: 'M9.1 20.8h13.8M16 12.5v2.1',
  },
  payment: {
    body: 'M5.4 6.2h21.2a2.8 2.8 0 0 1 2.8 2.8v14a2.8 2.8 0 0 1-2.8 2.8H5.4A2.8 2.8 0 0 1 2.6 23V9a2.8 2.8 0 0 1 2.8-2.8Z',
    detail: 'M4 12h24M7.4 20h5.3',
  },
  gift: {
    body: 'M16 8.6C11.2-1.1 1.3 5 7.8 10H3.4v6.4h25.2V10h-4.4C30.7 5 20.8-1.1 16 8.6ZM4.9 18.1h22.2v9.3H4.9Zm8.8-8.5c-2.7 0-5.2-.8-5.2-2.4 0-1.9 3.2-2.3 5.2 2.4Zm4.6 0c2-4.7 5.2-4.3 5.2-2.4 0 1.6-2.5 2.4-5.2 2.4Z',
    detail: 'M16 11v4.6m0 3.4v7.5',
  },
  notice: {
    body: 'M6.3 21.2c2.1-2.3 2.2-4.5 2.2-9.2a7.5 7.5 0 0 1 6.1-7.4V3a1.4 1.4 0 0 1 2.8 0v1.6a7.5 7.5 0 0 1 6.1 7.4c0 4.7.1 6.9 2.2 9.2l1 1.5v1H5.3v-1Zm5.6 4.5h8.2a4.3 4.3 0 0 1-8.2 0Z',
    detail: 'M11.4 14v-2.1a4.7 4.7 0 0 1 3.5-4.7',
  },
} as const;

type SymbolKind = keyof typeof symbols;
export type NoticeArtKind = SymbolKind | 'request' | 'visit';
type UpdateFamily = UpdateEvent extends `${infer Family}:${string}` ? Family : never;

const pushArt = {
  request: 'request', mutual: 'match', message: 'message', reminder: 'reminder', family: 'family',
  analysis: 'analysis', publication: 'publication', simulation: 'notice', update: 'notice',
} as const satisfies Record<PushOpen['kind'], NoticeArtKind>;
const updateArt = {
  introduction: 'history', family_room: 'family', analysis: 'analysis', agreement: 'agreement',
  journey: 'journey', rematch: 'request', family_link: 'familyLink', missed_call: 'call', interest: 'interest',
  screenshot: 'screenshot', application: 'application', verification: 'verificationReview', safety: 'safety',
  support: 'support', membership: 'membership', gift: 'gift',
} as const satisfies Record<UpdateFamily, NoticeArtKind>;
const specialArt: Partial<Record<UpdateEvent, NoticeArtKind>> = {
  'introduction:accepted': 'match', 'introduction:expired': 'reminder',
  'agreement:due': 'reminder', 'agreement:expired': 'reminder',
  'agreement:family_invited': 'family', 'agreement:family_confirmed': 'family', 'agreement:family_contact': 'family',
  'journey:exclusive': 'match', 'membership:payment': 'payment',
  'application:corrections': 'agreement', 'verification:approved': 'verification',
};

export function pushNoticeArt(push: PushOpen): NoticeArtKind {
  if (push.kind !== 'update' || !push.event) return pushArt[push.kind];
  const family = push.event.split(':', 1)[0] as UpdateFamily;
  return specialArt[push.event] ?? updateArt[family];
}

export function MemberNoticeSymbol({ kind, id }: { kind: SymbolKind; id: string }) {
  const { body, detail } = symbols[kind];
  return <svg className="nf-member-notice-art" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={id + '-enamel'} x1="0" y1="0" x2=".75" y2="1">
        <stop stopColor="#efc2be"/><stop offset=".28" stopColor="#ae7380"/><stop offset=".58" stopColor="#814051"/><stop offset="1" stopColor="#48152a"/>
      </linearGradient>
      <linearGradient id={id + '-rim'} x1="0" y1="0" x2=".7" y2="1">
        <stop stopColor="#e6c5bf"/><stop offset=".38" stopColor="#a16873"/><stop offset="1" stopColor="#4b2030"/>
      </linearGradient>
    </defs>
    <g className="nf-notice-enamel">
      <path d={body} fill={`url(#${id}-enamel)`} fillRule="evenodd" stroke={`url(#${id}-rim)`} strokeWidth=".9" strokeLinejoin="round"/>
      <path className="nf-notice-inlay" d={detail} pathLength="1" fill="none" stroke="#fff0df" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"/>
    </g>
  </svg>;
}
