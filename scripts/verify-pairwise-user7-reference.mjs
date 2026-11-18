import fs from 'node:fs'
import assert from 'node:assert/strict'
import * as frozen from '../tmp/training-2026-09-17/frozenV12-runtime.mjs'
import * as expanded from '../tmp/training-2026-09-17/candidateFull-runtime.mjs'
const read = path => JSON.parse(fs.readFileSync(path,'utf8'))
const input = read('.tmp-pairwise-user7-0-personalization.json')
const people = new Map(input.map(p=>[p.assigned_number,{...p,survey_data:{answers:p.answers}}]))
const previous=read('tmp/training-2026-09-17/user7-runtime-ai-report.json')
const semantic=read('tmp/pairwise-2026-09-18/semantic-evidence.json')
let maxDelta=0,checks=0,changedSemanticValues=0
for(const person of previous.rows){
  for(const [name,model] of [['frozenV12',frozen],['candidateFull',expanded]]){
    const score=model.calculatePersonalizedCompatibility(people.get(7),people.get(person.participantNumber))
    maxDelta=Math.max(maxDelta,Math.abs(score.aToB.score-person.scores[name].directional),Math.abs(score.totalScore-person.scores[name].base))
    checks+=2
  }
  const now=semantic.user7[person.participantNumber]
  assert.equal(now.adjustment,person.ai.adjustment)
  const value=.5*now.values.current_curiosity+.5*now.values.hobbies
  if(Math.abs(value-person.ai.score)>1e-6)changedSemanticValues++
}
assert.ok(maxDelta<=1e-5)
assert.equal(changedSemanticValues,0)
const result={passed:true,checks,maxDelta,changedSemanticValues,policy:'Current profiles reproduce both original User 7 baseline scores; all 30 semantic scores and corrections match previous evidence.'}
fs.writeFileSync('tmp/pairwise-2026-09-18/user7-reference-verification.json',JSON.stringify(result,null,2)+'\n')
console.log(JSON.stringify(result,null,2))
