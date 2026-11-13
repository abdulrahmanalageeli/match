// Run against an actual synthetic Luna session, not invented complete assessment answers:
// node --experimental-vm-modules tests/full-interview-scoring.mjs .tmp/full-interview-review/luna-session.json
// Add --simulated when the supplied session uses simulated provider responses.
// Add --submitted <path> to verify the browser's actual final signup payload too.
// No production RPC, user record, model request, or secret is used by this verifier.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import { createServer } from 'vite';
import { confirmInterviewChoices } from '../api/_lib/interview.mjs';
import personalityCatalog from '../src/compatibility/personality-catalog.json' with { type: 'json' };

const artifactPath=resolve(process.argv[2]||'.tmp/full-interview-review/luna-session.json');
const raw=await readFile(artifactPath,'utf8'), artifact=JSON.parse(raw);
const doc=artifact.finalSnapshot?.document??artifact.document??artifact.final?.document??artifact.finalDocument??artifact.snapshots?.at(-1)?.document;
assert(doc?.proposals?.length,'Artifact must contain the real final interview document and proposals');
assert.equal(doc.pendingAnalysis,false,'Do not count an unfinished model analysis as completed');
const plain=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const owner='22222222-2222-4222-8222-222222222222';
const loader=await createServer({configFile:false,appType:'custom',logLevel:'error',plugins:[{
  name:'full-interview-no-live-services',enforce:'pre',load(id){
    const path=id.replaceAll('\\','/');
    if(path.endsWith('/src/cloud.ts'))return 'export const cloud=null; export function callRpc(){throw Error("Live RPC prohibited")}';
    if(path.endsWith('/src/legal/LegalNotice.tsx'))return 'export const LEGAL_NOTICE_VERSION="2026-11-07-privacy"';
  },
}],optimizeDeps:{noDiscovery:true},server:{middlewareMode:true,hmr:false}});

