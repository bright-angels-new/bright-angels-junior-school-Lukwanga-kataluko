import { json } from "../_shared.js";
import { verify, unauthorized } from "./_auth.js";

export async function onRequestGet({ request, env }) {
  if (!await verify(request, env)) return unauthorized();

  try {
    const [apps, feedback, news, settings] = await Promise.all([
      env.DB.prepare(`
        SELECT
          id,
          reference,
          child_name,
          dob AS date_of_birth,
          gender,
          class_applying AS class_applied,
          previous_school,
          guardian_name AS parent_name,
          relationship,
          phone,
          guardian_email AS email,
          address,
          notes AS medical_notes,
          NULL AS passport_data_url,
          'New' AS status,
          created_at
        FROM applications
        ORDER BY id DESC
        LIMIT 500
      `).all(),

      env.DB.prepare(`
        SELECT
          id,
          parent_name AS name,
          email,
          phone,
          'Parent feedback' AS subject,
          message,
          'New' AS status,
          created_at
        FROM feedback
        ORDER BY id DESC
        LIMIT 500
      `).all(),

      env.DB.prepare(`
        SELECT id, title, body, event_date, created_at
        FROM announcements
        ORDER BY id DESC
        LIMIT 100
      `).all(),

      env.DB.prepare(`
        SELECT key, value
        FROM settings
      `).all()
    ]);

    const content = Object.fromEntries(
      (settings.results || []).map(item => [item.key, item.value])
    );

    return json({
      applications: apps.results || [],
      messages: feedback.results || [],
      announcements: news.results || [],
      content
    });
  } catch (error) {
    console.error("Dashboard data loading failed:", error);
    return json({
      error: "Could not load dashboard data. Please check the database table definitions."
    }, 500);
  }
}
