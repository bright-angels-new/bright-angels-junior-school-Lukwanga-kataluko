import {json} from "../_shared.js";
const enc = new TextEncoder();
function b64(bytes){let s="";for(const b of new Uint8Array(bytes))s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}
async function sign(payload,secret){const key=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return b64(await crypto.subtle.sign("HMAC",key,enc.encode(payload)))}
export async function makeToken(email,secret){const payload=b64(enc.encode(JSON.stringify({email,exp:Date.now()+8*60*60*1000,nonce:crypto.randomUUID()})));return payload+"."+await sign(payload,secret)}
export async function verify(request,env){const secret=env.SESSION_SECRET;if(!secret)return false;const cookie=request.headers.get("Cookie")||"";const match=cookie.match(/(?:^|;\s*)bajs_admin=([^;]+)/);if(!match)return false;const token=decodeURIComponent(match[1]);const parts=token.split(".");if(parts.length!==2)return false;const expected=await sign(parts[0],secret);if(expected.length!==parts[1].length)return false;let diff=0;for(let i=0;i<expected.length;i++)diff|=expected.charCodeAt(i)^parts[1].charCodeAt(i);if(diff)return false;try{const p=JSON.parse(atob(parts[0].replace(/-/g,"+").replace(/_/g,"/")));return p.email===(env.ADMIN_EMAIL||"brightangels26@gmail.com")&&p.exp>Date.now()}catch{return false}}
export const unauthorized=()=>json({error:"Please sign in again to continue."},401);
export function cookieHeader(value,maxAge=28800){return `bajs_admin=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`}
export {json};
