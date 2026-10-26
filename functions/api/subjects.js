import { json, bodyJSON, clean } from "../_shared.js";
import { verify, unauthorized } from "./_auth.js";

export async function onRequestGet({ request, env }) {
  if (!await verify(request, env)) return unauthorized();

  try {
    const result = await env.DB.prepare(`
      SELECT id, subject_name, created_at
      FROM subjects
      ORDER BY subject_name ASC
    `).all();

    return json({ subjects: result.results || [] });
  } catch (error) {
    console.error("Loading subjects failed:", error);
    return json({ error: "Could not load subjects." }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  if (!await verify(request, env)) return unauthorized();

  const data = await bodyJSON(request);

  if (!data) {
    return json({ error: "Invalid request data." }, 400);
  }

  const subjectName = clean(data.subject_name, 100);

  if (!subjectName) {
    return json({ error: "Enter a subject name." }, 400);
  }

  try {
    await env.DB.prepare(`
      INSERT INTO subjects (subject_name)
      VALUES (?)
    `).bind(subjectName).run();

    return json({
      ok: true,
      message: "Subject added successfully."
    }, 201);
  } catch (error) {
    console.error("Saving subject failed:", error);

    return json({
      error: "Could not add the subject. It may already exist."
    }, 400);
  }
}

export async function onRequestDelete({ request, env }) {
  if (!await verify(request, env)) return unauthorized();

  const url = new URL(request.url);
  const id = Number(url.searchParams.get("id"));

  if (!Number.isInteger(id) || id < 1) {
    return json({ error: "A valid subject ID is required." }, 400);
  }

  try {
    const result = await env.DB.prepare(`
      DELETE FROM subjects
      WHERE id = ?
    `).bind(id).run();

    if (!result.meta?.changes) {
      return json({ error: "Subject not found." }, 404);
    }

    return json({
      ok: true,
      message: "Subject deleted successfully."
    });
  } catch (error) {
    console.error("Deleting subject failed:", error);

    return json({
      error: "Could not delete this subject. It may already be used for student marks."
    }, 400);
  }
      }
