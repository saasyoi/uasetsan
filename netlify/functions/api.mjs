import { neon } from '@neondatabase/serverless';

function response(body, status = 200) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body)
  };
}

function getSql() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL belum diatur di Netlify.');
  return neon(process.env.DATABASE_URL);
}

function parts(event) {
  return (event.path || '')
    .replace(/^\/\.netlify\/functions\/api\/?/, '')
    .replace(/^\/api\/?/, '')
    .split('/')
    .filter(Boolean)
    .map(decodeURIComponent);
}

function body(event) {
  return event.body ? JSON.parse(event.body) : {};
}

async function setup(sql) {
  await sql.query("CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, identity_mode TEXT NOT NULL, reporter_name TEXT NOT NULL, contact TEXT NOT NULL, reporter_level TEXT NOT NULL, category TEXT NOT NULL, subject TEXT NOT NULL, location TEXT NOT NULL, incident_date DATE NOT NULL, urgency TEXT NOT NULL, description TEXT NOT NULL, evidence TEXT NOT NULL DEFAULT '-', status TEXT NOT NULL DEFAULT 'Baru', feedback TEXT NOT NULL DEFAULT 'Aduan sudah masuk dan menunggu verifikasi polisi taruna.', history JSONB NOT NULL DEFAULT '[]'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await sql.query("CREATE TABLE IF NOT EXISTS mentor_notes (id BIGSERIAL PRIMARY KEY, report_id TEXT NOT NULL, note TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  // var count = await sql.query('SELECT COUNT(*)::int AS count FROM reports');
  // if (count[0].count === 0) { ... }
}

function mapReport(row, reveal = true) {
  return {
    id: row.id,
    identityMode: row.identity_mode,
    reporterName: reveal ? row.reporter_name : (row.identity_mode === 'anonymous' ? 'Anonim' : 'Beridentitas'),
    contact: reveal ? row.contact : '-',
    reporterLevel: row.reporter_level,
    category: row.category,
    subject: row.subject,
    location: row.location,
    incidentDate: String(row.incident_date).slice(0, 10),
    urgency: row.urgency,
    description: row.description,
    evidence: row.evidence,
    status: row.status,
    feedback: row.feedback,
    history: Array.isArray(row.history) ? row.history : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapNote(row) {
  return { id: row.id, reportId: row.report_id, text: row.note, createdAt: row.created_at };
}

function makeCode() {
  var d = new Date();
  return 'ASP-' + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '-' + Math.floor(1000 + Math.random() * 9000);
}

export async function handler(event) {
  try {
    var sql = getSql();
    await setup(sql);
    var p = parts(event);
    var method = event.httpMethod;
    if (method === 'GET' && p[0] === 'health') return response({ ok: true });
    if (method === 'GET' && p[0] === 'reports' && p.length === 1) {
      var rows = await sql.query('SELECT * FROM reports ORDER BY updated_at DESC');
      return response({ reports: rows.map(function(row) { return mapReport(row, true); }) });
    }
    if (method === 'GET' && p[0] === 'reports' && p[1]) {
      var one = await sql.query('SELECT * FROM reports WHERE id = $1', [p[1]]);
      if (one.length === 0) return response({ error: 'Kode aduan tidak ditemukan.' }, 404);
      return response({ report: mapReport(one[0], false) });
    }
    if (method === 'POST' && p[0] === 'reports') {
      var data = body(event);
      var now = new Date().toISOString();
      var id = makeCode();
      var history = [{ title: 'Aduan diterima', body: 'Laporan berhasil dicatat oleh sistem.', at: now }];
      var reporterName = data.identityMode === 'identified' ? data.reporterName : 'Anonim';
      var contact = data.identityMode === 'identified' ? data.contact : '-';
      var inserted = await sql.query('INSERT INTO reports (id, identity_mode, reporter_name, contact, reporter_level, category, subject, location, incident_date, urgency, description, evidence, status, feedback, history, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$17) RETURNING *', [id, data.identityMode || 'anonymous', reporterName, contact, data.reporterLevel, data.category, data.subject, data.location, data.incidentDate, data.urgency, data.description, data.evidence || '-', 'Baru', 'Aduan sudah masuk dan menunggu verifikasi polisi taruna.', JSON.stringify(history), now, now]);
      return response({ report: mapReport(inserted[0], true) }, 201);
    }
    if (method === 'PATCH' && p[0] === 'reports' && p[1]) {
      var update = body(event);
      var current = await sql.query('SELECT * FROM reports WHERE id = $1', [p[1]]);
      if (current.length === 0) return response({ error: 'Aduan tidak ditemukan.' }, 404);
      var report = mapReport(current[0], true);
      var updatedAt = new Date().toISOString();
      var note = (update.actionNote || '').trim() || ('Status diperbarui menjadi ' + update.status + '.');
      var history2 = report.history.concat([{ title: update.status, body: note, at: updatedAt }]);
      var updated = await sql.query('UPDATE reports SET status = $1, feedback = $2, history = $3::jsonb, updated_at = $4 WHERE id = $5 RETURNING *', [update.status, update.feedback || '', JSON.stringify(history2), updatedAt, p[1]]);
      return response({ report: mapReport(updated[0], true) });
    }
    if (method === 'GET' && p[0] === 'notes') {
      var notes = await sql.query('SELECT * FROM mentor_notes ORDER BY created_at DESC');
      return response({ notes: notes.map(mapNote) });
    }
    if (method === 'POST' && p[0] === 'notes') {
      var noteData = body(event);
      var saved = await sql.query('INSERT INTO mentor_notes (report_id, note) VALUES ($1,$2) RETURNING *', [noteData.reportId, noteData.text]);
      return response({ note: mapNote(saved[0]) }, 201);
    }
    return response({ error: 'Endpoint tidak ditemukan.' }, 404);
  } catch (error) {
    return response({ error: error.message || 'Terjadi kesalahan server.' }, 500);
  }
}
