/**
 * MuniBed Pilgrim Board — Google Apps Script Web App backend.
 * Stores comments in a "Comments" sheet in the bound Google Spreadsheet.
 * Each comment is created with an author password so it can be deleted later.
 *
 * Setup:
 * 1. Create a new Google Sheet (or open an existing one).
 * 2. Extensions > Apps Script, paste this whole file in as Code.gs.
 * 3. Deploy > New deployment > type "Web app".
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 4. Copy the Web app URL (ends in /exec) into community.html's APPS_SCRIPT_URL.
 */

const SHEET_NAME = 'Comments';
const MAX_NICKNAME_LEN = 30;
const MAX_CONTENT_LEN = 300;
const MAX_RETURNED = 100;
const MIN_PASSWORD_LEN = 4;
const MAX_PASSWORD_LEN = 30;

function doGet(e) {
  return jsonResponse(getComments());
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    if (data.action === 'delete') {
      return handleDelete(data);
    }
    return handleCreate(data);
  } catch (err) {
    return jsonResponse({ error: String(err) });
  }
}

function handleCreate(data) {
  const nickname = String(data.nickname || '').trim().slice(0, MAX_NICKNAME_LEN);
  const content = String(data.content || '').trim().slice(0, MAX_CONTENT_LEN);
  const password = String(data.password || '');

  if (!nickname || !content) {
    return jsonResponse({ error: 'nickname and content are required.' });
  }
  if (password.length < MIN_PASSWORD_LEN || password.length > MAX_PASSWORD_LEN) {
    return jsonResponse({ error: `password must be ${MIN_PASSWORD_LEN}-${MAX_PASSWORD_LEN} characters.` });
  }

  const sheet = getSheet();
  const id = Utilities.getUuid();
  const now = new Date();
  const createdAt = Utilities.formatDate(now, 'Europe/Madrid', 'yyyy-MM-dd HH:mm');
  sheet.appendRow([id, now.toISOString(), nickname, content, createdAt, hashPassword(password)]);

  return jsonResponse({ id: id, nickname: nickname, content: content, createdAt: createdAt });
}

function handleDelete(data) {
  const id = String(data.id || '');
  const password = String(data.password || '');
  if (!id || !password) {
    return jsonResponse({ error: 'id and password are required.' });
  }

  const sheet = getSheet();
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === id) {
      if (values[i][5] !== hashPassword(password)) {
        return jsonResponse({ error: '비밀번호가 일치하지 않습니다.' });
      }
      sheet.deleteRow(i + 1); // +1: sheet rows are 1-indexed
      return jsonResponse({ deleted: true });
    }
  }
  return jsonResponse({ error: '이미 삭제되었거나 존재하지 않는 글입니다.' });
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['Id', 'Timestamp', 'Nickname', 'Content', 'CreatedAt', 'PasswordHash']);
  }
  return sheet;
}

function getComments() {
  const sheet = getSheet();
  const values = sheet.getDataRange().getValues();
  const rows = values.slice(1); // skip header row
  const comments = rows
    .filter(r => r[2] && r[3])
    .map(r => ({
      id: r[0],
      nickname: r[2],
      content: r[3],
      // Sheets may auto-coerce the date-like string back into a real Date
      // when the cell is read, so re-format it consistently either way.
      createdAt: r[4] instanceof Date
        ? Utilities.formatDate(r[4], 'Europe/Madrid', 'yyyy-MM-dd HH:mm')
        : r[4]
      // PasswordHash (r[5]) is intentionally never included in the response.
    }));
  comments.reverse(); // newest first
  return comments.slice(0, MAX_RETURNED);
}

function hashPassword(password) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password);
  return digest.map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0')).join('');
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
