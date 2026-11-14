import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initialInterviewDocument,parseInterviewInput,validateProposal,validateProfileProposal,validProfileValues,validateProfileContext,validateAssessmentContext,applyInterviewCompletion,confirmProfileChoices,interviewCoverage,interviewCompletionRequest,redactSensitiveInterviewText,createInterviewService,CONSENT_VERSION } from '../api/_lib/interview.mjs';
import preferences from '../src/compatibility/catalog.json' with {type:'json'};
import traits from '../src/compatibility/personality-catalog.json' with {type:'json'};
import profileFields from '../src/interview/profile-catalog.json' with {type:'json'};
const turn={id:randomUUID(),topic:'intent',question:'عرّفنا عن نفسك وما تبحث عنه؟',answer:'أنا اجتماعي وأبي منقبة وغير مطلقة وأفضل الزواج عن طريق الأهل.',skipped:false};
const proposal={id:'profile:partnerCriteria.dressStyle',fieldId:'partnerCriteria.dressStyle',values:['niqab'],mode:'prefer',exclude:false,summary:'أفضل شريكة منقبة',evidence:[{turnId:turn.id,quote:'أبي منقبة'}],needsClarification:false};
const base=()=>({...initialInterviewDocument(true),turns:[turn]});
const completion=value=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({reply:'التقطت ما تفضّله في شريكتك.',answerDisposition:'answered',followUp:false,questionTopic:'communication',question:'كيف تفضلان بدء الحديث؟',proposals:[],profileProposals:[],invalidatedProfileProposals:[],readiness:[],clarifications:[],...value})}}]});
test('profile capture only accepts catalog paths and matching typed values',()=>{
 assert.ok(validateProfileProposal(proposal,[turn]));
 for(const fieldId of ['verified','signupConsents.assessment','__proto__','membership','gender','birthday'])assert.equal(validProfileValues({...proposal,fieldId}),false);
 assert.equal(validProfileValues({...proposal,values:['invented']}),false);
 assert.equal(validProfileValues({...proposal,mode:null}),false);
 assert.equal(validateProfileProposal({...proposal,evidence:[{turnId:turn.id,quote:'not present'}]},[turn]),null);
 assert.equal(validProfileValues({...proposal,fieldId:'partnerCriteria.height',values:['170','170'],exclude:false}),true);
 assert.equal(validProfileValues({...proposal,fieldId:'partnerCriteria.height',values:['190','170']}),false);
 assert.equal(validProfileValues({...proposal,fieldId:'partnerCriteria.maritalStatus',values:['never_married','divorced','widowed','married'],exclude:true}),false);
});
test('negative marital preference remains an explicit exclusion instead of inventing never-married',()=>{
 const p={...proposal,id:'profile:partnerCriteria.maritalStatus',fieldId:'partnerCriteria.maritalStatus',values:['divorced'],mode:'require',exclude:true,evidence:[{turnId:turn.id,quote:'غير مطلقة'}]};
 const result=applyInterviewCompletion(base(),completion({profileProposals:[proposal,p]}));
 assert.equal(result.profileProposals.length,2);assert.deepEqual(result.profileProposals[1].values,['divorced']);assert.equal(result.profileProposals[1].exclude,true);
 assert.equal(interviewCoverage(result).answered,0,'profile information never inflates 44 assessment coverage');
 assert.equal(result.currentQuestion.topic,'communication','understood profile details need not trap the opening');
 assert.equal(result.profileConfirmed.length,0,'extraction never publishes or approves profile changes');
});
test('omitted profile fields survive and a later correction wins without rewriting approved values',()=>{
 const first=applyInterviewCompletion(base(),completion({profileProposals:[proposal]}));
 const approved=confirmProfileChoices(first,[{id:proposal.id,values:proposal.values,mode:proposal.mode,exclude:false}]);
 const next={id:randomUUID(),topic:'communication',question:'ما تفضيلك؟',answer:'غيرت رأيي أفضل حجاب بدل نقاب',skipped:false};
 const nextDoc={...approved,turns:[turn,next]};
 const kept=applyInterviewCompletion(nextDoc,completion({profileProposals:[]}));assert.equal(kept.profileProposals.length,1);
 const corrected=applyInterviewCompletion(nextDoc,completion({profileProposals:[{...proposal,values:['hijab'],evidence:[{turnId:next.id,quote:'أفضل حجاب'}]}]}));
 assert.deepEqual(corrected.profileProposals[0].values,['hijab']);assert.deepEqual(corrected.profileConfirmed[0].values,['niqab']);
 const reviewed=confirmProfileChoices(corrected,[{id:proposal.id,values:['hijab'],mode:'prefer',exclude:false}]);assert.deepEqual(reviewed.profileConfirmed[0].values,['hijab']);
});
test('retraction becomes unresolved for review and cannot revive an obsolete confirmation',()=>{
 const correction={id:randomUUID(),topic:'intent',question:'هل ما زال مناسبًا؟',answer:'اسحب تفضيلي السابق لا أدري ما يناسبني',skipped:false};
 const doc={...base(),turns:[turn,correction],profileProposals:[proposal],profileConfirmed:[proposal]};
 const out=applyInterviewCompletion(doc,completion({invalidatedProfileProposals:[{id:proposal.id,evidence:[{turnId:correction.id,quote:'اسحب تفضيلي السابق'}]}]}));
 assert.equal(out.profileProposals[0].needsClarification,true);assert.equal(out.profileConfirmed.length,0);
});
test('old evidence cannot retract a newer correction',()=>{
 const correction={...turn,id:randomUUID(),answer:'أفضل حجاب الآن'};
 const newest={...proposal,values:['hijab'],evidence:[{turnId:correction.id,quote:correction.answer}]};
 const out=applyInterviewCompletion({...base(),turns:[turn,correction],profileProposals:[newest]},completion({invalidatedProfileProposals:[{id:proposal.id,evidence:proposal.evidence}]}));
 assert.deepEqual(out.profileProposals[0].values,['hijab']);assert.equal(out.profileProposals[0].needsClarification,false);
});
test('unrelated replies cannot create new profile facts',()=>{
 const out=applyInterviewCompletion(base(),completion({answerDisposition:'off_topic',profileProposals:[proposal]}));assert.equal(out.profileProposals.length,0);
});
test('conflicting profile duplicates with the same evidence require review rather than last-value guessing',()=>{
 const out=applyInterviewCompletion(base(),completion({profileProposals:[proposal,{...proposal,values:['hijab']}]}));
 assert.equal(out.profileProposals.length,1);assert.equal(out.profileProposals[0].needsClarification,true);
});
test('bounded contexts and independent review cannot smuggle account or assessment approval',()=>{
 assert.throws(()=>validateProfileContext([{...proposal,fieldId:'verified'}],true));
 assert.throws(()=>validateAssessmentContext([{id:'score',values:['100']}],true));
 assert.throws(()=>parseInterviewInput({action:'profileConfirm',revision:1,profileChoices:[{id:'profile:verified',values:['true'],mode:null,exclude:false}]}));
 assert.throws(()=>confirmProfileChoices({...base(),pendingAnalysis:true,profileProposals:[proposal]},[]),e=>e.code==='analysis_pending');
 const approved=confirmProfileChoices({...base(),profileProposals:[proposal]},[{id:proposal.id,values:['hijab'],mode:'require',exclude:false}]);
 assert.equal(approved.status,'active');assert.equal(approved.confirmed.length,0);assert.equal(approved.profileConfirmed.length,1);
});
test('provider input excludes sensitive fields and locally redacts incidental disclosures without consent',()=>{
 const safeContext={fieldId:'marriageBasics.marriageTimeline',values:['within_3_months'],mode:null,exclude:false};
 const sensitiveContext={fieldId:'marriageBasics.tribalBackground',values:['tribal'],mode:null,exclude:false};
 const raw='أنا شمري ومذهبي سني وبشرتي سمراء، ورقمي 0551234567. أبغى الزواج خلال ستة أشهر.';
 const classified=redactSensitiveInterviewText(raw);
 assert.deepEqual(new Set(classified.categories),new Set(['identifier','tribal_background','religion','skin_tone']));
 assert.doesNotMatch(classified.text,/شمري|سني|سمراء|0551234567/);
 assert.match(classified.text,/خلال ستة أشهر/);
 const privateProposal={...proposal,id:'profile:marriageBasics.tribalBackground',fieldId:'marriageBasics.tribalBackground',values:['tribal']};
 const source={...turn,answer:raw};
 const doc={...base(),turns:[source],profileContext:[safeContext,sensitiveContext],profileProposals:[proposal,privateProposal],profileConfirmed:[privateProposal]};
 const request=interviewCompletionRequest(doc,false,false),context=JSON.parse(request.messages[1].content);
 assert.doesNotMatch(JSON.stringify(context.transcript),/شمري|سني|سمراء|0551234567/);
 assert.match(context.transcript[0].answer,/خلال ستة أشهر/);
 assert.deepEqual(context.knownProfileContext,[safeContext]);
 assert.ok(context.profileCatalog.every(field=>!field.sensitive));
 assert.ok(!context.previousProfileProposals.some(item=>item.fieldId==='marriageBasics.tribalBackground'));
 assert.ok(!context.profileConfirmed.some(item=>item.fieldId==='marriageBasics.tribalBackground'));
 assert.ok(!request.response_format.json_schema.schema.properties.profileProposals.items.properties.fieldId.enum.includes('marriageBasics.tribalBackground'));
 assert.match(request.messages[0].content,/بديل خصوصية/);
});
test('explicit sensitive-processing consent keeps sensitive values available to Luna',()=>{
 const sensitiveContext={fieldId:'marriageBasics.tribalBackground',values:['tribal'],mode:null,exclude:false};
 const source={...turn,answer:'أنا شمري'};
 const request=interviewCompletionRequest({...base(),turns:[source],profileContext:[sensitiveContext]},false,true);
 const context=JSON.parse(request.messages[1].content);
 assert.equal(context.transcript[0].answer,source.answer);
 assert.deepEqual(context.knownProfileContext,[sensitiveContext]);
 assert.ok(context.profileCatalog.some(field=>field.fieldId==='marriageBasics.tribalBackground'&&field.sensitive));
 assert.ok(request.response_format.json_schema.schema.properties.profileProposals.items.properties.fieldId.enum.includes('marriageBasics.tribalBackground'));
});
test('sensitive consent is a boolean and unconsented callers cannot submit sensitive context',()=>{
 const sensitiveContext={fieldId:'marriageBasics.tribalBackground',values:['tribal'],mode:null,exclude:false};
 const baseInput={action:'start',consentVersion:CONSENT_VERSION,profileContext:[sensitiveContext]};
 assert.deepEqual(parseInterviewInput({...baseInput}).profileContext,[]);
 assert.deepEqual(parseInterviewInput({...baseInput,sensitiveProfileAllowed:false}).profileContext,[]);
 assert.deepEqual(parseInterviewInput({...baseInput,sensitiveProfileAllowed:true}).profileContext,[sensitiveContext]);
 assert.throws(()=>parseInterviewInput({...baseInput,sensitiveProfileAllowed:'true'}));
});
test('stored profile and assessment context suppress known fields without invented transcript evidence',async()=>{
 let state={document:null,revision:0};
 const service=createInterviewService({env:{},fetcher:async(_url,init)=>{const {command,payload}=JSON.parse(init.body);if(command==='start'&&!state.document)state={document:payload.document,revision:1};return Response.json(state);}});
 const profileContext=[{fieldId:'marriageBasics.marriageTimeline',values:['within_3_months'],mode:null,exclude:false}];
 const assessmentContext=[{id:'personality:initiative:self',values:['D']}];
 const result=await service({action:'start',consentVersion:CONSENT_VERSION,profileContext,assessmentContext},{authorization:'Bearer fictional.session'});
  assert.equal(result.coverage.answered,3);assert.equal(result.document.turns.length,0);
  const timingDefault=result.document.proposals.find(p=>p.id==='preference:marriage_timeline:partner');
  assert.equal(timingDefault.source,'self_default');assert.deepEqual(timingDefault.values,['A']);
  assert.equal(timingDefault.evidence[0].turnId,'context:preference:marriage_timeline:self');
  assert.ok(result.document.proposals.filter(p=>p!==timingDefault).every(p=>p.evidence[0].turnId==='context:'+p.id));
 const request=interviewCompletionRequest(result.document),context=JSON.parse(request.messages[1].content);
  assert.ok(!context.missingFields.some(p=>p.id==='personality:initiative:self'||p.id==='preference:marriage_timeline:self'||p.id==='preference:marriage_timeline:partner'));
 assert.deepEqual(context.knownProfileContext,profileContext);assert.match(request.messages[0].content,/لا تسأله عنها من جديد/);
  const loaded=await service({action:'load'},{authorization:'Bearer fictional.session'});assert.equal(loaded.coverage.answered,3);
});
test('profile confirmation HTTP input uses only selected IDs and canonical edited values',()=>{
 const payload={action:'profileConfirm',revision:2,profileChoices:[{id:proposal.id,values:['niqab'],mode:'prefer',exclude:false}]};assert.deepEqual(parseInterviewInput(payload),payload);
 assert.throws(()=>parseInterviewInput({...payload,profileChoices:[{...payload.profileChoices[0],evidence:proposal.evidence}]}));
});
test('an explicit profile timeline also fills matching assessment timing using the same evidence',()=>{
 const source={...turn,answer:'أفضّل الزواج خلال ثلاثة أشهر'};
 const timeline={...proposal,id:'profile:marriageBasics.marriageTimeline',fieldId:'marriageBasics.marriageTimeline',values:['within_3_months'],mode:null,exclude:false,evidence:[{turnId:turn.id,quote:source.answer}]};
 const first=applyInterviewCompletion({...base(),turns:[source]},completion({profileProposals:[timeline]}));
 assert.deepEqual(first.proposals.find(p=>p.id==='preference:marriage_timeline:self').values,['A']);
 const hybridDoc={...base(),turns:[source]};
 const hybrid=applyInterviewCompletion(hybridDoc,completion({profileProposals:[timeline]}),true,[],{hybrid:true});
 assert.ok(hybrid.profileProposals.some(p=>p.id===timeline.id));
 assert.ok(!hybrid.proposals.some(p=>p.fieldId==='marriage_timeline'));
 const correction={...turn,id:randomUUID(),answer:'بعد ستة أشهر إلى سنة بدل ثلاثة أشهر'};
 const updated=applyInterviewCompletion({...first,turns:[source,correction]},completion({profileProposals:[{...timeline,values:['six_to_twelve_months'],evidence:[{turnId:correction.id,quote:correction.answer}]}]}));
 const timing=updated.proposals.find(p=>p.id==='preference:marriage_timeline:self');assert.deepEqual(timing.values,['B']);assert.equal(timing.evidence[0].turnId,correction.id);
});
test('prompt captures explicit requirements while prohibiting invented requirements and paraphrased evidence',()=>{
 const prompt=interviewCompletionRequest(base()).messages[0].content;
 assert.doesNotMatch(prompt,/لا تضع شروطًا إلزامية أو نسب توافق/);
 assert.match(prompt,/لا تخترع شروطًا إلزامية/);assert.match(prompt,/mode=require وexclude=true/);assert.match(prompt,/انسخ evidence.quote حرفيًا/);
});
test('valid full multilingual profile and assessment contexts fit the bounded request',()=>{
 const profileContext=profileFields.map(f=>({fieldId:f.fieldId,values:f.kind==='range'?[String(f.min),String(f.max)]:f.criterionShape==='mode'?[]:f.kind==='text'?['中'.repeat(f.maxLength??600)]:f.kind==='number'?[String(f.max)]:f.kind==='set'||f.criterionShape==='values'?[...f.options].sort((a,b)=>Buffer.byteLength(b.value)-Buffer.byteLength(a.value)).slice(0,f.maxItems??30).map(o=>o.value):[[...f.options].sort((a,b)=>Buffer.byteLength(b.value)-Buffer.byteLength(a.value))[0].value],mode:f.criterionShape?'prefer':null,exclude:false}));
 const assessmentContext=preferences.dimensions.flatMap(d=>['self','partner'].map(side=>({id:`preference:${d.id}:${side}`,values:[d.options[0].code]}))).concat(traits.map(t=>({id:`personality:${t.id}:self`,values:['D']})));
 const body={action:'answer',revision:400,requestId:randomUUID(),answer:'中'.repeat(1200),profileContext,assessmentContext};
 assert.ok(Buffer.byteLength(JSON.stringify(body))>18000);assert.ok(parseInterviewInput(body));
});
test('context evidence binds extracted values while allowing explicit final review edits',()=>{
 const context=[{id:'preference:marriage_timeline:self',values:['A']}];
 const p={id:context[0].id,kind:'preference',fieldId:'marriage_timeline',side:'self',values:['B'],summary:'من الملف',evidence:[{turnId:'context:'+context[0].id,quote:'["A"]'}],needsClarification:false};
 assert.equal(validateProposal(p,[],context),null);assert.ok(validateProposal(p,[],context,true));
});
test('confirmation leaves analyzed context proposals and attestation fingerprint order unchanged',async()=>{
 const context=preferences.dimensions.flatMap(d=>['self','partner'].map(side=>({id:`preference:${d.id}:${side}`,values:[d.options[0].code]}))).concat(traits.map(p=>({id:`personality:${p.id}:self`,values:['D']})));
 const proposals=context.map(item=>{const[kind,fieldId,side]=item.id.split(':');return{...item,kind,fieldId,side,summary:'من الملف',evidence:[{turnId:'context:'+item.id,quote:JSON.stringify(item.values)}],needsClarification:false};}).reverse();
 let state={document:{...initialInterviewDocument(true),status:'review',currentQuestion:null,assessmentContext:context,proposals},revision:2};
 const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
 const fingerprint=canonical(state.document.proposals);let attested=false;
 const token='a.'+Buffer.from(JSON.stringify({sub:'11111111-1111-4111-8111-111111111111'})).toString('base64url')+'.b';
 const service=createInterviewService({env:{SUPABASE_SERVICE_ROLE_KEY:'synthetic'},fetcher:async(url,init)=>{const input=JSON.parse(init.body);if(url.endsWith('marriage_interview_attest')){assert.equal(input.event,'complete');assert.equal(canonical(state.document.proposals),fingerprint);attested=true;return Response.json({ok:true});}if(input.command==='save')state={...state,document:input.payload.document,revision:state.revision+1};return Response.json(state);}});
 const out=await service({action:'confirm',revision:2,choices:context.map((item,i)=>({...item,values:i===0?['B']:item.values}))},{authorization:'Bearer '+token});
 assert.equal(attested,true);assert.equal(out.document.confirmed.length,44);assert.equal(out.document.status,'confirmed');
});
