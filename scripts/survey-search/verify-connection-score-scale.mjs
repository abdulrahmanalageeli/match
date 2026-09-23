// Independent artifact arithmetic check; no scoring/model/generator imports.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';

const root=process.cwd();
const path=resolve(root,'server/matching/connection-score-scale.json');
const file=readFileSync(path);
const scale=JSON.parse(file);
const expected='b14be564cf25d5cfecbb88858a2e480f8bd8d32828a67a3a4be4136e3eeb021d';
const hash=x=>createHash('sha256').update(x).digest('hex');
assert.equal(scale.modelVersion,'2026-09-23-v14-shared-connection-75-25-min-100');
assert.equal(scale.method,'piecewise-linear-midrank-rational-tails');
assert.equal(scale.provenance.sourceModelSha256,expected);
assert.equal(hash(readFileSync(resolve(root,'server/matching/connection-model-config.json'))),expected);
assert.equal(scale.referenceCount,256);
assert.ok(Number.isFinite(scale.tailScale)&&scale.tailScale>0);
const knots=scale.knots;
const first=knots[0],last=knots.at(-1);
let consumed=0;
for(let i=0;i<knots.length;i++){
  const k=knots[i];
  assert.ok(Number.isFinite(k.x)&&Number.isFinite(k.y)&&Number.isSafeInteger(k.count)&&k.count>0);
  if(i) assert.ok(knots[i-1].x<k.x&&knots[i-1].y<k.y);
  const expectedY=100*(consumed+.5*k.count+.5)/(scale.referenceCount+1);
  assert.ok(Math.abs(k.y-expectedY)<1e-12);
  consumed+=k.count;
}
assert.equal(consumed,256);
const ref=knots.flatMap(k=>Array(k.count).fill(k.x));
const quantile=p=>{
  const t=p*(ref.length-1),i=Math.floor(t),j=Math.ceil(t);
  return ref[i]*(1-(t-i))+ref[j]*(t-i);
};
const iqr=quantile(.75)-quantile(.25);
assert.ok(Math.abs(scale.tailScale-Math.max(iqr,1e-6))<1e-12);

function independentIndex(x){
  if(!Number.isFinite(x)) throw new TypeError('Finite input required');
  if(x<first.x) return (first.y*scale.tailScale)/(scale.tailScale+first.x-x);
  if(x>last.x) return 100-((100-last.y)*scale.tailScale)/(scale.tailScale+x-last.x);
  const exact=knots.find(k=>k.x===x);
  if(exact) return exact.y;
  const i=knots.findIndex(k=>k.x>x);
  const a=knots[i-1],b=knots[i];
  const width=b.x-a.x;
  return ((b.x-x)*a.y+(x-a.x)*b.y)/width;
}
for(const k of knots) assert.equal(independentIndex(k.x),k.y);
const probes=new Set(knots.map(k=>k.x));
for(let i=1;i<knots.length;i++){
  const a=knots[i-1],b=knots[i];
  for(const f of [.25,.5,.75]) probes.add(a.x+(b.x-a.x)*f);
}
for(const n of [1e-6,1e-4,.01,.1,1,2,10,100,1e3,1e6]){
  probes.add(first.x-n*scale.tailScale);
  probes.add(last.x+n*scale.tailScale);
}
const ordered=[...probes].sort((a,b)=>a-b);
const mapped=ordered.map(independentIndex);
for(let i=0;i<mapped.length;i++){
  assert.ok(Number.isFinite(mapped[i])&&mapped[i]>0&&mapped[i]<100);
  if(i) assert.ok(mapped[i]>mapped[i-1]);
}
const epsilon=scale.tailScale*1e-9;
assert.ok(Math.abs(independentIndex(first.x-epsilon)-first.y)<1e-8);
assert.ok(Math.abs(independentIndex(last.x+epsilon)-last.y)<1e-8);
let minChecks=0;
for(let i=0;i<ordered.length;i+=7){
  for(let j=0;j<ordered.length;j+=11){
    const a=ordered[i],b=ordered[j];
    assert.equal(independentIndex(Math.min(a,b)),Math.min(independentIndex(a),independentIndex(b)));
    minChecks++;
  }
}
for(const invalid of [NaN,Infinity,-Infinity]) assert.throws(()=>independentIndex(invalid));
const extremes=[independentIndex(-Number.MAX_VALUE),independentIndex(Number.MAX_VALUE)];
assert.ok(extremes.every(x=>Number.isFinite(x)&&x>=0&&x<=100));
const result={
  status:'pass',
  method:'Independent JS artifact-only weighted linear interpolation and algebraically equivalent rational tails; no generator, scorer or model imports.',
  artifactSha256:hash(file),sourceModelSha256:expected,
  referenceCount:consumed,uniqueKnots:knots.length,midrankChecks:knots.length,
  strictMonotonicFiniteProbeChecks:ordered.length,minimumCommutationChecks:minChecks,
  boundaryContinuityChecks:2,nonfiniteInputRejections:3,
  tailScale:scale.tailScale,extremeFiniteBoundaryScores:extremes,
  caution:'At machine-extreme finite utility, floating-point output may saturate at0/100. Mathematical rational tails have no finite endpoint ties; ordinary sampled tails were strictly monotone.',
  samples:[-1,0,.25,.5,.75,1,2].map(rawUtility=>({rawUtility,directionalReferenceIndex:independentIndex(rawUtility)}))
};
const out=resolve(root,'tmp/survey-search-2026-09-23/verification-connection-score-scale.json');
mkdirSync(resolve(root,'tmp/survey-search-2026-09-23'),{recursive:true});
writeFileSync(out,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
