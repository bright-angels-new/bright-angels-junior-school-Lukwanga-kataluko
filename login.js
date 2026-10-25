import {json,bodyJSON,clean} from "../_shared.js";
import {makeToken,cookieHeader} from "./_auth.js";
export async function onRequestPost({request,env}){
 if(!env.ADMIN_PASSWORD||!env.SESSION_SECRET)return json({error:"Administrator login is not configured yet. Set ADMIN_PASSWORD and SESSION_SECRET in Cloudflare Pages secrets."},503);
 const d=await bodyJSON(request);const email=clean(d?.email,160).toLowerCase(),password=typeof d?.password==="string"?d.password:"";
 const expected=(env.ADMIN_EMAIL||"brightangels26@gmail.com").toLowerCase();
 if(email!==expected||password!==env.ADMIN_PASSWORD)return json({error:"The email or password is incorrect."},401);
 const token=await makeToken(expected,env.SESSION_SECRET);
 return new Response(JSON.stringify({ok:true}),{status:200,headers:{"Content-Type":"application/json","Cache-Control":"no-store","Set-Cookie":cookieHeader(token)}});
}