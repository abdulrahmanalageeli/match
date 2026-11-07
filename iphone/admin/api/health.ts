import type { VercelRequest, VercelResponse } from "@vercel/node";
export default function health(req: VercelRequest,res: VercelResponse) {
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="GET")return res.status(405).json({error:"method_not_allowed"});
  return res.status(200).json({status:"ok",service:"nisfayn-admin",environment:process.env.VERCEL_ENV??"development",release:"0.2.0"});
}
