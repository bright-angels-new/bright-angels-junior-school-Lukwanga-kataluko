import { json, bodyJSON, clean } from "../_shared.js";
import { verify, unauthorized } from "./_auth.js";

export async function onRequestGet({ request, env }) {
  if (!await verify(request, env)) return unauthorized();

  const url = new URL(request.url);
  const studentId = url.searchParams.get("student_id");
  const academicYear = url.searchParams.get("academic_year");
  const term = url.searchParams.get("term");

  try {
    let query = `
      SELECT
        m.id,
        m.student_id,
        s.admission_number,
        s.full_name AS student_name,
        m.subject_id,
        sub.subject_name,
        m.academic_year,
        m.term,
        m.assessment_type,
        m.marks_obtained,
        m.maximum_marks,
        m.remarks,
        m.created_at
      FROM marks m
      JOIN students s ON s.id = m.student_id
      JOIN subjects sub ON sub.id = m.subject_id
      WHERE 1 = 1
    `;

    const params = [];

    if (studentId) {
      const id = Number(studentId);
      if (!Number.isInteger(id) || id < 1) {
        return json({ error: "Invalid student ID." }, 400);
      }
      query += " AND m.student_id = ?";
      params.push(id);
    }

    if (academicYear) {
      query += " AND m.academic_year = ?";
      params.push(clean(academicYear, 20));
    }

    if (term) {
      query += " AND m.term = ?";
      params.push(clean(term, 30));
    }

    query += " ORDER BY s.full_name ASC, sub.subject_name ASC LIMIT 2000";

    const result = await env.DB.prepare(query).bind(...params).all();

    return json({ marks: result.results || [] });
  } catch (error) {
    console.error("Loading marks failed:", error);
    return json({ error: "Could not load marks." }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  if (!await verify(request, env)) return unauthorized();

  const data = await bodyJSON(request);

  if (!data) {
    return json({ error: "Invalid request data." }, 400);
  }

  const studentId = Number(data.student_id);
  const subjectId = Number(data.subject_id);
  const academicYear = clean(data.academic_year, 20);
  const term = clean(data.term, 30);
  const assessmentType = clean(data.assessment_type || "Exam", 40);
  const marksObtained = Number(data.marks_obtained);
  const maximumMarks = Number(data.maximum_marks ?? 100);
  const remarks = clean(data.remarks, 500);

  if (
    !Number.isInteger(studentId) || studentId < 1 ||
    !Number.isInteger(subjectId) || subjectId < 1 ||
    !academicYear || !term || !assessmentType
  ) {
    return json({
      error: "Valid student, subject, academic year, term and assessment type are required."
    }, 400);
  }

  if (
    data.marks_obtained === "" ||
    data.marks_obtained === null ||
    data.marks_obtained === undefined ||
    !Number.isFinite(marksObtained) ||
    !Number.isFinite(maximumMarks) ||
    maximumMarks <= 0 ||
    marksObtained < 0 ||
    marksObtained > maximumMarks
  ) {
    return json({
      error: "Marks must be between zero and the maximum marks."
    }, 400);
  }

  try {
    const result = await env.DB.prepare(`
      INSERT INTO marks (
        student_id,
        subject_id,
        academic_year,
        term,
        assessment_type,
        marks_obtained,
        maximum_marks,
        remarks
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (
        student_id,
        subject_id,
        academic_year,
        term,
        assessment_type
      )
      DO UPDATE SET
        marks_obtained = excluded.marks_obtained,
        maximum_marks = excluded.maximum_marks,
        remarks = excluded.remarks
    `).bind(
      studentId,
      subjectId,
      academicYear,
      term,
      assessmentType,
      marksObtained,
      maximumMarks,
      remarks || null
    ).run();

    return json({
      ok: true,
      message: "Marks saved successfully.",
      changes: result.meta?.changes
    });
  } catch (error) {
    console.error("Saving marks failed:", error);

    return json({
      error: "Could not save marks. Check that the student and subject exist."
    }, 400);
  }
        }
