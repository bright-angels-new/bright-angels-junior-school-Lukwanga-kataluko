const ADMIN_EMAIL = 'brightangels26@gmail.com';
const COOKIE = 'ba_admin';

const schema = `
CREATE TABLE IF NOT EXISTS ba_students (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 admission_number TEXT UNIQUE,
 name TEXT NOT NULL,
 class_name TEXT NOT NULL,
 gender TEXT,
 guardian TEXT,
 phone TEXT,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ba_subjects (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 class_name TEXT NOT NULL,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(name, class_name)
);

CREATE TABLE IF NOT EXISTS ba_marks (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 student_id INTEGER NOT NULL,
 subject_id INTEGER NOT NULL,
 term TEXT NOT NULL,
 year INTEGER NOT NULL,
 score REAL NOT NULL,
 out_of REAL NOT NULL,
 comment TEXT,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ba_fees (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 student_id INTEGER NOT NULL,
 term TEXT NOT NULL,
 year INTEGER NOT NULL,
 amount_paid REAL DEFAULT 0,
 balance REAL DEFAULT 0,
 reference TEXT,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ba_announcements (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 title TEXT NOT NULL,
 body TEXT NOT NULL,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ba_content (
 key TEXT PRIMARY KEY,
 value TEXT NOT NULL,
 updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ba_admissions (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 child_name TEXT NOT NULL,
 class_applied TEXT,
 parent_name TEXT,
 phone TEXT,
 email TEXT,
 message TEXT,
 status TEXT DEFAULT 'Pending',
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ba_messages (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT,
 email TEXT,
 phone TEXT,
 message TEXT NOT NULL,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ba_sessions (
 token_hash TEXT PRIMARY KEY,
 expires INTEGER NOT NULL
);
`;

const reply = (data, status = 200, headers = {}) =>
 new Response(JSON.stringify(data), {
  status,
  headers: {
   'content-type': 'application/json; charset=utf-8',
   'cache-control': 'no-store',
   ...headers
  }
 });

const error = (message, status = 400) =>
 reply({ error: message }, status);

const s = (value, limit = 4000) =>
 String(value ?? '').trim().slice(0, limit);

const n = value =>
 Number.isFinite(Number(value)) ? Number(value) : 0;

async function hash(value) {
 const bytes = await crypto.subtle.digest(
  'SHA-256',
  new TextEncoder().encode(value)
 );

 return [...new Uint8Array(bytes)]
  .map(x => x.toString(16).padStart(2, '0'))
  .join('');
}

async function sign(value, secret) {
 const key = await crypto.subtle.importKey(
  'raw',
  new TextEncoder().encode(secret),
  { name: 'HMAC', hash: 'SHA-256' },
  false,
  ['sign']
 );

 const bytes = await crypto.subtle.sign(
  'HMAC',
  key,
  new TextEncoder().encode(value)
 );

 return [...new Uint8Array(bytes)]
  .map(x => x.toString(16).padStart(2, '0'))
  .join('');
}

function token(request) {
 const cookies = request.headers.get('Cookie') || '';

 const item = cookies.split(';')
  .map(x => x.trim())
  .find(x => x.startsWith(COOKIE + '='));

 if (!item) return '';

 try {
  return decodeURIComponent(item.slice(COOKIE.length + 1));
 } catch {
  return '';
 }
}

async function auth(request, env) {
 if (!env.SESSION_SECRET || !env.DB) return false;

 const parts = token(request).split('.');
 if (parts.length !== 2) return false;

 const [sessionToken, signature] = parts;
 const expected = await sign(sessionToken, env.SESSION_SECRET);

 if (signature !== expected) return false;

 const session = await env.DB.prepare(
  'SELECT expires FROM ba_sessions WHERE token_hash = ?'
 ).bind(await hash(sessionToken)).first();

 return !!session && session.expires > Date.now() / 1000;
}

async function body(request) {
 try {
  return await request.json();
 } catch {
  throw new Error('Invalid JSON form data.');
 }
}

async function rows(db, sql, ...params) {
 const result = await db.prepare(sql).bind(...params).all();
 return result.results || [];
}

