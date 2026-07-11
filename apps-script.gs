const SHEET_NAME = 'responses_v2';
const MIRROR_BY_STUDY_AND_LIST = true;
const HEADERS = [
  'received_at', 'event_type', 'study_id', 'schema_version', 'session_id', 'participant_id',
  'list_id', 'trial_index', 'trial_count', 'sample_id', 'base_item_id', 'task',
  'study_block', 'trial_mode', 'display_text',
  'is_attention_check', 'attention_check_kind', 'attention_check_expected_response',
  'attention_check_source_sample_id', 'attention_check_passed',
  'prompt_length_condition', 'prompt_progress_condition', 'prompt_fraction',
  'prompt_length_s', 'prompt_duration_s', 'evidence_level',
  'turn_gate_condition', 'turn_gate_word_cutoff', 'silence_expected',
  'question_pair_id', 'question_match_scope', 'source_speech_rate_wps',
  'audio_url', 'audibility_question', 'response', 'response_label', 'listener_notes', 'trial_started_at',
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
    const row = HEADERS.map((header) => header === 'received_at' ? new Date().toISOString() : value_(payload[header]));

    const sheet = getSheet_(SHEET_NAME);
    ensureHeader_(sheet);
    sheet.appendRow(row);

    if (MIRROR_BY_STUDY_AND_LIST) {
      const mirrorSheet = getSheet_(mirrorSheetName_(payload));
      ensureHeader_(mirrorSheet);
      mirrorSheet.appendRow(row);
    }

    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(error) }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function getSheet_(sheetName) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  return spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
}

function mirrorSheetName_(payload) {
  const studyId = cleanSheetPart_(payload.study_id || 'study');
  const listId = cleanSheetPart_(payload.list_id || 'list');
  const name = `${studyId}__list_${listId}`;
  return name.slice(0, 100);
}

function cleanSheetPart_(value) {
  return String(value)
    .trim()
    .replace(/[\\/?*\[\]:]/g, '_')
    .replace(/[^A-Za-z0-9_.-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'unknown';
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
