// Casa Hub — Apps Script v3 (sync + liste della spesa in Google Docs + foto delle stanze + promemoria scadenze)
// Dopo averlo incollato: scegli la funzione "autorizza" in alto e premi Esegui una volta.
// Crealo da un Foglio Google tutto suo: Estensioni → Apps Script.
const SHEET_NAME = 'CasaHub';
const CHUNK = 45000;
const FOLDER_NAME = 'Casa Hub - Liste spesa';
const KEEP_DAYS = 60; // le liste più vecchie finiscono nel cestino
const PHOTO_FOLDER = 'Casa Hub - Foto';

function doGet(e) {
  if (e && e.parameter && e.parameter.action === 'read') return out(readDataText());
  if (e && e.parameter && e.parameter.action === 'imgget') return getImage(e.parameter.id);
  return out(JSON.stringify({ error: 'unknown action' }));
}

function doPost(e) {
  if (e && e.parameter && e.parameter.action === 'doc') return createShoppingDoc(e);
  if (e && e.parameter && e.parameter.action === 'imgput') return putImage(e);
  if (e && e.parameter && e.parameter.action === 'imgdel') return deleteImage(e);
  if (e && e.parameter && e.parameter.action === 'remind') return setReminder(e);
  if (e && e.parameter && e.parameter.action === 'remindtest') return testReminder();
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const body = e.postData.contents;
    const obj = JSON.parse(body);
    // protezione: scrive solo dati di Casa Hub, mai una richiesta di documento
    if (!obj || obj.kind || !Array.isArray(obj.tasks)) throw new Error('dati non validi');
    const sheet = getSheet();
    const rows = [];
    for (let i = 0; i < body.length; i += CHUNK) rows.push(['~' + body.substring(i, i + CHUNK)]);
    sheet.clearContents();
    const range = sheet.getRange(1, 1, rows.length, 1);
    range.setNumberFormat('@');
    range.setValues(rows);
    return out(JSON.stringify({ ok: true, chunks: rows.length }));
  } catch (err) {
    return out(JSON.stringify({ error: String(err && err.message || err) }));
  } finally {
    lock.releaseLock();
  }
}

function createShoppingDoc(e) {
  try {
    const p = JSON.parse(e.postData.contents);
    const doc = DocumentApp.create(p.title || 'Lista della spesa');
    const body = doc.getBody();
    body.setMarginTop(40).setMarginBottom(40).setMarginLeft(50).setMarginRight(50);
    const first = body.getParagraphs()[0];
    first.setText(p.title || 'Lista della spesa');
    first.setHeading(DocumentApp.ParagraphHeading.TITLE);
    if (p.subtitle) body.appendParagraph(p.subtitle).setHeading(DocumentApp.ParagraphHeading.SUBTITLE);
    (p.sections || []).forEach(function (s) {
      body.appendParagraph(String(s.name)).setHeading(DocumentApp.ParagraphHeading.HEADING2);
      (s.items || []).forEach(function (it) {
        body.appendParagraph('☐  ' + it).setHeading(DocumentApp.ParagraphHeading.NORMAL).setSpacingBefore(0).setSpacingAfter(2);
      });
    });
    doc.saveAndClose();
    const file = DriveApp.getFileById(doc.getId());
    try { file.moveTo(getFolder()); } catch (err) {}
    // chi riceve il link (es. su WhatsApp) può aprirlo senza chiedere l'accesso
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (err) {}
    cleanupOldLists();
    return out(JSON.stringify({ ok: true, url: doc.getUrl(), id: doc.getId() }));
  } catch (err) {
    return out(JSON.stringify({ error: String(err && err.message || err) }));
  }
}

