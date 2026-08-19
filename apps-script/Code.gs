/**
 * MuniBed Pilgrim Board — Google Apps Script Web App backend.
 * Stores comments in a "Comments" sheet in the bound Google Spreadsheet.
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

function doGet(e) {
  return jsonResponse(getComments());
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const nickname = String(data.nickname || '').trim().slice(0, MAX_NICKNAME_LEN);
    const content = String(data.content || '').trim().slice(0, MAX_CONTENT_LEN);

    if (!nickname || !content) {
      return jsonResponse({ error: 'nickname and content are required.' });
    }

    const sheet = getSheet();
    const now = new Date();
    const createdAt = Utilities.formatDate(now, 'Europe/Madrid', 'yyyy-MM-dd HH:mm');
    sheet.appendRow([now.toISOString(), nickname, content, createdAt]);

    return jsonResponse({ nickname: nickname, content: content, createdAt: createdAt });
  } catch (err) {
    return jsonResponse({ error: String(err) });
  }
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['Timestamp', 'Nickname', 'Content', 'CreatedAt']);
  }
  return sheet;
}

function getComments() {
  const sheet = getSheet();
  const values = sheet.getDataRange().getValues();
  const rows = values.slice(1); // skip header row
  const comments = rows
    .filter(r => r[1] && r[2])
    .map(r => ({
      nickname: r[1],
      content: r[2],
      // Sheets may auto-coerce the date-like string back into a real Date
      // when the cell is read, so re-format it consistently either way.
      createdAt: r[3] instanceof Date
        ? Utilities.formatDate(r[3], 'Europe/Madrid', 'yyyy-MM-dd HH:mm')
        : r[3]
    }));
  comments.reverse(); // newest first
  return comments.slice(0, MAX_RETURNED);
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
