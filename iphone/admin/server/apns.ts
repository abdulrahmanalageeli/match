import { connect, constants, type ClientHttp2Session, type ClientHttp2Stream } from 'node:http2';
import { createPrivateKey, sign, type KeyObject } from 'node:crypto';

export type PushKind = 'request' | 'mutual' | 'message';
export type PushDetails={preview:'private'|'name'|'content';sender?:string;body?:string;messageId?:string;badge:number};
export type PushJob = { id: string; leaseId: string; requestId: string; kind: PushKind; token: string; environment: 'sandbox' | 'production'; expiresAt: string;details?:PushDetails };
export type ApnsConfig = { teamId: string; keyId: string; privateKey: string; topic: string; environment: 'sandbox' | 'production' };
export type DeliveryResult = 'sent' | 'invalid' | 'retry' | 'failed';
export type CallPushJob = {callId:string;installation:string;token:string;environment:'sandbox'|'production'};

export function pushPayload(job: Pick<PushJob, 'requestId' | 'kind' | 'details'>) {
  const copy: Record<PushKind, string> = {
    request: 'لديك طلب تعارف جديد. افتح نصفين للاطلاع عليه.',
    mutual: 'تم القبول المتبادل. يمكنك بدء الحديث في نصفين.',
    message: 'لديك رسالة جديدة في نصفين.',
  };
  if (!copy[job.kind] || !/^[0-9a-f-]{36}$/i.test(job.requestId)) throw new Error('Invalid push event');
  const clean=(value:string,limit:number)=>value.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,' ').trim().slice(0,limit);
  const details=job.details;
  const named=details&&['name','content'].includes(details.preview);
  const title=named&&details.sender?clean(details.sender,50):'نصفين';
  const body=details?.preview==='content'&&details.body&&job.kind==='message'?clean(details.body,160):copy[job.kind];
  return { aps: { alert: { title, body }, sound: 'default', 'thread-id':job.requestId,
    ...(details?{badge:Math.max(0,Math.min(999,Math.floor(details.badge)||0))}:{}),
    ...(job.kind==='message'?{category:'NISFAYN_MESSAGE'}:{}) }, requestId: job.requestId, kind: job.kind,
    ...(details?.messageId&&/^[0-9a-f-]{36}$/i.test(details.messageId)?{messageId:details.messageId}:{}) };
}

export function providerToken(config: ApnsConfig, now = Date.now()) {
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: config.keyId })).toString('base64url');
  const claims = Buffer.from(JSON.stringify({ iss: config.teamId, iat: Math.floor(now / 1000) })).toString('base64url');
  const key: KeyObject = createPrivateKey(Buffer.from(config.privateKey, 'base64'));
  if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') throw new Error('Invalid APNs signing key');
  const input = `${header}.${claims}`;
  return `${input}.${sign('sha256', Buffer.from(input), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
}

export function classifyApns(status: number, reason?: string): DeliveryResult {
  if (status === 200) return 'sent';
  if (status === 410 || ['BadDeviceToken', 'Unregistered', 'DeviceTokenNotForTopic'].includes(reason || '')) return 'invalid';
  if (status === 429 || status >= 500) return 'retry';
  return 'failed';
}

// One invocation shares one HTTP/2 session; no unbounded serverless background work.
export function openApns(config: ApnsConfig, makeConnection: (authority: string) => ClientHttp2Session = connect) {
  const token = providerToken(config);
  const client = makeConnection(config.environment === 'production' ? 'https://api.push.apple.com' : 'https://api.sandbox.push.apple.com');
  client.on('error', () => {}); // Individual requests surface failure without logging device addresses.
  function deliver(job: PushJob | CallPushJob): Promise<DeliveryResult> {
      const call = 'callId' in job;
      if (call && (!/^[0-9a-f-]{36}$/i.test(job.callId)||!/^[0-9a-f-]{36}$/i.test(job.installation))) return Promise.resolve('failed');
      if (job.environment !== config.environment || !/^[0-9a-f]{32,512}$/.test(job.token)) return Promise.resolve('failed');
      return new Promise(resolve => {
        let finished = false, status = 0, body = '';
        const finish = (value: DeliveryResult) => { if (!finished) { finished = true; clearTimeout(timer); resolve(value); } };
        let request: ClientHttp2Stream | undefined;
        const timer = setTimeout(() => { request?.close(constants.NGHTTP2_CANCEL); finish('retry'); }, 8000);
        try {
        request = client.request({
          ':method': 'POST', ':path': '/3/device/' + job.token, authorization: 'bearer ' + token,
          'apns-topic': config.topic + (call ? '.voip' : ''), 'apns-push-type': call ? 'voip' : 'alert', 'apns-priority': '10',
          'apns-expiration': call ? '0' : String(Math.floor(new Date(job.expiresAt).getTime() / 1000)),
          ...(!call ? {'apns-id': job.id, 'apns-collapse-id': job.kind + ':' + job.requestId} : {}),
          'content-type': 'application/json',
        });
        request.setEncoding('utf8');
        request.on('response', headers => { status = Number(headers[':status']); });
        request.on('data', chunk => { if (body.length < 4096) body += chunk; });
        request.on('error', () => finish('retry'));
        request.on('end', () => {
          let reason: string | undefined;
          try { reason = JSON.parse(body).reason; } catch { /* Successful empty response. */ }
          finish(classifyApns(status, reason));
        });
        request.end(JSON.stringify(call ? {aps:{},callId:job.callId,installation:job.installation} : pushPayload(job)));
        } catch { finish('retry'); }
      });
  }
  return {close: () => client.close(),send:(job:PushJob)=>deliver(job),sendCall:(job:CallPushJob)=>deliver(job)};
}
