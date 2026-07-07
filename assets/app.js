var storageKey = 'aspiraPembinaanReports';
var noteKey = 'aspiraPembinaanMentorNotes';
var selectedReportId = null;
var isOfflineMode = false;

function entry(title, body) {
  return {
    title: title,
    body: body,
    at: new Date().toISOString()
  };
}

var seedReports = [];

function load(key, fallback) {
  try {
    var raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

var reports = [];
var mentorNotes = [];

function saveReports() {
  localStorage.setItem(storageKey, JSON.stringify(reports));
}

function saveNotes() {
  localStorage.setItem(noteKey, JSON.stringify(mentorNotes));
}

async function loadAllData() {
  try {
    var reportsRes = await fetch('/api/reports');
    if (!reportsRes.ok) throw new Error('API error status: ' + reportsRes.status);
    var reportsData = await reportsRes.json();
    reports = reportsData.reports;
    isOfflineMode = false;
  } catch (e) {
    console.warn("Menggunakan localStorage sebagai fallback karena API error:", e);
    reports = load(storageKey, seedReports);
    isOfflineMode = true;
  }

  try {
    var notesRes = await fetch('/api/notes');
    if (!notesRes.ok) throw new Error('API error status: ' + notesRes.status);
    var notesData = await notesRes.json();
    mentorNotes = notesData.notes;
  } catch (e) {
    console.warn("Menggunakan localStorage untuk catatan mentor karena API error:", e);
    mentorNotes = load(noteKey, []);
  }
  selectedReportId = reports[0] && reports[0].id;
}

async function init() {
  var role = document.body.dataset.role;
  if (role === 'polisi' || role === 'pengasuh') guard(role);
  
  await loadAllData();
  
  renderStats();
  if (role === 'pengadu') initPengadu();
  if (role === 'polisi') initPolisi();
  if (role === 'pengasuh') initPengasuh();
}

function guard(role) {
  var pass = { polisi: 'Poltar@2026', pengasuh: 'Pengasuh@2026' }[role];
  var key = 'role-ok-' + role;
  if (sessionStorage.getItem(key) === '1') {
    showProtected();
    return;
  }
  var gate = document.querySelector('#gate');
  var app = document.querySelector('#protectedApp');
  if (!gate || !app) return;
  gate.classList.remove('hidden');
  app.classList.add('hidden');
  document.querySelector('#gateForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var input = document.querySelector('#accessCode').value.trim();
    if (input === pass) {
      sessionStorage.setItem(key, '1');
      showProtected();
      return;
    }
    document.querySelector('#gateError').textContent = 'Kode akses tidak sesuai.';
  });

  function showProtected() {
    gate.classList.add('hidden');
    app.classList.remove('hidden');
  }
}

function renderStats() {
  if (!document.querySelector('#totalReports')) return;
  document.querySelector('#totalReports').textContent = reports.length;
  document.querySelector('#openReports').textContent = reports.filter(function (r) {
    return r.status !== 'Selesai';
  }).length;
  document.querySelector('#closedReports').textContent = reports.filter(function (r) {
    return r.status === 'Selesai';
  }).length;
}

function initPengadu() {
  document.querySelectorAll('input[name="identityMode"]').forEach(function (i) {
    i.addEventListener('change', toggleIdentity);
  });
  document.querySelector('#reportForm').addEventListener('submit', submitReport);
  document.querySelector('#reportForm').addEventListener('reset', function () {
    setTimeout(toggleIdentity, 0);
  });
  document.querySelector('#trackForm').addEventListener('submit', trackReport);
  toggleIdentity();
  renderReporterList();
}

function toggleIdentity() {
  var mode = document.querySelector('input[name="identityMode"]:checked').value;
  var fields = document.querySelector('.identity-fields');
  fields.classList.toggle('hidden', mode !== 'identified');
  fields.querySelectorAll('input').forEach(function (i) {
    i.required = mode === 'identified';
  });
}

async function submitReport(e) {
  e.preventDefault();
  var form = e.currentTarget;
  var data = Object.fromEntries(new FormData(form).entries());
  showToast('Mengirim aduan...');

  var newReport;
  if (!isOfflineMode) {
    try {
      var res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error('API server error');
      var resJson = await res.json();
      newReport = resJson.report;
    } catch (err) {
      console.warn("API Gagal, beralih ke penyimpanan lokal browser:", err);
      isOfflineMode = true;
    }
  }

  if (isOfflineMode || !newReport) {
    var now = new Date();
    var id = makeCode(now);
    newReport = {
      id: id,
      identityMode: data.identityMode,
      reporterName: data.identityMode === 'anonymous' ? 'Anonim' : data.reporterName,
      contact: data.identityMode === 'anonymous' ? '-' : data.contact,
      reporterLevel: data.reporterLevel,
      category: data.category,
      subject: data.subject,
      location: data.location,
      incidentDate: data.incidentDate,
      urgency: data.urgency,
      description: data.description,
      evidence: data.evidence || '-',
      status: 'Baru',
      feedback: 'Aduan sudah masuk dan menunggu verifikasi polisi taruna.',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      history: [entry('Aduan diterima', 'Laporan berhasil dicatat oleh sistem.')]
    };
    reports = [newReport].concat(reports);
    saveReports();
  } else {
    reports = [newReport].concat(reports.filter(function (r) { return r.id !== newReport.id; }));
  }

  selectedReportId = newReport.id;
  form.reset();
  toggleIdentity();
  document.querySelector('#trackCode').value = newReport.id;
  renderStats();
  renderReporterList();
  showToast('Aduan terkirim. Kode pelacakan: ' + newReport.id);
}

function makeCode(date) {
  var m = String(date.getMonth() + 1).padStart(2, '0');
  var d = String(date.getDate()).padStart(2, '0');
  return 'ASP-' + m + d + '-' + Math.floor(1000 + Math.random() * 9000);
}

async function trackReport(e) {
  e.preventDefault();
  var code = document.querySelector('#trackCode').value.trim().toUpperCase();
  var target = document.querySelector('#trackResult');
  
  if (!code) {
    showToast('Silakan masukkan kode pelacakan.');
    return;
  }
  
  target.className = 'empty';
  target.textContent = 'Mencari aduan...';

  var report;
  if (!isOfflineMode) {
    try {
      var res = await fetch('/api/reports/' + encodeURIComponent(code));
      if (res.ok) {
        var resJson = await res.json();
        report = resJson.report;
      }
    } catch (err) {
      console.warn("Failed tracking from API, using cached data", err);
    }
  }

  if (!report) {
    report = reports.find(function (r) {
      return r.id === code;
    });
  }

  if (!report) {
    target.className = 'empty';
    target.textContent = 'Kode aduan tidak ditemukan. Periksa kembali kode yang diterima saat pengiriman.';
    return;
  }
  target.className = 'case';
  target.innerHTML = detailHtml(report, false);
}

function renderReporterList() {
  document.querySelector('#reporterList').innerHTML = reports.slice(0, 4).map(function (r) {
    return cardHtml(r, false);
  }).join('');
}

function initPolisi() {
  document.querySelector('#adminSearch').addEventListener('input', renderAdminList);
  document.querySelector('#adminStatusFilter').addEventListener('change', renderAdminList);
  renderAdminList();
  renderAdminDetail();
}

function renderAdminList() {
  var q = document.querySelector('#adminSearch').value.trim().toLowerCase();
  var status = document.querySelector('#adminStatusFilter').value;
  var filtered = reports.filter(function (r) {
    var matchStatus = status === 'all' || r.status === status;
    var hay = [r.id, r.category, r.location, r.subject, r.urgency].join(' ').toLowerCase();
    return matchStatus && hay.indexOf(q) > -1;
  });
  var list = document.querySelector('#adminList');
  list.innerHTML = filtered.length ? filtered.map(function (r) {
    return cardHtml(r, true);
  }).join('') : '<div class="empty">Tidak ada aduan yang sesuai filter.</div>';
  list.querySelectorAll('.case').forEach(function (card) {
    card.addEventListener('click', function () {
      selectedReportId = card.dataset.id;
      renderAdminList();
      renderAdminDetail();
    });
  });
}

function renderAdminDetail() {
  var detail = document.querySelector('#adminDetail');
  var r = reports.find(function (x) {
    return x.id === selectedReportId;
  });
  if (!r) {
    detail.innerHTML = '<div class="empty">Pilih salah satu aduan untuk memperbarui status dan feedback.</div>';
    return;
  }
  detail.innerHTML = detailHtml(r, true) + '<form class="admin-actions" id="adminActionForm"><label>Status penanganan<select name="status">' + ['Baru', 'Diverifikasi', 'Diproses', 'Butuh Klarifikasi', 'Selesai'].map(function (s) {
    return '<option ' + (r.status === s ? 'selected' : '') + '>' + s + '</option>';
  }).join('') + '</select></label><label>Feedback untuk pengadu<textarea name="feedback" rows="4">' + esc(r.feedback) + '</textarea></label><label>Catatan tindak lanjut internal<textarea name="actionNote" rows="4" placeholder="Contoh: Klarifikasi dijadwalkan, mediasi dilakukan, atau diteruskan ke pengasuh."></textarea></label><button class="btn primary" type="submit">Perbarui aduan</button></form>';
  document.querySelector('#adminActionForm').addEventListener('submit', updateReport);
}

async function updateReport(e) {
  e.preventDefault();
  var data = Object.fromEntries(new FormData(e.currentTarget).entries());
  var idx = reports.findIndex(function (r) {
    return r.id === selectedReportId;
  });
  if (idx < 0) return;

  showToast('Memperbarui aduan...');
  var updatedReport;
  if (!isOfflineMode) {
    try {
      var res = await fetch('/api/reports/' + encodeURIComponent(selectedReportId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: data.status,
          feedback: data.feedback,
          actionNote: data.actionNote
        })
      });
      if (!res.ok) throw new Error('PATCH API failed');
      var resJson = await res.json();
      updatedReport = resJson.report;
    } catch (err) {
      console.warn("API Gagal, memperbarui secara lokal di browser:", err);
      isOfflineMode = true;
    }
  }

  if (isOfflineMode || !updatedReport) {
    var note = data.actionNote.trim() || ('Status diperbarui menjadi ' + data.status + '.');
    reports[idx].status = data.status;
    reports[idx].feedback = data.feedback.trim();
    reports[idx].updatedAt = new Date().toISOString();
    reports[idx].history = reports[idx].history.concat([entry(data.status, note)]);
    saveReports();
  } else {
    reports[idx] = updatedReport;
  }

  renderStats();
  renderAdminList();
  renderAdminDetail();
  showToast('Status dan feedback aduan berhasil diperbarui.');
}

