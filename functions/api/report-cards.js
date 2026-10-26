import { json, bodyJSON, clean } from "../_shared.js";
import { verify, unauthorized } from "./_auth.js";

function calculateGrade(average) {
  if (average >= 80) return "A";
  if (average >= 70) return "B";
  if (average >= 60) return "C";
  if (average >= 50) return "D";
  return "E";
}

export async function onRequestGet({ request, env }) {
  if (!await verify(request, env)) return unauthorized();

  const url = new URL(request.url);
  const studentId = url.searchParams.get("student_id");
  const academicYear = url.searchParams.get("academic_year");
  const term = url.searchParams.get("term");

  try {
    let query = `
      SELECT
        r.id,
        r.student_id,
        s.admission_number,
        s.full_name AS student_name,
        s.class_name,
        r.academic_year,
        r.term,
        r.total_marks,
        r.average_marks,
        r.grade,
        r.teacher_comment,
        r.headteacher_comment,
        r.created_at
      FROM report_cards r
      JOIN students s ON s.id = r.student_id
      WHERE 1 = 1
    `;

    const params = [];

    if (studentId) {
      const id = Number(studentId);

      if (!Number.isInteger(id) || id < 1) {
        return json({ error: "Invalid student ID." }, 400);
      }

      query += " AND r.student_id = ?";
      params.push(id);
    }

    if (academicYear) {
      query += " AND r.academic_year = ?";
      params.push(clean(academicYear, 20));
    }

    if (term) {
      query += " AND r.term = ?";
      params.push(clean(term, 30));
    }

    query += " ORDER BY s.class_name, s.full_name LIMIT 2000";

    const result = await env.DB.prepare(query).bind(...params).all();

    return json({ report_cards: result.results || [] });
  } catch (error) {
    console.error("Loading report cards failed:", error);
    return json({ error: "Could not load report cards." }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  if (!await verify(request, env)) return unauthorized();

  const data = await bodyJSON(request);

  if (!data) {
    return json({ error: "Invalid request data." }, 400);
  }

  const studentId = Number(data.student_id);
  const academicYear = clean(data.academic_year, 20);
  const term = clean(data.term, 30);
  const teacherComment = clean(data.teacher_comment, 1000);
  const headteacherComment = clean(data.headteacher_comment, 1000);

  if (
    !Number.isInteger(studentId) ||
    studentId < 1 ||
    !academicYear ||
    !term
  ) {
    return json({
      error: "A valid student, academic year and term are required."
    }, 400);
  }

  try {
    const marksResult = await env.DB.prepare(`
      SELECT
        SUM(marks_obtained) AS total_marks,
        SUM(maximum_marks) AS total_possible
      FROM marks
      WHERE student_id = ?
        AND academic_year = ?
        AND term = ?
    `).bind(studentId, academicYear, term).first();

    if (!marksResult || !marksResult.total_possible || marksResult.total_possible <= 0) {
      return json({
        error: "No marks are available for this pupil and term. Record marks before creating a report card."
      }, 400);
    }

    const totalMarks = Number(marksResult.total_marks || 0);
    const average = Number(
      ((totalMarks / marksResult.total_possible) * 100).toFixed(2)
    );
    const grade = calculateGrade(average);

    await env.DB.prepare(`
      INSERT INTO report_cards (
        student_id,
        academic_year,
        term,
        total_marks,
        average_marks,
        grade,
        teacher_comment,
        headteacher_comment
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (student_id, academic_year, term)
      DO UPDATE SET
        total_marks = excluded.total_marks,
        average_marks = excluded.average_marks,
        grade = excluded.grade,
        teacher_comment = excluded.teacher_comment,
        headteacher_comment = excluded.headteacher_comment
    `).bind(
      studentId,
      academicYear,
      term,
      totalMarks,
      average,
      grade,
      teacherComment || null,
      headteacherComment || null
    ).run();

    return json({
      ok: true,
      message: "Report card calculated and saved successfully.",
      total_marks: totalMarks,
      average_marks: average,
      grade
    });
  } catch (error) {
    console.error("Creating report card failed:", error);

    return json({
      error: "Could not create the report card. Check that the pupil exists."
    }, 400);
  }
}
