import { currentUser, endpoint, ingest, notification, readBody } from '../functions/_shared/apple.ts'

Deno.test('member and Apple endpoints return no-store JSON and reject forged inputs',async()=>{
  const member=endpoint(async(req)=>{
    const actor=await currentUser(req)
    return await ingest((await readBody(req)).signedTransaction,actor,false)
  })
  const callback=endpoint(notification)
  const req=(method:string,body?:string)=>new Request('https://project.test/functions/v1/test',{
    method,body,headers:{'Content-Type':'application/json'}
  })
  const cases=[
    [await member(req('OPTIONS')),204],
    [await member(req('POST','{}')),401],
    [await callback(req('GET')),405],
    [await callback(req('POST','not-json')),400],
    [await callback(req('POST',JSON.stringify({signedPayload:'pretend-apple'}))),400],
    [await callback(req('POST','x'.repeat(72001))),413],
  ] as const
  for(const [response,expected] of cases){
    if(response.status!==expected||response.headers.get('Cache-Control')!=='no-store')throw Error('Unexpected response '+response.status)
    await response.body?.cancel()
  }
})