function initPengasuh() {
  document.querySelector('#mentorNoteForm').addEventListener('submit', saveMentorNote);
  renderMentor();
}

function renderMentor() {
  var done = reports.filter(function (r) {
    return r.status === 'Selesai';
  }).length;
  var rate = reports.length ? Math.round(done / reports.length * 100) : 0;
  document.querySelector('#resolutionRate').textContent = rate + '%';
  document.querySelector('#highUrgency').textContent = reports.filter(function (r) {
    return r.urgency === 'Tinggi';
  }).length;
  document.querySelector('#responseTime').textContent = reports.length > 3 ? '2 hari' : '1 hari';
  document.querySelector('#mentorTable').innerHTML = '<div class="table-row header"><span>Kode</span><span>Status</span><span>Urgensi</span><span>Tindak lanjut terakhir</span></div>' + reports.map(function (r) {
    var last = r.history[r.history.length - 1];
    return '<div class="table-row"><span><strong>' + r.id + '</strong><br>' + esc(r.category) + '</span><span>' + badge(r.status) + '</span><span>' + r.urgency + '</span><span>' + esc(last.title) + '<br><small>' + fmt(r.updatedAt) + '</small></span></div>';
  }).join('');
  document.querySelector('#mentorCaseSelect').innerHTML = reports.map(function (r) {
    return '<option value="' + r.id + '">' + r.id + ' - ' + esc(r.category) + '</option>';
  }).join('');
  document.querySelector('#mentorNotes').innerHTML = mentorNotes.length ? mentorNotes.map(function (n) {
    return '<article class="note"><strong>' + n.reportId + '</strong> <small>' + fmt(n.createdAt) + '</small><p>' + esc(n.text) + '</p></article>';
  }).join('') : '<div class="empty">Belum ada catatan supervisi dari pengasuh.</div>';
}

