import {json} from "../_shared.js";
import {verify,unauthorized} from "./_auth.js";
export async function onRequestGet({request,env}){
 if(!await verify(request,env))return unauthorized();
 try{
 const [apps,msgs,news,content]=await Promise.all([
 env.DB.prepare("SELECT id,reference,child_name,date_of_birth,gender,class_applied,previous_school,parent_name,relationship,phone,email,address,medical_notes,passport_data_url,status,created_at FROM applications ORDER BY id DESC LIMIT 500").all(),
 env.DB.prepare("SELECT id,name,email,phone,subject,message,status,created_at FROM messages ORDER BY id DESC LIMIT 500").all(),
 env.DB.prepare("SELECT id,title,body,event_date,created_at FROM announcements ORDER BY id DESC LIMIT 100").all(),
 env.DB.prepare("SELECT key,value FROM content").all()
 ]);
 return json({applications:apps.results||[],messages:msgs.results||[],announcements:news.results||[],content:Object.fromEntries((content.results||[]).map(x=>[x.key,x.value]))});
 }catch(e){console.error(e);return json({error:"Could not load dashboard data. Confirm the D1 schema has been installed."},500)}
}
