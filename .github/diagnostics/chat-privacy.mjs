import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const caseName = "test('pair deletion is sender-only, permanent, 48-hour bounded and removes copied replies and media access'";
const pairActions = new Set(['login', 'agreement_propose', 'agreement_accept', 'send', 'state', 'read',
  'message_delete', 'media_reserve', 'media_publish', 'media_url', 'media_open', 'close']);

function failureType(error) {
  if (error instanceof WebAssembly.RuntimeError) return 'Wasm trap: ' + error.message;
  return [error?.name || 'Error', error?.code].filter(Boolean).join(' / ');
}

// Record operation names and error types. Exclude bindings, SQL, member state and returned rows.
export function traceDatabase(db) {
  let count = 0;
  for (const method of ['query', 'exec']) {
    const original = db[method].bind(db);
    db[method] = async function (...args) {
      const [sql, params] = args;
      const seq = ++count;
      const name = sql.includes('public.nisfayn_test_rpc(') && pairActions.has(params?.[0])
        ? 'pair.' + params[0] : String(sql).trim().split(/\s+/, 1)[0];
      const calls = new Error().stack.split('\n').filter(line => line.includes('.chat-privacy-diagnostic.mjs:'))
        .map(line => line.match(/\.chat-privacy-diagnostic\.mjs:(\d+):/)?.[1]).filter(Boolean);
      try {
        return await original(...args);
      } catch (error) {
        // Negative authorization checks normally produce SQL errors. Preserve every rejection so
        // an earlier trap cannot disappear behind asService's RESET ROLE or database teardown.
        console.log(`[privacy-diag] query ${seq} ${name} lines=${calls.join(',')} ${failureType(error)}`);
        throw error;
      }
    };
  }
}

export function reportFailure(phase, error) {
  console.log(`[privacy-diag] ${phase} failed: ${failureType(error)}`);
  const frames = error?.stack?.split('\n').filter(line => /^\s+at /.test(line)).slice(0, 9);
  if (frames?.length) console.log(frames.join('\n'));
}

function replaceOnce(text, anchor, value) {
  if (text.split(anchor).length !== 2) throw Error('The expected chat privacy fixture changed');
  return text.replace(anchor, () => value);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const original = (await readFile('chat-privacy.test.mjs', 'utf8')).replace(/\r\n/g, '\n');
  const start = original.indexOf(caseName);
  const end = original.indexOf('\ntest(', start + 1);
  if (start < 0 || end < 0) throw Error('Cannot locate the pair deletion test');
  let target = original.slice(start, end);
  target = replaceOnce(target, 'const db=await createDatabase();try{',
    'const db=await createDatabase();traceDatabase(db);let bodyError;try{');
  target = replaceOnce(target, '}finally{await db.close();}', `
    console.log('[privacy-diag] All pair-deletion assertions passed before teardown');
  } catch (error) {
    bodyError = error;
    reportFailure('body', error);
  }
  try {
    await db.close();
    console.log('[privacy-diag] Closed database');
  } catch (error) {
    reportFailure('close', error);
    if (bodyError) throw new AggregateError([bodyError, error], 'Test body and database close both failed');
    throw error;
  }
  if (bodyError) throw bodyError;`);
  // Append the hoisted import so the existing assertion line numbers still match the original.
  await writeFile('.chat-privacy-diagnostic.mjs', original.slice(0, start) + target + original.slice(end)
    + '\nimport { traceDatabase, reportFailure } from ' + JSON.stringify(import.meta.url) + ';\n', {flag: 'wx'});
}