async function saveMentorNote(e) {
  e.preventDefault();
  var reportId = document.querySelector('#mentorCaseSelect').value;
  var text = document.querySelector('#mentorNoteText').value.trim();
  if (!text) {
    showToast('Catatan supervisi masih kosong.');
    return;
  }

  showToast('Menyimpan catatan supervisi...');
  var newNote;
  if (!isOfflineMode) {
    try {
      var res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportId: reportId,
          text: text
        })
      });
      if (!res.ok) throw new Error('POST API notes failed');
      var resJson = await res.json();
      newNote = resJson.note;
    } catch (err) {
      console.warn("API Gagal, menyimpan secara lokal di browser:", err);
      isOfflineMode = true;
    }
  }

  if (isOfflineMode || !newNote) {
    newNote = {
      reportId: reportId,
      text: text,
      createdAt: new Date().toISOString()
    };
    mentorNotes = [newNote].concat(mentorNotes);
    saveNotes();
  } else {
    mentorNotes = [newNote].concat(mentorNotes);
  }

  document.querySelector('#mentorNoteText').value = '';
  renderMentor();
  showToast('Catatan pengasuh berhasil disimpan.');
}

function cardHtml(r, selectable) {
  return '<article class="case ' + (selectable && selectedReportId === r.id ? 'selected' : '') + '" data-id="' + r.id + '"><div class="case-top"><div><div class="code">' + r.id + '</div><div class="meta"><span>' + r.reporterLevel + '</span><span>' + esc(r.category) + '</span><span>' + esc(r.location) + '</span></div></div>' + badge(r.status) + '</div><p class="desc">' + esc(r.description) + '</p><div class="meta"><span>Urgensi: ' + r.urgency + '</span><span>Diperbarui: ' + fmt(r.updatedAt) + '</span></div></article>';
}

