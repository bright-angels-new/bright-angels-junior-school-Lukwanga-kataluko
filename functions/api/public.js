export async function onRequestGet({ env }) {
  try {
    const rows = await env.DB.prepare("SELECT key, value FROM content").all();
    const content = Object.fromEntries((rows.results || []).map(r => [r.key, r.value]));
    const news = await env.DB.prepare("SELECT id,title,body,event_date,created_at FROM announcements ORDER BY COALESCE(event_date, created_at) DESC, id DESC LIMIT 12").all();
    return Response.json({ content, announcements: news.results || [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ content: {}, announcements: [] });
  }
}