function getFolder() {
  const it = DriveApp.getFoldersByName(FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
}

function cleanupOldLists() {
  try {
    const limit = Date.now() - KEEP_DAYS * 864e5;
    const files = getFolder().getFiles();
    while (files.hasNext()) {
      const f = files.next();
      if (f.getDateCreated().getTime() < limit) f.setTrashed(true);
    }
  } catch (err) {}
}

// ── Foto delle stanze: file JPEG nella cartella "Casa Hub - Foto" del tuo Drive ──
function getPhotoFolder() {
  const it = DriveApp.getFoldersByName(PHOTO_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(PHOTO_FOLDER);
}

// sicurezza: lo script legge o cancella SOLO file che stanno nella cartella delle foto
function photoFile(id) {
  const f = DriveApp.getFileById(String(id));
  const folderId = getPhotoFolder().getId();
  const parents = f.getParents();
  while (parents.hasNext()) if (parents.next().getId() === folderId) return f;
  throw new Error('file non consentito');
}

function putImage(e) {
  try {
    const p = JSON.parse(e.postData.contents);
    if (!p || p.kind !== 'img' || !p.data) throw new Error('immagine mancante');
    const blob = Utilities.newBlob(Utilities.base64Decode(p.data), p.mime || 'image/jpeg', String(p.id || 'foto') + '.jpg');
    const f = getPhotoFolder().createFile(blob);
    return out(JSON.stringify({ ok: true, fileId: f.getId() }));
  } catch (err) {
    return out(JSON.stringify({ error: String(err && err.message || err) }));
  }
}

function getImage(id) {
  try {
    const b = photoFile(id).getBlob();
    return out(JSON.stringify({ ok: true, mime: b.getContentType(), data: Utilities.base64Encode(b.getBytes()) }));
  } catch (err) {
    return out(JSON.stringify({ error: String(err && err.message || err) }));
  }
}

function deleteImage(e) {
  try {
    const p = JSON.parse(e.postData.contents);
    photoFile(p.fileId).setTrashed(true);
    return out(JSON.stringify({ ok: true }));
  } catch (err) {
    return out(JSON.stringify({ error: String(err && err.message || err) }));
  }
}

function readDataText() {
  const sheet = getSheet();
  const last = sheet.getLastRow();
  if (last < 1) return '{}';
  return sheet.getRange(1, 1, last, 1).getValues()
    .map(function (r) { const v = String(r[0]); return v.charAt(0) === '~' ? v.slice(1) : v; })
    .join('') || '{}';
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
}

function out(s) {
  return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.JSON);
}

// ── Promemoria delle scadenze del frigo ─────────────────────────────────────
const REMIND_CAL = 'Casa Hub';

// Da eseguire UNA volta dall'editor (scegli "autorizza" in alto e premi Esegui):
// concede i permessi per Calendario, email e promemoria automatici.
function autorizza() {
  CalendarApp.getDefaultCalendar();
  ScriptApp.getProjectTriggers();
  MailApp.getRemainingDailyQuota();
  return 'ok';
}

function setReminder(e) {
  try {
    const p = JSON.parse(e.postData.contents);
    ScriptApp.getProjectTriggers().forEach(function (t) {
      if (t.getHandlerFunction() === 'dailyFridgeCheck') ScriptApp.deleteTrigger(t);
    });
    if (p.on) {
      const h = Math.max(0, Math.min(23, Number(p.hour) || 8));
      ScriptApp.newTrigger('dailyFridgeCheck').timeBased().everyDays(1).atHour(h).create();
    }
    return out(JSON.stringify({ ok: true, on: !!p.on, tz: Session.getScriptTimeZone() }));
  } catch (err) {
    return out(JSON.stringify({ error: String(err && err.message || err) }));
  }
}

function testReminder() {
  try { return out(JSON.stringify({ ok: true, sent: dailyFridgeCheck(true) })); }
  catch (err) { return out(JSON.stringify({ error: String(err && err.message || err) })); }
}

function isoOf(d) { return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd'); }
function daysBetweenIso(a, b) { return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5); }
function fridgeExpiry(x) {
  let e = x.expiry || null;
  if (x.openedAt && x.openDays) {
    const d = new Date(x.openedAt + 'T12:00:00');
    d.setDate(d.getDate() + Number(x.openDays));
    const o = isoOf(d);
    if (!e || o < e) e = o;
  }
  return e;
}

// Gira ogni giorno all'ora scelta. force = prova manuale dall'app.
function dailyFridgeCheck(force) {
  force = force === true;
  const data = JSON.parse(readDataText());
  const st = (data.settings || [])[0] || {};
  if (!st.fridgeRemind && !force) return 0;
  const today = isoOf(new Date());
  const ahead = st.fridgeDays === undefined ? 1 : Number(st.fridgeDays) || 0;
  const items = (data.fridge || []).map(function (x) {
    const e = fridgeExpiry(x);
    return e ? { name: x.name, d: daysBetweenIso(today, e) } : null;
  }).filter(function (x) { return x && x.d <= ahead; })
    .sort(function (a, b) { return a.d - b.d; });
  if (!items.length && !force) return 0;
  const label = function (x) {
    return x.name + ' (' + (x.d < 0 ? 'scaduto' : x.d === 0 ? 'oggi' : x.d === 1 ? 'domani' : 'tra ' + x.d + ' giorni') + ')';
  };
  const title = items.length
    ? 'Da consumare: ' + items.slice(0, 4).map(label).join(', ') + (items.length > 4 ? ' e altro' : '')
    : 'Prova promemoria Casa Hub: niente in scadenza';
  const body = items.length ? items.map(function (x) { return '- ' + label(x); }).join('\n') : 'Le notifiche funzionano.';
  const ch = st.fridgeChannel || 'calendar';
  if (ch === 'calendar' || ch === 'both') {
    const cals = CalendarApp.getCalendarsByName(REMIND_CAL);
    const cal = cals.length ? cals[0] : CalendarApp.createCalendar(REMIND_CAL);
    // evento tra 15 minuti con avviso 10 minuti prima: la notifica arriva dopo circa 5 minuti
    const start = new Date(Date.now() + 15 * 60000);
    const ev = cal.createEvent(title, start, new Date(start.getTime() + 15 * 60000), { description: body });
    ev.removeAllReminders();
    ev.addPopupReminder(10);
    cal.getEvents(new Date(Date.now() - 90 * 864e5), new Date(Date.now() - 14 * 864e5))
      .forEach(function (x) { x.deleteEvent(); });
  }
  if (ch === 'email' || ch === 'both') {
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'Casa Hub - ' + title, body + '\n\nCasa Hub');
  }
  return items.length;
}