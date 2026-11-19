import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// One anonymous row per signup start, including unfinished attempts. Take counters at
// successful submission or the observation cutoff, whichever came first. A required
// action is one necessary entry, selection, navigation or approval. Exclude optional
// help and corrections. Count actual model requests (including retries) separately.
// Count each presented suggestion corrected by the member once. Compatibility fields
// count only member-selected or explicitly approved values. Never include field values.
export function registrationMetrics({ windowDays, attempts }) {
  if (!Number.isInteger(windowDays) || windowDays <= 0 || !Array.isArray(attempts)) throw Error('Invalid cohort');
  const cutoff = windowDays * 1440;
  const mature = [];
  for (const row of attempts) {
    const { ageMinutes, submittedMinutes, requiredActions, aiCalls, correctedSuggestions, completedFields } = row;
    if (![ageMinutes, requiredActions, aiCalls, correctedSuggestions, completedFields].every(n => Number.isSafeInteger(n) && n >= 0)
      || completedFields > 44 || (submittedMinutes !== null && (!Number.isFinite(submittedMinutes) || submittedMinutes < 0 || submittedMinutes > ageMinutes))) {
      throw Error('Invalid registration observation');
    }
    if (ageMinutes >= cutoff) mature.push(row);
  }
  const submissions = mature.filter(row => row.submittedMinutes !== null && row.submittedMinutes <= cutoff);
  const median = values => {
    if (!values.length) return null;
    const sorted = values.toSorted((a,b) => a-b);
    return (sorted[Math.floor((sorted.length-1)/2)] + sorted[Math.floor(sorted.length/2)]) / 2;
  };
  const total = key => mature.reduce((sum, row) => sum + row[key], 0);
  return {
    windowDays, starts: mature.length, submissions: submissions.length, stillUnderObservation: attempts.length - mature.length,
    medianRequiredActionsPerSubmission: median(submissions.map(row => row.requiredActions)),
    medianSignupToSubmissionMinutes: median(submissions.map(row => row.submittedMinutes)),
    aiCalls: total('aiCalls'), correctedSuggestions: total('correctedSuggestions'),
    compatibilityCompletionPercent: mature.length ? 100 * total('completedFields') / (44 * mature.length) : null,
    unsubmittedAtCutoffPercent: mature.length ? 100 * (mature.length - submissions.length) / mature.length : null,
  };
}

// Run once per variant with the same window: node scripts/registration-metrics.mjs <cohort.json>
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(registrationMetrics(JSON.parse(await readFile(process.argv[2], 'utf8'))), null, 2));
}