try{
  const [interview,draft,consent,matching,personalityAnalysis,beena,persistence,vault]=await Promise.all([
    '/src/interview/model.ts','/src/onboarding/draft.ts','/src/legal/consent.ts','/src/compatibility/model.ts',
    '/src/compatibility/personality-analysis.ts','/src/beena/model.ts','/src/onboarding/persistence.ts','/src/onboarding/vault.ts',
  ].map(path=>loader.ssrLoadModule(path)));
  const initial=draft.initialDraft(owner,null);
  initial.answers={...initial.answers,displayName:'ملف التحقق الافتراضي',gender:'woman',birthDate:'1997-06-15',age:'29',city:'الرياض',profession:'مهندسة',bio:'ملف خيالي للتحقق المحلي فقط',contact:'fictional@example.test'};
  initial.permissions={version:'2026-11-07-privacy',sensitiveProfile:false,assessment:true};
  const permissions={...consent.emptyConsents(),adult:true,terms:true,privacy:true,assessment:true};
  const profile=answers=>({...consent.applyConsentChoices(draft.toProfile(answers),permissions),id:owner});
  const emptyProfile=profile(initial.answers);
  const selected=doc.proposals.filter(p=>!p.needsClarification&&interview.proposalOptions(p).length);
  assert(selected.length>0,'A complete interview must offer some clear, reviewable choices');
  const review={...doc,status:'review'};
  const none=confirmInterviewChoices(review,[],false).confirmed;
  assert.deepEqual(plain(interview.applyInterviewAnswers(initial.answers,none)),{});
  const confirmed=confirmInterviewChoices(review,selected.map(({id,values})=>({id,values})),false).confirmed;
  const answers={...initial.answers,...interview.applyInterviewAnswers(initial.answers,confirmed)};
  const saved=profile(answers);
  // Every saved value must trace to a selected real proposal. No invented gap-filling.
  assert.equal(Object.keys(saved.personalityAnswers).length,confirmed.filter(p=>p.kind==='personality').length);
  assert.equal(Object.keys(saved.surveyAnswers).length,confirmed.filter(p=>p.kind==='preference').length);
  for(const p of doc.proposals.filter(p=>p.needsClarification&&p.kind==='personality'))assert.equal(saved.personalityAnswers[p.fieldId],undefined);

  function peer(aligned){
    const surveyAnswers=Object.fromEntries(matching.dimensions.flatMap(d=>{
      const other=code=>d.options.find(o=>o.code!==code)?.code??d.options[0].code;
      const self=answers.surveyAnswers?.[d.partnerId]??d.options[0].code;
      const partner=answers.surveyAnswers?.[d.id]??d.options[0].code;
      return[[d.id,aligned?self:other(self)],[d.partnerId,aligned?partner:other(partner)]];
    }));
    const personalityAnswers=Object.fromEntries(personalityCatalog.map(q=>{
      const code=answers.personalityAnswers?.[q.id]??'C';
      return[q.id,aligned?code:'ABCDE'.indexOf(code)<=2?'E':'A'];
    }));
    const scenarioAnswers=Object.fromEntries(beena.beenaScenarios.map(s=>{
      const a=answers.beena?.answers[s.id];
      const self=a?.partner?.[0]??s.options[0].code;
      const partner=a?.self??s.options[0].code;
      return[s.id,{self:aligned?self:s.options.find(o=>!a?.partner?.includes(o.code))?.code??self,
        partner:[aligned?partner:s.options.find(o=>o.code!==partner).code],importance:1}];
    }));
    return{...profile({...initial.answers,surveyAnswers,personalityAnswers,beena:{version:'beena-v1',answers:scenarioAnswers}}),
      id:aligned?'z-synthetic-aligned':'a-synthetic-different',gender:'man'};
  }
  const aligned=peer(true),different=peer(false);
  const before=matching.describeFit(emptyProfile,aligned),after=matching.describeFit(saved,aligned);
  assert.equal(before.fit.covered,0);assert.equal(before.fit.personality.covered,0);
  assert.deepEqual(plain(matching.describeFit(profile({...initial.answers,...interview.applyInterviewAnswers(initial.answers,none)}),aligned)),plain(before));
  const fullPairs=matching.dimensions.filter(d=>answers.surveyAnswers?.[d.id]&&answers.surveyAnswers?.[d.partnerId]).length;
  assert.equal(after.fit.covered,fullPairs);
  assert.equal(after.fit.percentage,fullPairs===matching.dimensions.length?100:null);
  assert.equal(after.fit.personality.covered,Object.keys(answers.personalityAnswers).length);
  assert.equal(after.fit.personality.percentage,after.fit.personality.covered===personalityCatalog.length?100:null);
  assert.equal(after.fit.beena.covered,beena.beenaProgress(answers.beena).answered);
  assert.equal(after.fit.beena.percentage,after.fit.beena.complete?100:null);

  const orderBefore=matching.rankPreferences(emptyProfile,[aligned,different]).map(row=>row.person.id);
  const orderAfter=matching.rankPreferences(saved,[different,aligned]).map(row=>row.person.id);
  assert.equal(orderBefore[0],different.id,'Unanswered candidates should retain the engine deterministic tie-break');
  assert(fullPairs>0,'Actual interview supplied no complete preference pair, so cannot prove useful recommendation changes');
  assert.equal(orderAfter[0],aligned.id,'Confirmed actual choices must affect recommendation order');
  assert(after.rankValue>before.rankValue);
  assert(after.fit.strengths.length>0);
  assert(matching.describeFit(saved,different).fit.discussion.length>0);

  const personalityProposal=selected.find(p=>p.kind==='personality');
  let personalityEdit=null,answersToPersist=answers,profileToPersist=saved;
  if(personalityProposal){
    const original=personalityProposal.values[0];
    const corrected='ABCDE'.indexOf(original)<=2?'E':'A';
    const changedChoices=confirmInterviewChoices(review,[{id:personalityProposal.id,values:[corrected]}],false).confirmed;
    const changedAnswers={...answers,...interview.applyInterviewAnswers(answers,changedChoices)};
    const changed=profile(changedAnswers);
    const compared=matching.describeFit(changed,aligned).fit.personality;
    assert.equal(changed.personalityAnswers[personalityProposal.fieldId],corrected);
    assert.equal(saved.personalityAnswers[personalityProposal.fieldId],original,'Saved input must not mutate');
    assert(compared.differences.includes(personalityProposal.fieldId));
    if(compared.complete){assert(compared.percentage<after.fit.personality.percentage);assert(personalityAnalysis.analyzePersonality(compared).discussion.some(item=>item.id===personalityProposal.fieldId));}
    else assert.equal(compared.percentage,null,'Editing a partial assessment must not fabricate completeness');
    personalityEdit={field:personalityProposal.fieldId,proposed:original,confirmedEdit:corrected,before:after.fit.personality.percentage,after:compared.percentage,discussion:true};
    answersToPersist=changedAnswers;profileToPersist=changed;
  }

  // Persist exactly these actual confirmed values, then run the normal signup adapter.
  initial.answers=answersToPersist;
  const rows=new Map(),storage={read:async key=>rows.get(key)??null,write:async(key,value)=>rows.set(key,value),remove:async key=>rows.delete(key)};
  const first=vault.createDraftVault(()=>storage,persistence.decodeDraft);
  assert.equal(await first.save(initial,first.revision(owner)),true);
  const next=vault.createDraftVault(()=>storage,persistence.decodeDraft);
  const restored=await next.load(owner,'new',next.revision(owner));assert(restored);
  for(const field of ['surveyAnswers','personalityAnswers','beena'])assert.deepEqual(plain(restored.answers[field]),plain(answersToPersist[field]));
  const rpc=[];
  const client={auth:{getSession:async()=>({data:{session:{user:{id:owner}}},error:null})},rpc:async(name,args)=>{rpc.push({name,args:plain(args)});return{data:{saved:true},error:null}}};
  const modules={'@supabase/supabase-js':{createClient:()=>client},'./session':{authStorage:{}},'./deployment':{resolveDeployment:()=>({ready:true,selected:true,url:'https://synthetic.invalid',key:'synthetic'})},'./auth/signupReturn':{signupRedirectUrl:()=>null}};
  const context=vm.createContext({URL,Response});
  const compiled=ts.transpileModule(await readFile(new URL('../src/cloud.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  const cloud=new vm.SourceTextModule(compiled,{context,initializeImportMeta(meta){meta.env={}}});
  await cloud.link(name=>{const values=modules[name];assert(values,name);return new vm.SyntheticModule(Object.keys(values),function(){for(const[key,value]of Object.entries(values))this.setExport(key,value)},{context})});
  await cloud.evaluate();await cloud.namespace.cloudRequest('/application','PUT',owner,profile(restored.answers));
  assert.equal(rpc[0].name,'marriage_apply');
  for(const field of ['surveyAnswers','personalityAnswers','beena'])assert.deepEqual(rpc[0].args.payload[field],plain(profileToPersist[field]));
  assert.equal(rpc[0].args.payload.signupConsents.assessment,true);
  assert.equal(Object.hasOwn(rpc[0].args.payload,'proposals'),false);
  assert.equal(Object.hasOwn(rpc[0].args.payload,'transcript'),false);
  const report={source:artifactPath,sha256:createHash('sha256').update(raw).digest('hex'),turns:doc.turns.length,
    sourceMode:process.argv.includes('--simulated')?'simulated provider responses; no live model inference':artifact.sourceMode??artifact.modelExecution??'supplied artifact; live model provenance not asserted by this verifier',
    sourceProvider:artifact.source??artifact.provider??null,model:artifact.model??null,
    proposals:doc.proposals.length,confirmedClear:selected.length,uncertainExcluded:doc.proposals.length-selected.length,
    preferences:{answers:Object.keys(answers.surveyAnswers).length,covered:after.fit.covered,total:after.fit.total,percentage:after.fit.percentage,rankBefore:before.rankValue,rankAfter:after.rankValue,orderBefore,orderAfter},
    personality:{covered:after.fit.personality.covered,total:after.fit.personality.total,percentage:after.fit.personality.percentage,edit:personalityEdit},
    beena:{covered:after.fit.beena.covered,total:after.fit.beena.total,percentage:after.fit.beena.percentage,aligned:after.fit.beena.aligned},
    savedAndResumed:true,normalApplicationPayload:true,unconfirmedChangesScore:false,noProductionWrites:true,
  };
  const submittedIndex=process.argv.indexOf('--submitted');
  if(submittedIndex>=0){
    const submittedPath=resolve(process.argv[submittedIndex+1]);
    const uiPayload=JSON.parse(await readFile(submittedPath,'utf8'));
    const uiProfile={...uiPayload,id:owner};
    const rawPersonality=Object.fromEntries(doc.proposals.filter(p=>p.kind==='personality').map(p=>[p.fieldId,p.values[0]]));
    const uiComparator={...aligned,personalityAnswers:Object.fromEntries(personalityCatalog.map(q=>[q.id,rawPersonality[q.id]??'C']))};
    const uiBefore=matching.describeFit({...uiProfile,personalityAnswers:{},surveyAnswers:{},beena:undefined},uiComparator);
    const uiAfter=matching.describeFit(uiProfile,uiComparator);
    assert.equal(uiBefore.fit.personality.percentage,null);
    assert.equal(uiBefore.fit.personality.covered,0);
    const actualPersonality=Object.entries(uiPayload.personalityAnswers??{});
    assert(actualPersonality.every(([id])=>Object.hasOwn(rawPersonality,id)),'The browser may not fill personality gaps outside the captured interpretations');
    const browserEdits=actualPersonality.filter(([id,value])=>rawPersonality[id]!==value).map(([field,value])=>({field,proposed:rawPersonality[field],confirmed:value}));
    assert(browserEdits.length>0,'The full browser check must exercise editing an interpretation');
    const expectedPersonality=actualPersonality.length===personalityCatalog.length?Math.round(100*(1-actualPersonality.reduce((sum,[id,value])=>sum+Math.abs('ABCDE'.indexOf(value)-'ABCDE'.indexOf(uiComparator.personalityAnswers[id])),0)/(4*personalityCatalog.length))):null;
    assert.equal(uiAfter.fit.personality.covered,actualPersonality.length);
    assert.equal(uiAfter.fit.personality.percentage,expectedPersonality,'Actual confirmed choices must determine the existing score arithmetic');
    const originalComparison=matching.describeFit({...uiProfile,personalityAnswers:rawPersonality},uiComparator).fit.personality;
    if(uiAfter.fit.personality.complete){assert(uiAfter.fit.personality.percentage<originalComparison.percentage,'A changed browser choice must affect the comparison with the unchanged proposal comparator');}
    const excludedPreferences=doc.proposals.filter(p=>p.kind==='preference'&&!Object.hasOwn(uiPayload.surveyAnswers??{},p.side==='partner'?matching.dimensions.find(d=>d.id===p.fieldId).partnerId:p.fieldId)).map(p=>({field:p.fieldId,side:p.side}));
    const excludedScenarios=doc.proposals.filter(p=>p.kind==='beena'&&!Object.hasOwn(uiPayload.beena?.answers?.[p.fieldId]??{},p.side)).map(p=>({field:p.fieldId,side:p.side}));
    assert(excludedPreferences.length+excludedScenarios.length>0,'The browser test must leave an excluded interpretation absent');
    const uiCovered=matching.dimensions.filter(d=>uiPayload.surveyAnswers?.[d.id]&&uiPayload.surveyAnswers?.[d.partnerId]).length;
    assert.equal(uiAfter.fit.covered,uiCovered);
    if(uiCovered<matching.dimensions.length)assert.equal(uiAfter.fit.percentage,null);
    if(uiCovered===0)assert.equal(uiAfter.rankValue,0,'An excluded half-pair cannot fabricate recommendation evidence');
    const uiOrderBefore=matching.rankPreferences({...uiProfile,personalityAnswers:{},surveyAnswers:{},beena:undefined},[uiComparator,different]).map(row=>row.person.id);
    const uiOrderAfter=matching.rankPreferences(uiProfile,[different,uiComparator]).map(row=>row.person.id);
    if(uiCovered>0){assert.equal(uiOrderBefore[0],different.id);assert.equal(uiOrderAfter[0],uiComparator.id,'The actual final signup answers must change recommendation order');}
    const uiDiscussion=personalityAnalysis.analyzePersonality(uiAfter.fit.personality)?.discussion.map(topic=>topic.id)??[];
    if(uiAfter.fit.personality.complete&&browserEdits.some(edit=>Math.abs('ABCDE'.indexOf(edit.proposed)-'ABCDE'.indexOf(edit.confirmed))>=2))assert(uiDiscussion.some(id=>browserEdits.some(edit=>edit.field===id)));
    await cloud.namespace.cloudRequest('/application','PUT',owner,uiPayload);
    const uiRpc=rpc.at(-1);
    assert.equal(uiRpc.name,'marriage_apply');
    for(const field of ['surveyAnswers','personalityAnswers','beena','signupConsents'])assert.deepEqual(uiRpc.args.payload[field],plain(uiPayload[field]));
    report.browserSubmission={source:submittedPath,personality:{beforeConfirmation:null,proposedComparison:originalComparison.percentage,afterConfirmedBrowserEdit:uiAfter.fit.personality.percentage,covered:actualPersonality.length,total:personalityCatalog.length},
      confirmedEdits:browserEdits,personalityDiscussion:uiDiscussion,excludedPreferences,excludedScenarios,preferencePercentage:uiAfter.fit.percentage,preferenceCovered:uiCovered,rankValue:uiAfter.rankValue,orderBefore:uiOrderBefore,orderAfter:uiOrderAfter,
      exactFinalAnswersReachApplicationRPC:true};
  }
  await writeFile(resolve(dirname(artifactPath),'scoring-proof.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}finally{await loader.close()}
