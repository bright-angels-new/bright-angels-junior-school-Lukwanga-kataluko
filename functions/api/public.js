export async function onRequestGet({ env }) {
  try {
    const settingsResult = await env.DB.prepare(
      "SELECT key, value FROM settings"
    ).all();

    const content = Object.fromEntries(
      (settingsResult.results || []).map(row => [
        row.key,
        row.value
      ])
    );

    const newsResult = await env.DB.prepare(
      "SELECT id, title, body, date AS event_date, created_at FROM announcements ORDER BY COALESCE(date, created_at) DESC, id DESC LIMIT 12"
    ).all();

    return Response.json(
      {
        content,
        announcements: newsResult.results || []
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    console.error("Public website data failed:", error);

    return Response.json(
      {
        content: {},
        announcements: []
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  }
}
