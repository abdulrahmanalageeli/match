import type { ProfileContext, ProfileProposal } from './profileCapture';

export type InterviewEvidence = { turnId: string; quote: string };
export type InterviewProposal = {
  id: string;
  kind: 'preference' | 'beena' | 'personality';
  fieldId: string;
  side: 'self' | 'partner' | 'importance';
  values: string[];
  summary: string;
  evidence: InterviewEvidence[];
  needsClarification: boolean;
  source?: 'self_default';
};
export type InterviewNote = { id: string; text: string; evidence: InterviewEvidence[] };
export type InterviewQuestion = { topic: string; text: string; suggestions: string[] };
export type InterviewTurn = { id: string; topic: string; question: string; answer: string; skipped: boolean };
export type InterviewDocument = {
  version: 'interview-v1';
  consentVersion: 'wudayn-interview-v1';
  model: 'gpt-6-luna';
  promptVersion: 'wudayn-interview-1' | 'wudayn-interview-2' | 'wudayn-interview-3';
  status: 'active' | 'review' | 'confirmed';
  turns: InterviewTurn[];
  currentQuestion: InterviewQuestion | null;
  proposals: InterviewProposal[];
  readiness: InterviewNote[];
  clarifications: InterviewNote[];
  confirmed: InterviewProposal[];
  lastRequestId: string | null;
  lastMode: 'luna' | 'guided';
  pendingAnalysis: boolean;
  draftAnswer: string;
  reviewSharing: boolean;
  confirmedAt: string | null;
  profileContext?: ProfileContext;
  profileProposals?: ProfileProposal[];
  profileConfirmed?: ProfileProposal[];
};
export type InterviewSnapshot = {
  document: InterviewDocument | null;
  revision: number;
  updatedAt?: string | null;
  expiresAt?: string | null;
  fallbackAvailable?: boolean;
  coverage?: { answered: number; required: number };
};
