import {json,bodyJSON,clean,notifySchool} from "./_shared.js";
function validEmail(s){return !s || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)}
export async function onRequestPost({request,env}) {
  const d=await bodyJSON(request);
  if(!d) return json({error:"Please submit a valid form."},400);
  const child=clean(d.child_name,120), cls=clean(d.class_applied,40), parent=clean(d.parent_name,120), phone=clean(d.phone,30);
  const allowed=["Baby Class","Middle Class","Top Class","Primary 1","Primary 2","Primary 3","Primary 4","Primary 5"];
  if(!child||!cls||!parent||!phone) return json({error:"Please complete the required fields."},400);
  if(!allowed.includes(cls)) return json({error:"Please select a valid class."},400);
  const email=clean(d.email,160);
  if(!validEmail(email)) return json({error:"Please enter a valid email address."},400);
  let photo=typeof d.passport_data_url==="string"?d.passport_data_url:"";
  if(photo){
    if(photo.length>1400000) return json({error:"The photo is too large. Please use an image under 1 MB."},413);
    if(!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(photo)) return json({error:"The photo must be a JPG, PNG or WebP image."},400);
  }
  const reference="BAJS-"+Date.now().toString(36).toUpperCase()+"-"+crypto.randomUUID().slice(0,6).toUpperCase();
  try{
    await env.DB.prepare(`INSERT INTO applications(reference,child_name,date_of_birth,gender,class_applied,previous_school,parent_name,relationship,phone,email,address,medical_notes,passport_data_url)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(reference,child,clean(d.date_of_birth,20),clean(d.gender,30),cls,clean(d.previous_school,160),parent,clean(d.relationship,40),phone,email,clean(d.address,240),clean(d.medical_notes,1000),photo||null).run();
  }catch(e){console.error("Application save failed",e);return json({error:"We could not save your application just now. Please try again or contact the school by phone."},500)}
  const mail=await notifySchool(env,`New admission application: ${child}`,`A new online admission application has been received.\n\nReference: ${reference}\nChild: ${child}\nClass: ${cls}\nDate of birth: ${clean(d.date_of_birth,20)||"Not provided"}\nParent/guardian: ${parent}\nRelationship: ${clean(d.relationship,40)||"Not provided"}\nPhone: ${phone}\nEmail: ${email||"Not provided"}\nPrevious school: ${clean(d.previous_school,160)||"Not provided"}\nAddress: ${clean(d.address,240)||"Not provided"}\n\nSign in to the school admin dashboard to review the full application and any uploaded photo.`);
  return json({message:mail.sent?"Application received. The school has been notified by email.":"Application saved successfully. Email notification is not yet configured, but the school can review it in the admin dashboard.",reference,emailNotification:mail.sent?"sent":"not_configured"},201);
}
