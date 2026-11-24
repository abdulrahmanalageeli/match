import { demoAssessmentSeeds, demoSurvey } from '../../src/community/demoAssessmentSeeds.mjs';
import { currentAssessment, historicalAssessment } from './interview-assessment.mjs';

const roster = new Map(demoAssessmentSeeds.map(person => [person.id, person]));

// Only fictional catalog entries can be selected by an API caller.
export function demoEvidence(id, memberVersion) {
  const persona = roster.get(id);
  if (!persona) return null;

  const current = memberVersion === 'marriage-v4';
  const version = current ? 'marriage-v4' : 'marriage-v3';
  const personalityVersion = current ? 'personality-v2' : 'personality-v1';
  const instrument = current ? currentAssessment : historicalAssessment;
  const survey = demoSurvey(persona.seed, persona.index, version);
  const practical = instrument.requiredFields.filter(field => field.kind === 'preference' && Object.hasOwn(survey,field.fieldId)).map(({ fieldId, side }) => {
    const topic = instrument.preferenceById.get(fieldId);
    const partner = side === 'partner';
    const key = partner ? topic.partnerId : topic.id;
    return {
      key: 'answer:' + key,
      question: partner ? topic.partnerPrompt : topic.selfPrompt,
      answer: topic.options.find(option => option.code === survey[key])[side],
      ...(partner ? { provenance: 'confirmed' } : {}),
    };
  });
  const personality = instrument.traits.map((question, index) => {
    const code = current ? persona.seed.currentTraits[index] : 'ABCDE'[persona.seed.traits[index] - 1];
    return {
      key: 'personality:' + question.id,
      question: question.prompt,
      answer: instrument.options.find(option => option.code === code).label,
    };
  });
  return { assessmentVersion: version, personalityVersion, entries: [...practical, ...personality] };
}
