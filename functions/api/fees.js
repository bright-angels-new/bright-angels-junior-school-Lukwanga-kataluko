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
        f.id,
        f.student_id,
        s.admission_number,
        s.full_name AS student_name,
        s.class_name,
        f.academic_year,
        f.term,
        f.amount_paid,
        f.payment_date,
        f.payment_method,
        f.receipt_number,
        f.notes,
        f.created_at
      FROM fee_payments f
      JOIN students s ON s.id = f.student_id
      WHERE 1 = 1
    `;

    const params = [];

    if (studentId) {
      const id = Number(studentId);

      if (!Number.isInteger(id) || id < 1) {
        return json({ error: "Invalid student ID." }, 400);
      }

      query += " AND f.student_id = ?";
      params.push(id);
    }

    if (academicYear) {
      query += " AND f.academic_year = ?";
      params.push(clean(academicYear, 20));
    }

    if (term) {
      query += " AND f.term = ?";
      params.push(clean(term, 30));
    }

    query += " ORDER BY f.payment_date DESC, f.id DESC LIMIT 2000";

    const result = await env.DB.prepare(query).bind(...params).all();

    return json({ payments: result.results || [] });
  } catch (error) {
    console.error("Loading fee payments failed:", error);
    return json({ error: "Could not load fee payments." }, 500);
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
  const amountPaid = Number(data.amount_paid);
  const paymentDate = clean(data.payment_date, 10);
  const paymentMethod = clean(data.payment_method, 50);
  const receiptNumber = clean(data.receipt_number, 100);
  const notes = clean(data.notes, 500);

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

  if (
    data.amount_paid === "" ||
    data.amount_paid === null ||
    data.amount_paid === undefined ||
    !Number.isFinite(amountPaid) ||
    amountPaid <= 0
  ) {
    return json({
      error: "The payment amount must be greater than zero."
    }, 400);
  }

  if (receiptNumber && receiptNumber.length > 100) {
    return json({ error: "Receipt number is too long." }, 400);
  }

  if (paymentDate && !/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
    return json({ error: "Enter the payment date in YYYY-MM-DD format." }, 400);
  }

  try {
    const result = await env.DB.prepare(`
      INSERT INTO fee_payments (
        student_id,
        academic_year,
        term,
        amount_paid,
        payment_date,
        payment_method,
        receipt_number,
        notes
      )
      VALUES (?, ?, ?, ?, COALESCE(NULLIF(?, ''), CURRENT_DATE), ?, NULLIF(?, ''), ?)
    `).bind(
      studentId,
      academicYear,
      term,
      amountPaid,
      paymentDate || "",
      paymentMethod || null,
      receiptNumber || "",
      notes || null
    ).run();

    return json({
      ok: true,
      message: "Fee payment recorded successfully.",
      payment_id: result.meta?.last_row_id,
      receipt_number: receiptNumber || null
    }, 201);

  } catch (error) {
    console.error("Recording fee payment failed:", error);

    return json({
      error: "Could not record the payment. Check the student details and ensure the receipt number has not been used."
    }, 400);
  }
}
