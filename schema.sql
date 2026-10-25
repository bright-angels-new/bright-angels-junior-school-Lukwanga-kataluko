PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference TEXT NOT NULL UNIQUE,
  child_name TEXT NOT NULL,
  date_of_birth TEXT,
  gender TEXT,
  class_applied TEXT NOT NULL,
  previous_school TEXT,
  parent_name TEXT NOT NULL,
  relationship TEXT,
  phone TEXT NOT NULL,
  email TEXT,
  address TEXT,
  medical_notes TEXT,
  passport_data_url TEXT,
  status TEXT NOT NULL DEFAULT 'New',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  subject TEXT,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'New',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS content (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  event_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO content(key, value) VALUES
('about', 'Bright Angels Junior School is a learning community committed to helping every child grow in knowledge, confidence, character and creativity. Replace this introduction with the school''s official story from the administration dashboard.'),
('welcome', 'A place to learn, grow and shine.'),
('classes', 'Baby Class, Middle Class, Top Class, Primary 1, Primary 2, Primary 3, Primary 4 and Primary 5.'),
('admissions_note', 'Admissions enquiries are welcome. Complete the online application form and the school will contact you using the details provided.'),
('address', 'Lukwanga–Kataluko–Sentema Road, Wakiso District, Uganda.'),
('motto', 'If others can, we can.');
