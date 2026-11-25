import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/community/deepReportDocument.ts', import.meta.url), 'utf8');
const model = new URL('../src/community/deepCompatibilityModel.ts', import.meta.url).href;
const compiled = ts.transpileModule(source.replace("'./deepCompatibilityModel'", JSON.stringify(model)), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { deepReportDocument } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const shared = {status:'shared',requestedByMe:true,findings:[{id:'f1',section:'strengths',kind:'strength',text:'A shared finding'}]};

test('only shared nonempty reports can be exported; private reviews and revoked copies fail closed', () => {
  for (const status of ['review','requested','ready','generating','stale','cancelled','declined','failed','none']) {
    assert.throws(() => deepReportDocument({...shared,status,review:[{secret:'private'}]}, 'أمل'));
  }
  assert.throws(() => deepReportDocument({...shared,findings:[]}, 'أمل'));
});

test('export includes all approved sections, but never IDs, raw evidence or private previews', () => {
  const document = deepReportDocument({...shared,id:'PRIVATE_ID',review:[{secret:'PRIVATE_REVIEW'}],findings:[{...shared.findings[0],evidence:'RAW_EVIDENCE'},{id:'f2',section:'conversation',kind:'manageable',text:'Approved prompt'}]}, 'أمل');
  assert.match(document,/A shared finding/);
  assert.match(document,/Approved prompt/);
  assert.match(document,/ما يجمعكما/);
  assert.doesNotMatch(document,/PRIVATE_ID|PRIVATE_REVIEW|RAW_EVIDENCE|ملخص التوافق/);
});

test('previously shared comparison rows are omitted from saved readings', () => {
  const text = 'وقت الخلاف\n\nاختارا وقتًا للعودة إلى الحوار.\n\n«عبارة الاستبيان»\nإجابتك: «الخيار الأول». إجابة أمل: «الخيار الثاني».';
  const document = deepReportDocument({...shared,findings:[{...shared.findings[0],text}]}, 'أمل');
  assert.match(document,/اختارا وقتًا/);
  assert.doesNotMatch(document,/الخيار الأول|الخيار الثاني|عبارة الاستبيان/);
});

test('peer names and model text cannot insert markup or initiate network requests', () => {
  const document = deepReportDocument({...shared,findings:[{...shared.findings[0],text:'<script>alert(1)</script><img src="https://evil.invalid"> &'}]}, '<svg onload="alert(1)">');
  assert.doesNotMatch(document,/<script|<img|<svg/);
  assert.match(document,/&lt;script&gt;/);
  assert.match(document,/&lt;svg onload=&quot;/);
  assert.match(document,/default-src 'none'/);
});

test('saved copy preserves participant mapping, research limits and revocation notice', () => {
  const sender = deepReportDocument(shared, 'أمل');
  const recipient = deepReportDocument({...shared,requestedByMe:false}, 'أمل');
  assert.match(sender,/أنت الطرف أ · أمل الطرف ب/);
  assert.match(recipient,/أنت الطرف ب · أمل الطرف أ/);
  assert.match(sender,/لا تشخّص الشخصية أو تتنبأ بنجاح الزواج/);
  assert.match(sender,/لا يحذف النسخ المحفوظة/);
});
