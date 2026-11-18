// Read-only cache replay. Emit numeric evidence only; never generate or write DB rows.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { buildBalancedCacheIdentity, calculateAiChemistryAdjustment, decodeBalancedVibeModelUsed, isBalancedVibeModelUsed } from '../server/matching/balanced-compatibility.mjs'

const read = p => JSON.parse(fs.readFileSync(p, 'utf8'))
const events = read('.tmp-pairwise-semantic-personalization.json')
const training = read('.tmp-pairwise-events26-28-personalization.json')
const cache = read('.tmp-pairwise-cache-personalization.json')
const user = read('.tmp-pairwise-user7-0-personalization.json')
const userCache = read('.tmp-pairwise-user7-1-personalization.json')
const userVibes = read('.tmp-pairwise-user7-2-personalization.json')
const axes = {current_curiosity:5, hobbies:3, music:1, friend_description:3}
const asProfile = p => ({...p, survey_data:{answers:p.answers}})
const eventProfiles = new Map(events.profiles.map(p=>[`${p.event_id}:${p.assigned_number}`,asProfile(p)]))
const userProfiles = new Map(user.map(p=>[p.assigned_number,{...p,survey_data:{answers:{...p.answers,...userVibes.find(v=>v.assigned_number===p.assigned_number)?.survey_data?.answers},vibeDescription:userVibes.find(v=>v.assigned_number===p.assigned_number)?.survey_data?.vibeDescription}}]))
function evidence(a,b,cacheRows){
  const hash=buildBalancedCacheIdentity(a,b).vibeContentHash
  const row=cacheRows.find(c=>[c.participant_a_number,c.participant_b_number].includes(a.assigned_number)&&[c.participant_a_number,c.participant_b_number].includes(b.assigned_number)&&c.vibe_content_hash===hash&&isBalancedVibeModelUsed(c.model_used)&&!c.model_used.includes('fallback='))
  if(!row) return null
  const values=row.vibe_axes||decodeBalancedVibeModelUsed(row.model_used)
  const adjustment=calculateAiChemistryAdjustment(values)
  if(!adjustment.ready) return null
  return {values:Object.fromEntries(Object.entries(axes).map(([k,max])=>[k,Number(values[k].score)/max])),adjustment:adjustment.adjustment,createdAt:row.created_at,contentHash:hash}
}
const result={events:{},user7:{},coverage:{},policy:'Cached survey-only semantics, exact reconstructed/current content hash. Missing evidence is marked missing. Cache dates are provenance only, never features. Historical reconstruction has no legacy free-text fallback.'}
for(const r of training.rankings){
  const [a,b]=[r.ranker_number,r.ranked_number].sort((a,b)=>a-b)
  const key=`${r.event_id}:${a}:${b}`
  if(!(key in result.events))result.events[key]=evidence(eventProfiles.get(`${r.event_id}:${a}`),eventProfiles.get(`${r.event_id}:${b}`),cache)
}
for(const p of user)if(p.assigned_number!==7)result.user7[p.assigned_number]=evidence(userProfiles.get(7),userProfiles.get(p.assigned_number),userCache)
for(const e of [26,27,28]){
 const pairs=Object.entries(result.events).filter(([k])=>k.startsWith(`${e}:`))
 result.coverage[e]={pairs:pairs.length,valid:pairs.filter(([,v])=>v).length}
}
result.coverage.user7={pairs:30,valid:Object.values(result.user7).filter(Boolean).length}
assert.equal(result.coverage.user7.valid,30)
fs.mkdirSync('tmp/pairwise-2026-09-18',{recursive:true})
fs.writeFileSync('tmp/pairwise-2026-09-18/semantic-evidence.json',JSON.stringify(result,null,2)+'\n')
console.log(JSON.stringify(result.coverage,null,2))