function detailHtml(r, showIdentity) {
  var identity = showIdentity ? r.reporterName : (r.identityMode === 'anonymous' ? 'Anonim' : 'Beridentitas');
  return '<div class="case-top"><div><div class="code">' + r.id + '</div><div class="meta"><span>' + esc(r.category) + '</span><span>' + r.reporterLevel + '</span><span>' + fmt(r.createdAt) + '</span></div></div>' + badge(r.status) + '</div><dl><dt>Identitas</dt><dd>' + esc(identity) + '</dd><dt>Terlapor</dt><dd>' + esc(r.subject) + '</dd><dt>Lokasi</dt><dd>' + esc(r.location) + '</dd><dt>Tanggal kejadian</dt><dd>' + fmt(r.incidentDate) + '</dd><dt>Urgensi</dt><dd>' + r.urgency + '</dd><dt>Bukti</dt><dd>' + esc(r.evidence) + '</dd><dt>Kronologi</dt><dd>' + esc(r.description) + '</dd><dt>Feedback</dt><dd>' + esc(r.feedback) + '</dd></dl><div class="timeline">' + r.history.map(function (h) {
    return '<div class="timeline-item"><span class="dot"></span><div><p><strong>' + esc(h.title) + '</strong></p><small>' + fmt(h.at) + '</small><p>' + esc(h.body) + '</p></div></div>';
  }).join('') + '</div>';
}

function badge(status) {
  var c = status === 'Selesai' ? 'done' : status === 'Baru' ? 'new' : status === 'Butuh Klarifikasi' ? 'alert' : 'process';
  return '<span class="badge ' + c + '">' + status + '</span>';
}

function fmt(value) {
  var d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(d);
}

function esc(v) {
  return String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function showToast(message) {
  var t = document.querySelector('#toast');
  if (!t) return;
  t.textContent = message;
  t.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(function () {
    t.classList.remove('show');
  }, 3200);
}

document.addEventListener('DOMContentLoaded', init);