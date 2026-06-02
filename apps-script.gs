const SHEET_NAME = 'responses';
const HEADERS = [
  'received_at', 'event_type', 'study_id', 'schema_version', 'session_id', 'participant_id',
  'list_id', 'trial_index', 'trial_count', 'sample_id', 'base_item_id', 'task',
  'prompt_length_condition', 'prompt_length_s', 'evidence_level', 'audio_url',
  'audibility_question', 'response', 'response_label', 'listener_notes', 'trial_started_at',
  'response_submitted_at', 'response_time_ms', 'first_play_at', 'play_count', 'audio_ended',
  'page_url', 'user_agent'
];

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, service: 'candor-study' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const payload = JSON.parse((e.postData && e.postData.contents) || '{}');
    const sheet = getSheet_();
    ensureHeader_(sheet);
    const row = HEADERS.map((header) => header === 'received_at' ? new Date().toISOString() : value_(payload[header]));
    sheet.appendRow(row);
    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(error) }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function getSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  return spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.insertSheet(SHEET_NAME);
}

function ensureHeader_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    return;
  }
  const current = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  if (current.join('|') !== HEADERS.join('|')) {
    sheet.insertRowBefore(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  }
}

function value_(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}
