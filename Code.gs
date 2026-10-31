// Casa Hub — Apps Script v2 (sync + liste della spesa in Google Docs + foto delle stanze)
// Crealo da un Foglio Google tutto suo: Estensioni → Apps Script.
const SHEET_NAME = 'CasaHub';
const CHUNK = 45000;
const FOLDER_NAME = 'Casa Hub - Liste spesa';
const KEEP_DAYS = 60; // le liste più vecchie finiscono nel cestino
const PHOTO_FOLDER = 'Casa Hub - Foto';

function doGet(e) {
  if (e && e.parameter && e.parameter.action === 'read') {
    const sheet = getSheet();
    const last = sheet.getLastRow();
    if (last < 1) return out('{}');
    const txt = sheet.getRange(1, 1, last, 1).getValues()
      .map(function (r) { const v = String(r[0]); return v.charAt(0) === '~' ? v.slice(1) : v; })
      .join('');
    return out(txt || '{}');
  }
  if (e && e.parameter && e.parameter.action === 'imgget') return getImage(e.parameter.id);
  return out(JSON.stringify({ error: 'unknown action' }));
}

function doPost(e) {
  if (e && e.parameter && e.parameter.action === 'doc') return createShoppingDoc(e);
  if (e && e.parameter && e.parameter.action === 'imgput') return putImage(e);
  if (e && e.parameter && e.parameter.action === 'imgdel') return deleteImage(e);
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

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
}

function out(s) {
  return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.JSON);
}