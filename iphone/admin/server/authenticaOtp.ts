export async function authenticaOtp(action: 'send' | 'verify', phone: string, otp?: string, fetcher: typeof fetch = fetch): Promise<boolean> {
 const key=process.env.AUTHENTICA_KEY?.trim();
 if(!key || !/^\+9665\d{8}$/.test(phone) || (action==='verify' && !/^\d{4,8}$/.test(otp??''))) throw Error('unavailable');
 try {
  const response=await fetcher('https://api.authentica.sa/api/v2/'+(action==='send'?'send-otp':'verify-otp'),{
   method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),headers:{'Content-Type':'application/json',Accept:'application/json','X-Authorization':key},
   body:JSON.stringify(action==='send'?{method:'sms',phone}:{phone,otp}),
  });
  // The current API docs specify status:true for verification, NOT success:true.
  const value=await response.json();
  if(!response.ok){if(action==='verify'&&[400,422].includes(response.status))return false;throw Error('provider');}
  if(action==='send'){if(value?.success!==true)throw Error('provider');return true;}
  if(typeof value?.status!=='boolean')throw Error('provider');return value.status;
 }catch{throw Error('unavailable');}
}
