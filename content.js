import {json,bodyJSON,clean} from "../_shared.js";
import {verify,unauthorized} from "./_auth.js";
export async function onRequestPut({request,env}){
 if(!await verify(request,env))return unauthorized();const d=await bodyJSON(request);if(!d)return json({error:"Invalid content."},400);
 try{for(const key of ["welcome","about"]){if(typeof d[key]!=="string")continue;await env.DB.prepare("INSERT INTO content(key,value,updated_at) VALUES(?,?,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=datetime('now')").bind(key,clean(d[key],key==="about"?2500:800)).run()}return json({ok:true})}
 catch(e){console.error(e);return json({error:"Could not save content."},500)}
}