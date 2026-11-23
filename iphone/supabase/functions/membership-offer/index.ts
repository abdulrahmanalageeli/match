import {Buffer} from 'node:buffer'
import {createPrivateKey,sign} from 'node:crypto'
import {admin,currentMemberState,endpoint,HttpError,readBody,verifyAppPurchase} from '../_shared/apple.ts'

Deno.serve(endpoint(async req=>{
 const state=await currentMemberState(req)
 const actor=state.user.id
 const body=await readBody(req)
 const seriousness=body.productId==='com.blindmatch.marriage.monthly.seriousness'||body.productId==='com.blindmatch.marriage.monthly.seriousness.women'
 const transaction=await verifyAppPurchase(body.signedAppTransaction)
 const sandboxCheckout=transaction.sandbox && state.user.applicationStatus==='approved' && !state.user.paused &&
   !state.user.profileReviewPending && ['free','expired','trial'].includes(state.membership.status)
 const upgrade=seriousness && state.membership.active && state.membership.tier==='premium'
 if(body.claim===true && ((!sandboxCheckout && !state.membership.canStart && !upgrade) || (body.sandboxOnly===true && !sandboxCheckout)))
   throw new HttpError(403,'لا يتاح بدء هذا الاشتراك لحسابك حاليًا.')
 const key=Deno.env.get('APPLE_IAP_PRIVATE_KEY')?.replace(/\\n/g,'\n')
 const kid=Deno.env.get('APPLE_IAP_KEY_ID'),issuer=Deno.env.get('APPLE_IAP_ISSUER_ID')
 if(!key||!kid||!issuer)throw new HttpError(503,'عرض العضوية غير مهيأ حاليًا.')
 // Validate the signing configuration before consuming a launch reservation.
 const signingKey=createPrivateKey(key)
 if(signingKey.asymmetricKeyType!=='ec'||signingKey.asymmetricKeyDetails?.namedCurve!=='prime256v1')throw new HttpError(503,'مفتاح عرض العضوية غير صالح.')
 const {data,error}=await admin().rpc('marriage_prepare_launch_offer',{
  actor,apple_transaction:transaction.id,claim:!seriousness && !body.expectedPromotion && body.claim===true && body.appleEligible===true
 })
 if(error||!data)throw new HttpError(403,'تعذّر التحقق من أهلية العرض.')
 if(seriousness)data.productId=data.productId==='com.blindmatch.marriage.monthly.women'?'com.blindmatch.marriage.monthly.seriousness.women':'com.blindmatch.marriage.monthly.seriousness'
 let promotionId:string|null=null
 if(state.membership.status==='expired' && Array.isArray(body.promotionIds) && body.promotionIds.length && body.promotionIds.length<=100) {
  const promo=await admin().rpc('wudayn_eligible_promotion',{actor,product_id:data.productId,store_environment:transaction.sandbox?'Sandbox':'Production'})
  if(promo.error)throw new HttpError(503,'تعذّر تحديث العرض.')
  if(typeof promo.data==='string' && body.promotionIds.includes(promo.data))promotionId=promo.data
 }
 if(body.claim===true && (body.expectedPromotion??null)!==promotionId)return {productId:data.productId,promotionChanged:true}
 const eligible=!promotionId && !seriousness && data.eligible===true && body.appleEligible===true
 if(body.claim!==true)return {eligible,productId:data.productId,sandboxCheckout,promotionId}
 const encode=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url')
 function signed(audience:string,claims:Record<string,unknown>) {
  const input=encode({alg:'ES256',typ:'JWT',kid})+'.'+encode({iss:issuer,iat:Math.floor(Date.now()/1000),
   aud:audience,bid:'com.blindmatch.marriage',nonce:crypto.randomUUID(),productId:data.productId,transactionId:transaction.id,...claims})
  return input+'.'+sign('sha256',Buffer.from(input),{key:signingKey,dsaEncoding:'ieee-p1363'}).toString('base64url')
 }
 return {eligible,productId:data.productId,sandboxCheckout,accountToken:data.accountToken,promotionId,
  eligibilityJws:signed('introductory-offer-eligibility',{allowIntroductoryOffer:eligible}),
  promotionJws:promotionId?signed('promotional-offer',{offerIdentifier:promotionId}):null}
}))
