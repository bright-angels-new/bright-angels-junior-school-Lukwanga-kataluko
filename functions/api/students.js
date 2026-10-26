import { json, bodyJSON, clean } from "../_shared.js";
import { verify, unauthorized } from "./_auth.js";

export async function onRequestGet({ request, env }) {
  if (!await verify(request, env)) return unauthorized();

  try {
    const result = await env.DB.prepare(`
      SELECT
        id,
        admission_number,
        full_name,
        date_of_birth,
        gender,
        class_name,
        parent_name,
        parent_phone,
        parent_email,
        address,
        enrollment_date,
        status,
        created_at
      FROM students
      ORDER BY id DESC
      LIMIT 1000
    `).all();

    return json({ students: result.results || [] });
  } catch (error) {
    console.error("Loading students failed:", error);
    return json({ error: "Could not load student records." }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  if (!await verify(request, env)) return unauthorized();

  const data = await bodyJSON(request);

  if (!data) {
    return json({ error: "Invalid request data." }, 400);
  }

  const admissionNumber = clean(data.admission_number, 50);
  const fullName = clean(data.full_name, 200);
  const className = clean(data.class_name, 50);
  const parentName = clean(data.parent_name, 200);
  const parentPhone = clean(data.parent_phone, 40);

  if (
    !admissionNumber ||
    !fullName ||
    !className ||
    !parentName ||
    !parentPhone
  ) {
    return json({
      error: "Admission number, student name, class, parent name and parent phone are required."
    }, 400);
  }

  try {
    const result = await env.DB.prepare(`
      INSERT INTO students (
        admission_number,
        full_name,
        date_of_birth,
        gender,
        class_name,
        parent_name,
        parent_phone,
        parent_email,
        address,
        enrollment_date,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      admissionNumber,
      fullName,
      clean(data.date_of_birth, 10) || null,
      clean(data.gender, 20) || null,
      className,
      parentName,
      parentPhone,
      clean(data.parent_email, 160) || null,
      clean(data.address, 500) || null,
      clean(data.enrollment_date, 10) || new Date().toISOString().slice(0, 10),
      clean(data.status, 20) || "Active"
    ).run();

    return json({
      ok: true,
      message: "Student registered successfully.",
      id: result.meta?.last_row_id
    }, 201);

  } catch (error) {
    console.error("Saving student failed:", error);

    return json({
      error: "Student could not be saved. Check whether the admission number already exists."
    }, 400);
  }
      }
