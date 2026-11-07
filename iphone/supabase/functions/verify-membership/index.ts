import { currentUser, endpoint, ingest, readBody } from '../_shared/apple.ts'
Deno.serve(endpoint(async(req)=>{
  const actor=await currentUser(req)
  const body=await readBody(req)
  return await ingest(body.signedTransaction,actor,false)
}))
