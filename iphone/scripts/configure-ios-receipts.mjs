import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { resolveDeployment } from '../src/deployment.ts';

// Only build-time, validated, public client configuration enters the extension.
const env = loadEnv('production', fileURLToPath(new URL('..', import.meta.url)), 'VITE_');
const deployment = resolveDeployment({
  mode: env.VITE_MARRIAGE_ENV, url: env.VITE_MARRIAGE_SUPABASE_URL,
  key: env.VITE_MARRIAGE_SUPABASE_PUBLISHABLE_KEY,
});
if (!deployment.ready || !/^sb_publishable_[\w-]+$/.test(deployment.key)) {
  throw new Error('Invalid membership backend for this iPhone build');
}
const plist = new URL('../ios/App/MessageReceipt/Info.plist', import.meta.url);
const output = readFileSync(plist, 'utf8')
  .replace(/(<key>ReceiptURL<\/key><string>).*?(<\/string>)/, `$1${deployment.url}/rest/v1/rpc/wudayn_confirm_notification$2`)
  .replace(/(<key>ReceiptPublicKey<\/key><string>).*?(<\/string>)/, `$1${deployment.key}$2`);
writeFileSync(plist, output);
