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

async function hash(text) {
 const bytes = await crypto.subtle.digest(
  'SHA-256',
  new TextEncoder().encode(text)
 );

 return [...new Uint8Array(bytes)]
  .map(x => x.toString(16).padStart(2, '0'))
  .join('');
}

async function sign(text, secret) {
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
  new TextEncoder().encode(text)
 );

 return [...new Uint8Array(bytes)]
  .map(x => x.toString(16).padStart(2, '0'))
  .join('');
}

function token(request) {
 const cookies = request.headers.get('Cookie') || '';

 const value = cookies
  .split(';')
  .map(x => x.trim())
  .find(x => x.startsWith(COOKIE + '='));

 return value
  ? decodeURIComponent(value.slice(COOKIE.length + 1))
  : '';
}

async function auth(request, env) {
 const parts = token(request).split('.');

 if (parts.length !== 2 || !env.SESSION_SECRET) {
  return false;
 }

 const [sessionToken, signature] = parts;

 if (await sign(sessionToken, env.SESSION_SECRET) !== signature) {
  return false;
 }

 const session = await env.DB
  .prepare('SELECT expires FROM ba_sessions WHERE token_hash = ?')
  .bind(await hash(sessionToken))
  .first();

 return !!session && session.expires > Date.now() / 1000;
}

async function body(request) {
 try {
  return await request.json();
 } catch {
  throw new Error('Invalid form data.');
 }
}

