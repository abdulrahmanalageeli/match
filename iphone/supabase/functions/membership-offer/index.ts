import {Buffer} from 'node:buffer'
import {createPrivateKey,sign} from 'node:crypto'
import {admin,currentUser,endpoint,HttpError,readBody,verifyAppPurchase} from '../_shared/apple.ts'

Deno.serve(endpoint(async req=>{
 const actor=await currentUser(req)
 const body=await readBody(req)
 const transaction=await verifyAppPurchase(body.signedAppTransaction)
 const key=Deno.env.get('APPLE_IAP_PRIVATE_KEY')?.replace(/\\n/g,'\n')
 const kid=Deno.env.get('APPLE_IAP_KEY_ID'),issuer=Deno.env.get('APPLE_IAP_ISSUER_ID')
 if(!key||!kid||!issuer)throw new HttpError(503,'عرض العضوية غير مهيأ حاليًا.')
 // Validate the signing configuration before consuming a launch reservation.
 const signingKey=createPrivateKey(key)
 if(signingKey.asymmetricKeyType!=='ec'||signingKey.asymmetricKeyDetails?.namedCurve!=='prime256v1')throw new HttpError(503,'مفتاح عرض العضوية غير صالح.')
 const {data,error}=await admin().rpc('marriage_prepare_launch_offer',{
  actor,apple_transaction:transaction,claim:body.claim===true && body.appleEligible===true
 })
 if(error||!data)throw new HttpError(403,'تعذّر التحقق من أهلية العرض.')
 const eligible=data.eligible===true && body.appleEligible===true
 if(body.claim!==true)return {eligible,productId:data.productId}
 const encode=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url')
 const input=encode({alg:'ES256',typ:'JWT',kid})+'.'+encode({iss:issuer,iat:Math.floor(Date.now()/1000),
  aud:'introductory-offer-eligibility',bid:'com.blindmatch.marriage',nonce:crypto.randomUUID(),
  productId:data.productId,transactionId:transaction,allowIntroductoryOffer:eligible})
 const signature=sign('sha256',Buffer.from(input),{key:signingKey,dsaEncoding:'ieee-p1363'}).toString('base64url')
 return {eligible,productId:data.productId,accountToken:data.accountToken,eligibilityJws:input+'.'+signature}
}))
