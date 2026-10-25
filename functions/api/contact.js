import {json,bodyJSON,clean,notifySchool} from "../_shared.js";
export async function onRequestPost({request,env}) {
 const d=await bodyJSON(request); if(!d)return json({error:"Please submit a valid message."},400);
 if(clean(d.website,200))return json({message:"Message received."},201);
 const name=clean(d.name,120), message=clean(d.message,3000), email=clean(d.email,160), phone=clean(d.phone,30), subject=clean(d.subject,160);
 if(!name||!message)return json({error:"Please enter your name and message."},400);
 if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json({error:"Please enter a valid email address."},400);
 try{await env.DB.prepare("INSERT INTO messages(name,email,phone,subject,message) VALUES(?,?,?,?,?)").bind(name,email,phone,subject,message).run();}
 catch(e){console.error("Message save failed",e);return json({error:"We could not save your message. Please try again or contact the school by phone."},500)}
 const mail=await notifySchool(env,`Website enquiry${subject?": "+subject:""}`,`A new website message has been received.\n\nName: ${name}\nEmail: ${email||"Not provided"}\nPhone: ${phone||"Not provided"}\nSubject: ${subject||"Not provided"}\n\nMessage:\n${message}`);
 return json({message:mail.sent?"Your message has been received. The school has been notified by email.":"Your message has been saved. Email notification is not yet configured, but the school can review it in the admin dashboard."},201);
}