async function exists(db, table, id) {
 const allowed = [
  'ba_students',
  'ba_subjects',
  'ba_marks',
  'ba_fees',
  'ba_announcements',
  'ba_admissions',
  'ba_messages'
 ];

 if (!allowed.includes(table)) return false;

 return !!await db.prepare(
  `SELECT id FROM ${table} WHERE id = ?`
 ).bind(id).first();
}

function cookie(value, maxAge) {
 return `${COOKIE}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}
export async function onRequest({ request, env }) {
 if (!env.DB) {
  return error('Cloudflare D1 database binding DB is missing.', 500);
 }

 try {
  const statements = schema
   .split(';')
   .map(statement => statement.trim())
   .filter(Boolean);

  for (const statement of statements) {
   await env.DB.prepare(statement).run();
  }

  const url = new URL(request.url);
  const path = url.pathname
   .replace(/^\/api\/?/, '')
   .replace(/\/$/, '');

  const method = request.method;

  const idMatch = path.match(/^([a-z-]+)\/(\d+)$/);
  const resource = idMatch ? idMatch[1] : path;
  const id = idMatch ? Number(idMatch[2]) : 0;

  // HEALTH CHECK
  if (path === 'health' && method === 'GET') {
   return reply({ ok: true });
  }

  // ADMIN LOGIN
  if (path === 'login' && method === 'POST') {
   if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) {
    return error(
     'Admin password or session secret is not configured.',
     503
    );
   }

   const b = await body(request);

   if (
    s(b.email, 250).toLowerCase() !== ADMIN_EMAIL ||
    s(b.password, 500) !== env.ADMIN_PASSWORD
   ) {
    return error('Email or password is incorrect.', 401);
   }

   const sessionToken = crypto.randomUUID() + crypto.randomUUID();
   const expires = Math.floor(Date.now() / 1000) + 28800;

   await env.DB.prepare(
    'INSERT INTO ba_sessions(token_hash, expires) VALUES(?, ?)'
   ).bind(await hash(sessionToken), expires).run();

   const signature = await sign(sessionToken, env.SESSION_SECRET);

   return reply(
    { ok: true },
    200,
    {
     'set-cookie': cookie(
      encodeURIComponent(sessionToken + '.' + signature),
      28800
     )
    }
   );
  }

  // ADMIN LOGOUT
  if (path === 'logout' && method === 'POST') {
   const sessionToken = token(request).split('.')[0];

   if (sessionToken) {
    await env.DB.prepare(
     'DELETE FROM ba_sessions WHERE token_hash = ?'
    ).bind(await hash(sessionToken)).run();
   }

   return reply(
    { ok: true },
    200,
    { 'set-cookie': cookie('', 0) }
   );
                              }
  // PUBLIC ADMISSION FORM
  if (path === 'admissions' && method === 'POST') {
   const b = await body(request);

   if (!s(b.child_name)) {
    return error('Child name is required.');
   }

   const result = await env.DB.prepare(`
    INSERT INTO ba_admissions
    (child_name, class_applied, parent_name, phone, email, message)
    VALUES (?, ?, ?, ?, ?, ?)
   `).bind(
    s(b.child_name, 200),
    s(b.class_applied, 80),
    s(b.parent_name, 200),
    s(b.phone, 80),
    s(b.email, 250),
    s(b.message)
   ).run();

   return reply(
    { ok: true, id: result.meta.last_row_id },
    201
   );
  }

  // PUBLIC CONTACT FORM
  if (path === 'messages' && method === 'POST') {
   const b = await body(request);

   if (!s(b.message)) {
    return error('Message is required.');
   }

   const result = await env.DB.prepare(`
    INSERT INTO ba_messages (name, email, phone, message)
    VALUES (?, ?, ?, ?)
   `).bind(
    s(b.name, 200),
    s(b.email, 250),
    s(b.phone, 80),
    s(b.message)
   ).run();

   return reply(
    { ok: true, id: result.meta.last_row_id },
    201
   );
  }

  // PUBLIC ANNOUNCEMENTS
  if (path === 'announcements' && method === 'GET') {
   return reply({
    data: await rows(
     env.DB,
     'SELECT * FROM ba_announcements ORDER BY id DESC'
    )
   });
  }

  // PUBLIC WEBSITE CONTENT
  if (path === 'content' && method === 'GET') {
   return reply({
    data: await rows(
     env.DB,
     'SELECT * FROM ba_content ORDER BY key'
    )
   });
  }

  // CHECK ADMIN SESSION
  if (path === 'data' && method === 'GET') {
   return await auth(request, env)
    ? reply({ ok: true })
    : error('Please sign in.', 401);
  }

  // PROTECT ALL ADMIN ROUTES BELOW THIS LINE
  if (!await auth(request, env)) {
   return error(
    'Please sign in to use the admin dashboard.',
    401
   );
  }
  // STUDENTS: LIST
  if (resource === 'students' && method === 'GET' && !id) {
   return reply({
    data: await rows(
     env.DB,
     'SELECT * FROM ba_students ORDER BY class_name, name'
    )
   });
  }

  // STUDENTS: ADD
  if (resource === 'students' && method === 'POST' && !id) {
   const b = await body(request);
   const name = s(b.name, 200);
   const className = s(b.class ?? b.class_name, 80);
   const admission = s(b.admission_number ?? b.admission_no, 80);

   if (!name || !className) {
    return error('Student name and class are required.');
   }

   const result = await env.DB.prepare(`
    INSERT INTO ba_students
    (admission_number, name, class_name, gender, guardian, phone)
    VALUES (?, ?, ?, ?, ?, ?)
   `).bind(
    admission || null,
    name,
    className,
    s(b.gender, 30),
    s(b.guardian, 200),
    s(b.phone, 80)
   ).run();

   return reply({ ok: true, id: result.meta.last_row_id }, 201);
  }

  // STUDENTS: EDIT
  if (resource === 'students' && method === 'PUT' && id) {
   const b = await body(request);

   if (!await exists(env.DB, 'ba_students', id)) {
    return error('Student not found.', 404);
   }

   const name = s(b.name, 200);
   const className = s(b.class ?? b.class_name, 80);
   const admission = s(b.admission_number ?? b.admission_no, 80);

   if (!name || !className) {
    return error('Student name and class are required.');
   }

   await env.DB.prepare(`
    UPDATE ba_students SET
    admission_number = ?, name = ?, class_name = ?,
    gender = ?, guardian = ?, phone = ?
    WHERE id = ?
   `).bind(
    admission || null,
    name,
    className,
    s(b.gender, 30),
    s(b.guardian, 200),
    s(b.phone, 80),
    id
   ).run();

   return reply({ ok: true });
  }

  // STUDENTS: DELETE
  if (resource === 'students' && method === 'DELETE' && id) {
   if (!await exists(env.DB, 'ba_students', id)) {
    return error('Student not found.', 404);
   }

   await env.DB.batch([
    env.DB.prepare(
     'DELETE FROM ba_marks WHERE student_id = ?'
    ).bind(id),

    env.DB.prepare(
     'DELETE FROM ba_fees WHERE student_id = ?'
    ).bind(id),

    env.DB.prepare(
     'DELETE FROM ba_students WHERE id = ?'
    ).bind(id)
   ]);

   return reply({ ok: true });
  }
  // SUBJECTS: LIST
  if (resource === 'subjects' && method === 'GET' && !id) {
   return reply({
    data: await rows(
     env.DB,
     'SELECT * FROM ba_subjects ORDER BY class_name, name'
    )
   });
  }

  // SUBJECTS: ADD
  if (resource === 'subjects' && method === 'POST' && !id) {
   const b = await body(request);
   const name = s(b.name, 120);
   const className = s(b.class ?? b.class_name, 80);

   if (!name || !className) {
    return error('Subject and class are required.');
   }

   const result = await env.DB.prepare(
    'INSERT INTO ba_subjects (name, class_name) VALUES (?, ?)'
   ).bind(name, className).run();

   return reply({ ok: true, id: result.meta.last_row_id }, 201);
  }

  // SUBJECTS: EDIT
  if (resource === 'subjects' && method === 'PUT' && id) {
   const b = await body(request);

   if (!await exists(env.DB, 'ba_subjects', id)) {
    return error('Subject not found.', 404);
   }

   const name = s(b.name, 120);
   const className = s(b.class ?? b.class_name, 80);

   if (!name || !className) {
    return error('Subject and class are required.');
   }

   await env.DB.prepare(
    'UPDATE ba_subjects SET name = ?, class_name = ? WHERE id = ?'
   ).bind(name, className, id).run();

   return reply({ ok: true });
  }

  // SUBJECTS: DELETE
  if (resource === 'subjects' && method === 'DELETE' && id) {
   if (!await exists(env.DB, 'ba_subjects', id)) {
    return error('Subject not found.', 404);
   }

   await env.DB.prepare(
    'DELETE FROM ba_subjects WHERE id = ?'
   ).bind(id).run();

   return reply({ ok: true });
  }
  // MARKS: LIST
  if (resource === 'marks' && method === 'GET') {
   const studentId = n(url.searchParams.get('student_id'));
   const term = s(url.searchParams.get('term'), 30);
   const year = n(url.searchParams.get('year'));

   let sql = `
    SELECT m.*, st.name AS student_name,
           st.admission_number, st.class_name,
           su.name AS subject_name
    FROM ba_marks m
    JOIN ba_students st ON st.id = m.student_id
    JOIN ba_subjects su ON su.id = m.subject_id
    WHERE 1 = 1
   `;
   const params = [];

   if (studentId) {
    sql += ' AND m.student_id = ?';
    params.push(studentId);
   }

   if (term) {
    sql += ' AND m.term = ?';
    params.push(term);
   }

   if (year) {
    sql += ' AND m.year = ?';
    params.push(year);
   }

   sql += ' ORDER BY st.class_name, st.name, su.name';

   return reply({ data: await rows(env.DB, sql, ...params) });
  }

  // MARKS: ADD
  if (resource === 'marks' && method === 'POST' && !id) {
   const b = await body(request);
   const studentId = n(b.student_id);
   const subjectId = n(b.subject_id);
   const term = s(b.term, 30);
   const year = n(b.year);
   const score = n(b.score ?? b.marks);
   const outOf = n(b.out_of ?? 100);

   if (!studentId || !subjectId || !term || !year) {
    return error('Student, subject, term and year are required.');
   }

   if (score < 0 || outOf <= 0 || score > outOf) {
    return error('Score must be between zero and the maximum mark.');
   }

   if (
    !await exists(env.DB, 'ba_students', studentId) ||
    !await exists(env.DB, 'ba_subjects', subjectId)
   ) {
    return error('Student or subject was not found.', 404);
   }

   const result = await env.DB.prepare(`
    INSERT INTO ba_marks
    (student_id, subject_id, term, year, score, out_of, comment)
    VALUES (?, ?, ?, ?, ?, ?, ?)
   `).bind(
    studentId,
    subjectId,
    term,
    year,
    score,
    outOf,
    s(b.comment, 500)
   ).run();

   return reply({ ok: true, id: result.meta.last_row_id }, 201);
  }

  // MARKS: EDIT
  if (resource === 'marks' && method === 'PUT' && id) {
   const b = await body(request);

   if (!await exists(env.DB, 'ba_marks', id)) {
    return error('Mark record not found.', 404);
   }

   const studentId = n(b.student_id);
   const subjectId = n(b.subject_id);
   const term = s(b.term, 30);
   const year = n(b.year);
   const score = n(b.score ?? b.marks);
   const outOf = n(b.out_of ?? 100);

   if (!studentId || !subjectId || !term || !year) {
    return error('Student, subject, term and year are required.');
   }

   if (score < 0 || outOf <= 0 || score > outOf) {
    return error('Score must be between zero and the maximum mark.');
   }

   if (
    !await exists(env.DB, 'ba_students', studentId) ||
    !await exists(env.DB, 'ba_subjects', subjectId)
   ) {
    return error('Student or subject was not found.', 404);
   }

   await env.DB.prepare(`
    UPDATE ba_marks SET
    student_id = ?, subject_id = ?, term = ?, year = ?,
    score = ?, out_of = ?, comment = ?
    WHERE id = ?
   `).bind(
    studentId,
    subjectId,
    term,
    year,
    score,
    outOf,
    s(b.comment, 500),
    id
   ).run();

   return reply({ ok: true });
  }

  // MARKS: DELETE
  if (resource === 'marks' && method === 'DELETE' && id) {
   if (!await exists(env.DB, 'ba_marks', id)) {
    return error('Mark record not found.', 404);
   }

   await env.DB.prepare(
    'DELETE FROM ba_marks WHERE id = ?'
   ).bind(id).run();

   return reply({ ok: true });
  }

  // REPORT CARD DATA
  if (resource === 'report-cards' && method === 'GET') {
   const studentId = n(url.searchParams.get('student_id'));
   const term = s(url.searchParams.get('term'), 30);
   const year = n(url.searchParams.get('year'));

   if (!studentId || !term || !year) {
    return error('Student, term and year are required.');
   }

   const student = await env.DB.prepare(
    'SELECT * FROM ba_students WHERE id = ?'
   ).bind(studentId).first();

   if (!student) {
    return error('Student not found.', 404);
   }

   const marks = await rows(env.DB, `
    SELECT m.*, su.name AS subject_name
    FROM ba_marks m
    JOIN ba_subjects su ON su.id = m.subject_id
    WHERE m.student_id = ? AND m.term = ? AND m.year = ?
    ORDER BY su.name
   `, studentId, term, year);

   const totalScore = marks.reduce(
    (sum, item) => sum + Number(item.score || 0), 0
   );

   const totalOutOf = marks.reduce(
    (sum, item) => sum + Number(item.out_of || 0), 0
   );

   return reply({
    student,
    marks,
    total_score: totalScore,
    total_out_of: totalOutOf,
    percentage: totalOutOf
     ? Math.round((totalScore / totalOutOf) * 10000) / 100
     : 0
   });
  }
  // FEES: LIST
  if (resource === 'fees' && method === 'GET') {
   const studentId = n(url.searchParams.get('student_id'));
   const term = s(url.searchParams.get('term'), 30);
   const year = n(url.searchParams.get('year'));

   let sql = `
    SELECT f.*, st.name AS student_name,
           st.admission_number, st.class_name
    FROM ba_fees f
    JOIN ba_students st ON st.id = f.student_id
    WHERE 1 = 1
   `;
   const params = [];

   if (studentId) {
    sql += ' AND f.student_id = ?';
    params.push(studentId);
   }

   if (term) {
    sql += ' AND f.term = ?';
    params.push(term);
   }

   if (year) {
    sql += ' AND f.year = ?';
    params.push(year);
   }

   sql += ' ORDER BY st.class_name, st.name';

   return reply({ data: await rows(env.DB, sql, ...params) });
  }

  // FEES: ADD
  if (resource === 'fees' && method === 'POST' && !id) {
   const b = await body(request);
   const studentId = n(b.student_id);
   const term = s(b.term, 30);
   const year = n(b.year);
   const amountPaid = n(b.amount_paid);
   const balance = n(b.balance);

   if (!studentId || !term || !year) {
    return error('Student, term and year are required.');
   }

   if (amountPaid < 0 || balance < 0) {
    return error('Fees amounts cannot be negative.');
   }

   if (!await exists(env.DB, 'ba_students', studentId)) {
    return error('Student not found.', 404);
   }

   const result = await env.DB.prepare(`
    INSERT INTO ba_fees
    (student_id, term, year, amount_paid, balance, reference)
    VALUES (?, ?, ?, ?, ?, ?)
   `).bind(
    studentId,
    term,
    year,
    amountPaid,
    balance,
    s(b.reference, 150)
   ).run();

   return reply({ ok: true, id: result.meta.last_row_id }, 201);
  }

  // FEES: EDIT
  if (resource === 'fees' && method === 'PUT' && id) {
   const b = await body(request);

   if (!await exists(env.DB, 'ba_fees', id)) {
    return error('Fee record not found.', 404);
   }

   const studentId = n(b.student_id);
   const term = s(b.term, 30);
   const year = n(b.year);
   const amountPaid = n(b.amount_paid);
   const balance = n(b.balance);

   if (!studentId || !term || !year) {
    return error('Student, term and year are required.');
   }

   if (amountPaid < 0 || balance < 0) {
    return error('Fees amounts cannot be negative.');
   }

   if (!await exists(env.DB, 'ba_students', studentId)) {
    return error('Student not found.', 404);
   }

   await env.DB.prepare(`
    UPDATE ba_fees SET
    student_id = ?, term = ?, year = ?,
    amount_paid = ?, balance = ?, reference = ?
    WHERE id = ?
   `).bind(
    studentId,
    term,
    year,
    amountPaid,
    balance,
    s(b.reference, 150),
    id
   ).run();

   return reply({ ok: true });
  }

  // FEES: DELETE
  if (resource === 'fees' && method === 'DELETE' && id) {
   if (!await exists(env.DB, 'ba_fees', id)) {
    return error('Fee record not found.', 404);
   }

   await env.DB.prepare(
    'DELETE FROM ba_fees WHERE id = ?'
   ).bind(id).run();

   return reply({ ok: true });
  }

  // ANNOUNCEMENTS: ADD
  if (resource === 'announcements' && method === 'POST') {
   const b = await body(request);
   const title = s(b.title, 200);
   const message = s(b.body ?? b.message);

   if (!title || !message) {
    return error('Announcement title and message are required.');
   }

   const result = await env.DB.prepare(`
    INSERT INTO ba_announcements (title, body)
    VALUES (?, ?)
   `).bind(title, message).run();

   return reply({ ok: true, id: result.meta.last_row_id }, 201);
  }

  // ANNOUNCEMENTS: DELETE
  if (resource === 'announcements' && method === 'DELETE' && id) {
   if (!await exists(env.DB, 'ba_announcements', id)) {
    return error('Announcement not found.', 404);
   }

   await env.DB.prepare(
    'DELETE FROM ba_announcements WHERE id = ?'
   ).bind(id).run();

   return reply({ ok: true });
  }

  // WEBSITE CONTENT: UPDATE OR CREATE
  if (resource === 'content' && method === 'PUT') {
   const b = await body(request);
   const key = s(b.key, 150);

   if (!key || b.value === undefined || b.value === null) {
    return error('Content key and value are required.');
   }

   await env.DB.prepare(`
    INSERT INTO ba_content (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET
    value = excluded.value,
    updated_at = CURRENT_TIMESTAMP
   `).bind(key, String(b.value).slice(0, 10000)).run();

   return reply({ ok: true });
  }

  // CONTACT MESSAGES: ADMIN LIST
  if (resource === 'messages' && method === 'GET') {
   return reply({
    data: await rows(
     env.DB,
     'SELECT * FROM ba_messages ORDER BY id DESC'
    )
   });
  }

  // ADMISSIONS: ADMIN LIST
  if (resource === 'admissions' && method === 'GET') {
   return reply({
    data: await rows(
     env.DB,
     'SELECT * FROM ba_admissions ORDER BY id DESC'
    )
   });
  }

  // ADMISSIONS: UPDATE STATUS
  if (resource === 'admissions' && method === 'PUT' && id) {
   const b = await body(request);

   if (!await exists(env.DB, 'ba_admissions', id)) {
    return error('Admission application not found.', 404);
   }

   const status = s(b.status, 40);

   if (!status) {
    return error('Application status is required.');
   }

   await env.DB.prepare(
    'UPDATE ba_admissions SET status = ? WHERE id = ?'
   ).bind(status, id).run();

   return reply({ ok: true });
    }
  // DELETE CONTACT MESSAGE
  if (resource === 'messages' && method === 'DELETE' && id) {
   if (!await exists(env.DB, 'ba_messages', id)) {
    return error('Message not found.', 404);
   }

   await env.DB.prepare(
    'DELETE FROM ba_messages WHERE id = ?'
   ).bind(id).run();

   return reply({ ok: true });
  }

  // DELETE ADMISSION APPLICATION
  if (resource === 'admissions' && method === 'DELETE' && id) {
   if (!await exists(env.DB, 'ba_admissions', id)) {
    return error('Admission application not found.', 404);
   }

   await env.DB.prepare(
    'DELETE FROM ba_admissions WHERE id = ?'
   ).bind(id).run();

   return reply({ ok: true });
  }

  // UNKNOWN API ROUTE
  return error('API route not found.', 404);

 } catch (err) {
  console.error('Bright Angels API error:', err);

  if (err?.message?.includes('UNIQUE constraint failed')) {
   return error(
    'This record already exists. Check for duplicate admission numbers or subjects.',
    409
   );
  }

  if (err?.message?.includes('NOT NULL constraint failed')) {
   return error('A required field is missing.', 400);
  }

  return error('The server encountered an error. Check the deployment logs.', 500);
 }
}
