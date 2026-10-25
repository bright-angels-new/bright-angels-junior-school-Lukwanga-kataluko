export const json = (data, status=200) => new Response(JSON.stringify(data), {status, headers: {"Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store"}});
export async function bodyJSON(request) { try { return await request.json(); } catch { return null; } }
export function clean(value, max=3000) { return typeof value === "string" ? value.trim().slice(0,max) : ""; }
export async function notifySchool(env, subject, textBody) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return {sent:false, reason:"email_not_configured"};
  const response = await fetch("https://api.resend.com/emails", {
    method:"POST",
    headers:{"Authorization":`Bearer ${env.RESEND_API_KEY}`,"Content-Type":"application/json"},
    body:JSON.stringify({from:env.EMAIL_FROM,to:[env.SCHOOL_EMAIL || "brightangels26@gmail.com"],subject,text:textBody})
  });
  if (!response.ok) {
    const detail = await response.text();
    console.error("Email delivery failed:", response.status, detail.slice(0,500));
    return {sent:false, reason:"email_delivery_failed"};
  }
  return {sent:true};
}