async function rows(db, sql, ...params) {
 const result = await db.prepare(sql).bind(...params).all();
 return result.results || [];
}
export async function onRequest({ request, env }) {
  if (!env.DB) {
    return error(
      'D1 binding DB is missing. Bind your database as DB and redeploy.',
      500
    );
  }

  try {
    await env.DB.exec(schema);
  } catch (e) {
    return error('Database setup failed: ' + e.message, 500);
  }

  const url = new URL(request.url);
  const path = url.pathname
    .replace(/^\/api\/?/, '')
    .replace(/\/$/, '');
  const method = request.method;

  try {
    if (path === 'health' && method === 'GET') {
      return reply({ ok: true });
    }

    // ADMIN LOGIN
    if (path === 'login' && method === 'POST') {
      if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) {
        return error(
          'Set ADMIN_PASSWORD and SESSION_SECRET in Cloudflare Pages Secrets.',
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
      )
        .bind(await hash(sessionToken), expires)
        .run();

      const signature = await sign(sessionToken, env.SESSION_SECRET);

      return reply(
        { ok: true },
        200,
        {
          'set-cookie':
            `${COOKIE}=${encodeURIComponent(sessionToken + '.' + signature)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=28800`
        }
      );
    }

    // ADMIN LOGOUT
    if (path === 'logout' && method === 'POST') {
      const sessionToken = token(request).split('.')[0];

      if (sessionToken) {
        await env.DB.prepare(
          'DELETE FROM ba_sessions WHERE token_hash = ?'
        )
          .bind(await hash(sessionToken))
          .run();
      }

      return reply(
        { ok: true },
        200,
        {
          'set-cookie':
            `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`
        }
      );
    }

    // PUBLIC ADMISSION FORM
    if (path === 'admissions' && method === 'POST') {
      const b = await body(request);

      if (!s(b.child_name)) {
        return error('Child name is required.');
      }

      const result = await env.DB.prepare(
        `INSERT INTO ba_admissions
        (child_name, class_applied, parent_name, phone, email, message)
        VALUES (?, ?, ?, ?, ?, ?)`
      )
        .bind(
          s(b.child_name, 200),
          s(b.class_applied, 80),
          s(b.parent_name, 200),
          s(b.phone, 80),
          s(b.email, 250),
          s(b.message)
        )
        .run();

      return reply({ ok: true, id: result.meta.last_row_id }, 201);
    }

    // PUBLIC CONTACT FORM
    if (path === 'messages' && method === 'POST') {
      const b = await body(request);

      if (!s(b.message)) {
        return error('Message is required.');
      }

      const result = await env.DB.prepare(
        `INSERT INTO ba_messages (name, email, phone, message)
         VALUES (?, ?, ?, ?)`
      )
        .bind(
          s(b.name, 200),
          s(b.email, 250),
          s(b.phone, 80),
          s(b.message)
        )
        .run();

      return reply({ ok: true, id: result.meta.last_row_id }, 201);
    }

    // PUBLIC ANNOUNCEMENTS AND WEBSITE CONTENT
    if (path === 'announcements' && method === 'GET') {
      return reply({
        data: await rows(
          env.DB,
          'SELECT * FROM ba_announcements ORDER BY id DESC'
        )
      });
    }

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

    // PROTECT ALL REMAINING ADMIN ROUTES
    if (!(await auth(request, env))) {
      return error('Please sign in to use the admin dashboard.', 401);
    }

    // STUDENTS
    if (path === 'students' && method === 'GET') {
      return reply({
        data: await rows(
          env.DB,
          'SELECT * FROM ba_students ORDER BY class_name, name'
        )
      });
    }

    if (path === 'students' && method === 'POST') {
      const b = await body(request);

      if (!s(b.name) || !s(b.class)) {
        return error('Student name and class are required.');
      }

      const result = await env.DB.prepare(
        `INSERT INTO ba_students
        (admission_number, name, class_name, gender, guardian, phone)
        VALUES (?, ?, ?, ?, ?, ?)`
      )
        .bind(
          s(b.admission_number, 80) || null,
          s(b.name, 200),
          s(b.class, 80),
          s(b.gender, 30),
          s(b.guardian, 200),
          s(b.phone, 80)
        )
        .run();

      return reply({ ok: true, id: result.meta.last_row_id }, 201);
    }

    // SUBJECTS
    if (path === 'subjects' && method === 'GET') {
      return reply({
        data: await rows(
          env.DB,
          'SELECT * FROM ba_subjects ORDER BY class_name, name'
        )
      });
    }

    if (path === 'subjects' && method === 'POST') {
      const b = await body(request);

      if (!s(b.name) || !s(b.class)) {
        return error('Subject and class are required.');
      }

      const result = await env.DB.prepare(
        'INSERT INTO ba_subjects (name, class_name) VALUES (?, ?)'
      )
        .bind(s(b.name, 120), s(b.class, 80))
        .run();

      return reply({ ok: true, id: result.meta.last_row_id }, 201);
    }

    // MARKS
    if (path === 'marks' && method === 'GET') {
      return reply({
        data: await rows(
          env.DB,
          `SELECT m.*, s.name AS student_name,
          s.class_name AS student_class, u.name AS subject_name
          FROM ba_marks m
          LEFT JOIN ba_students s ON s.id = m.student_id
          LEFT JOIN ba_subjects u ON u.id = m.subject_id
          ORDER BY m.id DESC`
        )
      });
    }

    if (path === 'marks' && method === 'POST') {
      const b = await body(request);
      const score = n(b.score);
      const outOf = n(b.out_of);

      if (
        !n(b.student_id) ||
        !n(b.subject_id) ||
        !s(b.term) ||
        outOf <= 0 ||
        score < 0 ||
        score > outOf
      ) {
        return error(
          'Choose a student, subject and term, and enter a valid score.'
        );
      }

      const result = await env.DB.prepare(
        `INSERT INTO ba_marks
        (student_id, subject_id, term, year, score, out_of, comment)
        VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          n(b.student_id),
          n(b.subject_id),
          s(b.term, 40),
          n(b.year) || new Date().getFullYear(),
          score,
          outOf,
          s(b.comment, 1000)
        )
        .run();

      return reply({ ok: true, id: result.meta.last_row_id }, 201);
    }

    // FEES, INCLUDING STUDENT CLASS
    if (path === 'fees' && method === 'GET') {
      return reply({
        data: await rows(
          env.DB,
          `SELECT f.*, s.name AS student_name,
          s.class_name AS student_class,
          s.admission_number
          FROM ba_fees f
          LEFT JOIN ba_students s ON s.id = f.student_id
          ORDER BY f.id DESC`
        )
      });
    }

    if (path === 'fees' && method === 'POST') {
      const b = await body(request);

      if (!n(b.student_id) || !s(b.term)) {
        return error('Choose a student and term.');
      }

      const result = await env.DB.prepare(
        `INSERT INTO ba_fees
        (student_id, term, year, amount_paid, balance, reference)
        VALUES (?, ?, ?, ?, ?, ?)`
      )
        .bind(
          n(b.student_id),
          s(b.term, 40),
          n(b.year) || new Date().getFullYear(),
          Math.max(0, n(b.amount_paid)),
          Math.max(0, n(b.balance)),
          s(b.reference, 120)
        )
        .run();

      return reply({ ok: true, id: result.meta.last_row_id }, 201);
    }

    // ANNOUNCEMENTS
    if (path === 'announcements' && method === 'POST') {
      const b = await body(request);

      if (!s(b.title) || !s(b.body)) {
        return error('Title and message are required.');
      }

      const result = await env.DB.prepare(
        'INSERT INTO ba_announcements (title, body) VALUES (?, ?)'
      )
        .bind(s(b.title, 200), s(b.body))
        .run();

      return reply({ ok: true, id: result.meta.last_row_id }, 201);
    }

    // EDITABLE WEBSITE CONTENT
    if (path === 'content' && method === 'PUT') {
      const b = await body(request);

      if (!s(b.key, 100)) {
        return error('Content key is required.');
      }

      await env.DB.prepare(
        `INSERT INTO ba_content (key, value, updated_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = CURRENT_TIMESTAMP`
      )
        .bind(s(b.key, 100), s(b.value))
        .run();

      return reply({ ok: true });
    }

    // VIEW ADMISSION APPLICATIONS
    if (path === 'admissions' && method === 'GET') {
      return reply({
        data: await rows(
          env.DB,
          'SELECT * FROM ba_admissions ORDER BY id DESC'
        )
      });
    }

    // VIEW CONTACT MESSAGES
    if (path === 'messages' && method === 'GET') {
      return reply({
        data: await rows(
          env.DB,
          'SELECT * FROM ba_messages ORDER BY id DESC'
        )
      });
    }

    // REPORT CARDS
    if (path === 'report-cards' && method === 'GET') {
      const studentId = n(url.searchParams.get('student_id'));
      const term = s(url.searchParams.get('term'), 40);
      const year = n(url.searchParams.get('year'));

      const student = await env.DB.prepare(
        'SELECT * FROM ba_students WHERE id = ?'
      )
        .bind(studentId)
        .first();

      if (!student) {
        return error('Student not found.', 404);
      }

      const marks = await rows(
        env.DB,
        `SELECT m.*, u.name AS subject_name
         FROM ba_marks m
         LEFT JOIN ba_subjects u ON u.id = m.subject_id
         WHERE m.student_id = ? AND m.term = ? AND m.year = ?`,
        studentId,
        term,
        year
      );

      const total = marks.reduce(
        (sum, mark) => sum + Number(mark.score),
        0
      );

      const possible = marks.reduce(
        (sum, mark) => sum + Number(mark.out_of),
        0
      );

      const average = possible
        ? Math.round((total / possible) * 10000) / 100
        : 0;

      const grade =
        average >= 80 ? 'A' :
        average >= 70 ? 'B' :
        average >= 60 ? 'C' :
        average >= 50 ? 'D' : 'E';

      return reply({
        data: {
          student,
          term,
          year,
          marks,
          total,
          possible,
          average,
          grade
        }
      });
    }

    return error('Unknown API route: ' + path, 404);
  } catch (e) {
    return error(e.message || 'Server error', 500);
  }
   }
