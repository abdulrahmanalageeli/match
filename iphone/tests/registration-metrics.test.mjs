import test from 'node:test';
import assert from 'node:assert/strict';
import { registrationMetrics } from '../scripts/registration-metrics.mjs';

test('all mature starts contribute to coverage and abandonment, including early exits', () => {
  const submitted = { ageMinutes: 1600, submittedMinutes: 45, requiredActions: 130, aiCalls: 1, correctedSuggestions: 2, completedFields: 44 };
  const open = { ageMinutes: 1800, submittedMinutes: null, requiredActions: 5, aiCalls: 0, correctedSuggestions: 0, completedFields: 0 };
  assert.deepEqual(registrationMetrics({ windowDays: 1, attempts: [
    submitted, { ...submitted, submittedMinutes: 15, requiredActions: 110 }, open, { ...open, ageMinutes: 100 },
    { ...open, submittedMinutes: 1550 },
  ] }), {
    windowDays: 1, starts: 4, submissions: 2, stillUnderObservation: 1,
    medianRequiredActionsPerSubmission: 120, medianSignupToSubmissionMinutes: 30,
    aiCalls: 2, correctedSuggestions: 4, compatibilityCompletionPercent: 50, unsubmittedAtCutoffPercent: 50,
  });
  assert.equal(registrationMetrics({ windowDays: 1, attempts: [] }).unsubmittedAtCutoffPercent, null);
  assert.throws(() => registrationMetrics({ windowDays: 1, attempts: [{ ...submitted, completedFields: 45 }] }));
});

test('completion uses each version and applicable questionnaire length', () => {
  const complete = { ageMinutes:1600, submittedMinutes:30, requiredActions:100, aiCalls:1, correctedSuggestions:0 };
  const attempts = [44,45,47].map(n=>({...complete,requiredFields:n,completedFields:n}));
  assert.equal(registrationMetrics({windowDays:1,attempts}).compatibilityCompletionPercent,100);
  assert.throws(()=>registrationMetrics({windowDays:1,attempts:[{...complete,requiredFields:45,completedFields:46}]}));
});
