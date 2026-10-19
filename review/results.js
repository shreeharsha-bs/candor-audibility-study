/* Descriptive summaries of collaborator previews. This module never sends data.
 * The caller must show results only after the reviewer explicitly leaves the task.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CandorResults = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CONTEXT = 'collaborator_preview';
  const CHOICES = Object.freeze({
    question_projection: ['question', 'non_question', 'unsure'],
    possible_completion: ['could_finish', 'expects_more', 'unsure']
  });
  const CHOICE_LABELS = Object.freeze({
    question: 'Question-like', non_question: 'Not question-like',
    could_finish: 'Could finish', expects_more: 'More speech expected', unsure: 'Unsure'
  });
  const MODES = ['phrase_walkthrough', 'assigned_list', 'cut_walkthrough'];
  const SYSTEM_ORDER = ['original', 'omnivoice', 'f5', 'cosyvoice2', 'qwen3_base', 'text'];
  const SYSTEM_NAMES = Object.freeze({original: 'Original speech', omnivoice: 'OmniVoice', f5: 'F5-TTS',
    cosyvoice2: 'CosyVoice2', qwen3_base: 'Qwen3-TTS Base', text: 'Gated text'});
  const LIMIT = 10000;

  function versionOrder(a, b) {
    const rank = value => { const index = SYSTEM_ORDER.indexOf(value); return index < 0 ? SYSTEM_ORDER.length : index; };
    return rank(a.system) - rank(b.system) || a.system.localeCompare(b.system) ||
      (a.condition === 'period' ? 0 : a.condition === 'question' ? 1 : 2) -
      (b.condition === 'period' ? 0 : b.condition === 'question' ? 1 : 2) || a.condition.localeCompare(b.condition);
  }

  function fail(message) { throw new Error(message); }
  function object(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(label + ' must be an object.');
  }
  function keys(value, allowed, label) {
    object(value, label);
    for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(label + ': unexpected field ' + key + '.');
  }
  function string(value, label, max = 200) {
    if (typeof value !== 'string' || !value.trim() || value.length > max) fail(label + ' is missing or invalid.');
    return value;
  }
  function array(value, label) {
    if (!Array.isArray(value) || value.length > LIMIT) fail(label + ' must be an array of at most ' + LIMIT + ' entries.');
    return value;
  }
  function timestamp(value, label) {
    if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value) ||
        !Number.isFinite(Date.parse(value))) fail(label + ' must be an ISO timestamp.');
    return value;
  }
  function optional(value, source, key, check) {
    if (Object.prototype.hasOwnProperty.call(source, key)) value[key] = check(source[key], key);
  }
  function stable(value) {
    if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
    return JSON.stringify(value);
  }

  function createCatalog(stimuliManifest, metadataManifest, listsManifest) {
    object(stimuliManifest, 'Stimulus manifest'); object(metadataManifest, 'Metadata manifest');
    const buildId = string(stimuliManifest.build_id, 'Build ID');
    if (metadataManifest.build_id !== buildId) fail('Stimuli and metadata belong to different builds.');
    const metadata = new Map();
    for (const row of array(metadataManifest.stimuli, 'Metadata')) {
      object(row, 'Metadata row');
      const id = string(row.stimulus_id, 'Metadata stimulus ID');
      if (metadata.has(id)) fail('Duplicate metadata stimulus ID: ' + id);
      if (!['main', 'punctuation'].includes(row.analysis_family)) fail('Unknown comparison family for ' + id);
      metadata.set(id, row);
    }
    const byId = new Map();
    for (const row of array(stimuliManifest.stimuli, 'Stimuli')) {
      object(row, 'Stimulus');
      const id = string(row.stimulus_id, 'Stimulus ID');
      if (row.trial_id !== undefined && row.trial_id !== id) fail('Trial and stimulus IDs disagree: ' + id);
      if (byId.has(id)) fail('Duplicate stimulus ID: ' + id);
      const meta = metadata.get(id);
      if (!meta) fail('Missing metadata for ' + id);
      if (!Object.prototype.hasOwnProperty.call(CHOICES, row.task)) fail('Unknown task for ' + id);
      if (!['earlier', 'later'].includes(row.gate)) fail('Unknown gate for ' + id);
      if (!['audio', 'text'].includes(row.modality)) fail('Unknown modality for ' + id);
      if (meta.analysis_family === 'punctuation' && row.task !== 'question_projection') fail('Punctuation records must use the question task.');
      byId.set(id, Object.freeze({
        trial_id: id, phrase_id: string(row.phrase_id, 'Phrase ID'), task: row.task,
        phrase_number: row.phrase_number,
        exposed_text: typeof meta.exposed_text === 'string' ? meta.exposed_text : '',
        gate: row.gate, modality: row.modality, system: string(meta.system, 'System'),
        condition: string(meta.condition, 'Condition'), analysis_family: meta.analysis_family
      }));
    }
    if (metadata.size !== byId.size) fail('Metadata contains stimuli that are absent from this build.');
    const tracks = new Map();
    for (const trial of byId.values()) {
      const trackId = [trial.analysis_family, trial.system, trial.condition].join('_');
      if (!tracks.has(trackId)) tracks.set(trackId, []);
      tracks.get(trackId).push(trial.trial_id);
    }
    for (const ids of tracks.values()) ids.sort((a, b) => {
      const x = byId.get(a), y = byId.get(b);
      return (x.gate === 'earlier' ? 0 : 1) - (y.gate === 'earlier' ? 0 : 1) ||
        (x.phrase_number || 0) - (y.phrase_number || 0);
    });
    const phraseReviewIds = Array.from(byId.keys()).sort((a, b) => {
      const x = byId.get(a), y = byId.get(b);
      return (x.phrase_number || 0) - (y.phrase_number || 0) || x.phrase_id.localeCompare(y.phrase_id) ||
        (x.gate === 'earlier' ? 0 : 1) - (y.gate === 'earlier' ? 0 : 1) ||
        (x.analysis_family === 'main' ? 0 : 1) - (y.analysis_family === 'main' ? 0 : 1) ||
        versionOrder(x, y) || a.localeCompare(b);
    });
    const lists = new Map();
    if (listsManifest !== undefined) {
      object(listsManifest, 'List manifest');
      if (listsManifest.build_id !== buildId) fail('Lists belong to a different build.');
      for (const row of array(listsManifest.lists, 'Lists')) {
        const id = string(row.list_id, 'List ID');
        if (lists.has(id)) fail('Duplicate list ID: ' + id);
        const ids = array(row.stimulus_ids, 'List trials');
        if (new Set(ids).size !== ids.length || ids.some(key => !byId.has(key))) fail('Invalid trial IDs in list ' + id);
        lists.set(id, ids.slice());
      }
    }
    return {build_id: buildId, byId, lists, tracks, phraseReviewIds: Object.freeze(phraseReviewIds)};
  }

  function validateSession(input, catalog, options = {}) {
    keys(input, ['schema_version', 'build_id', 'review_context', 'session_id', 'mode',
      'selection_id', 'list_id', 'started_at', 'completed_at', 'responses', 'feedback',
      'prior_results_viewed', 'prior_stimulus_exposure'], 'Session');
    if (input.schema_version !== 1) fail('Unsupported session format.');
    if (input.build_id !== catalog.build_id) fail('This review belongs to another stimulus build.');
    if (input.review_context !== CONTEXT) fail('Only collaborator previews can be included here; participant studies remain separate.');
    if (!MODES.includes(input.mode)) fail('Unknown review mode.');
    const session = {schema_version: 1, build_id: catalog.build_id, review_context: CONTEXT,
      session_id: string(input.session_id, 'Session ID'), mode: input.mode,
      selection_id: string(input.selection_id, 'Selection ID'), responses: []};
    optional(session, input, 'started_at', timestamp); optional(session, input, 'completed_at', timestamp);
    for (const name of ['prior_results_viewed', 'prior_stimulus_exposure']) {
      if (input[name] !== undefined) {
        if (typeof input[name] !== 'boolean') fail(name + ' must be true or false.');
        session[name] = input[name];
      }
    }
    if (input.list_id !== undefined) {
      if (input.mode !== 'assigned_list' || input.list_id !== input.selection_id) fail('List and selection IDs disagree.');
      session.list_id = input.list_id;
    }
    if (session.started_at && session.completed_at && Date.parse(session.completed_at) < Date.parse(session.started_at)) fail('Completion precedes the session start.');
    const expected = input.mode === 'assigned_list' ? catalog.lists.get(input.selection_id) :
      input.mode === 'phrase_walkthrough' ? (input.selection_id === 'all_phrases_v1' ? catalog.phraseReviewIds : null) :
      catalog.tracks.get(input.selection_id);
    if (!expected) fail(input.mode === 'assigned_list' ? 'Unknown assigned list.' : 'Unknown walkthrough set.');
    const seen = new Set(), phrases = new Set();
    let sawLater = false;
    let previousPhrase = null;
    for (const [index, row] of array(input.responses, 'Responses').entries()) {
      keys(row, ['trial_id', 'choice', 'submitted_at', 'order_index', 'audio_started', 'audio_ended', 'elapsed_ms', 'note'], 'Response');
      const id = string(row.trial_id, 'Trial ID'), trial = catalog.byId.get(id);
      if (!trial) fail('Unknown stimulus: ' + id);
      if (seen.has(id)) fail('Duplicate response for stimulus: ' + id);
      seen.add(id);
      if (row.choice !== 'skipped' && !CHOICES[trial.task].includes(row.choice)) fail('Invalid choice for ' + trial.task + ': ' + id);
      if (input.mode === 'phrase_walkthrough' && trial.phrase_id !== previousPhrase) sawLater = false;
      if (sawLater && trial.gate === 'earlier') fail('An earlier cut was answered after a later cut.');
      sawLater = sawLater || trial.gate === 'later';
      previousPhrase = trial.phrase_id;
      if (input.mode === 'assigned_list') {
        if (phrases.has(trial.phrase_id)) fail('An assigned review repeats a source phrase.');
        phrases.add(trial.phrase_id);
      }
      if (expected[index] !== id) fail('Responses do not follow the ' + (input.mode === 'assigned_list' ? 'assigned list.' : 'walkthrough set.'));
      const response = {trial_id: id, choice: row.choice};
      optional(response, row, 'submitted_at', timestamp);
      if (row.order_index !== undefined) {
        if (row.order_index !== index) fail('Response order_index must match its zero-based position.');
        response.order_index = index;
      }
      for (const name of ['audio_started', 'audio_ended']) {
        if (row[name] !== undefined) {
          if (typeof row[name] !== 'boolean') fail(name + ' must be true or false.');
          response[name] = row[name];
        }
      }
      if (row.audio_ended === true && row.audio_started !== true) fail('Audio cannot end before it has started.');
      if (trial.modality === 'text' && (row.audio_started === true || row.audio_ended === true)) fail('Text trials cannot record audio playback.');
      if (row.elapsed_ms !== undefined) {
        if (!Number.isFinite(row.elapsed_ms) || row.elapsed_ms < 0) fail('elapsed_ms must be a finite nonnegative number.');
        response.elapsed_ms = row.elapsed_ms;
      }
      if (row.note !== undefined) {
        if (typeof row.note !== 'string' || row.note.length > 5000) fail('Response notes must be text of at most 5000 characters.');
        response.note = row.note;
      }
      session.responses.push(response);
    }
    if (session.completed_at || options.requireComplete) {
      if (!session.completed_at) fail('Finish this review before importing or summarizing it.');
      if (session.responses.length !== expected.length) fail('A completed review must contain every trial in its assigned list or walkthrough set.');
    }
    if (input.feedback !== undefined) {
      keys(input.feedback, ['instructions', 'short_clips', 'technical'], 'Feedback');
      session.feedback = {};
      for (const [key, value] of Object.entries(input.feedback)) {
        if (typeof value !== 'string' || value.length > 10000) fail('Feedback must be text of at most 10000 characters.');
        session.feedback[key] = value;
      }
    }
    return session;
  }

  function mergeSessions(existing, incoming, catalog) {
    const sessions = new Map();
    for (const input of [...array(existing, 'Existing sessions'), ...array(incoming, 'Imported sessions')]) {
      const session = validateSession(input, catalog, {requireComplete: true}), previous = sessions.get(session.session_id);
      if (previous && stable(previous) !== stable(session)) fail('Conflicting copies of session ' + session.session_id + '; no import was applied.');
      sessions.set(session.session_id, session);
    }
    return Array.from(sessions.values());
  }

  function importJSON(text, catalog, existing = []) {
    if (typeof text !== 'string' || text.length > 10000000) fail('Review import must be JSON smaller than 10 MB.');
    let data;
    try { data = JSON.parse(text); } catch (_) { fail('This file is not valid JSON.'); }
    let incoming;
    if (Array.isArray(data)) incoming = data;
    else if (data && Object.prototype.hasOwnProperty.call(data, 'sessions')) {
      keys(data, ['schema_version', 'build_id', 'review_context', 'sessions'], 'Review collection');
      if (data.schema_version !== 1 || data.build_id !== catalog.build_id || data.review_context !== CONTEXT) fail('This collection has a different build, format, or review context.');
      incoming = data.sessions;
    } else incoming = [data];
    return mergeSessions(existing, incoming, catalog);
  }

  function aggregate(inputs, catalog) {
    const sessions = mergeSessions([], inputs, catalog), groups = new Map();
    let nRatings = 0, nSkipped = 0;
    const notes = [];
    for (const session of sessions) for (const response of session.responses) {
      const trial = catalog.byId.get(response.trial_id);
      if (response.note) notes.push({mode: session.mode, trial_id: response.trial_id, system: trial.system,
        condition: trial.condition, gate: trial.gate, task: trial.task, phrase_number: trial.phrase_number, note: response.note});
      if (response.choice === 'skipped') { nSkipped++; continue; }
      const priorResults = session.prior_results_viewed === undefined ? null : session.prior_results_viewed;
      const priorStimuli = session.prior_stimulus_exposure === undefined ? null : session.prior_stimulus_exposure;
      const phraseId = session.mode === 'phrase_walkthrough' ? trial.phrase_id : null;
      const key = JSON.stringify([session.mode, phraseId, trial.analysis_family, trial.task, trial.system, trial.condition, trial.gate, priorResults, priorStimuli]);
      if (!groups.has(key)) groups.set(key, {
        mode: session.mode, analysis_family: trial.analysis_family, task: trial.task,
        ...(phraseId ? {phrase_id: phraseId, phrase_number: trial.phrase_number, exposed_text: trial.exposed_text} : {}),
        system: trial.system, condition: trial.condition, gate: trial.gate,
        prior_results_viewed: priorResults, prior_stimulus_exposure: priorStimuli,
        n_ratings: 0, counts: Object.fromEntries(CHOICES[trial.task].map(choice => [choice, 0])),
        sessions: new Set(), phrases: new Set(), selections: new Set()
      });
      const group = groups.get(key);
      group.n_ratings++; group.counts[response.choice]++; nRatings++;
      group.sessions.add(session.session_id); group.phrases.add(trial.phrase_id); group.selections.add(session.selection_id);
    }
    const rows = Array.from(groups.values()).map(group => ({
      mode: group.mode, analysis_family: group.analysis_family, task: group.task,
      ...(group.phrase_id ? {phrase_id: group.phrase_id, phrase_number: group.phrase_number, exposed_text: group.exposed_text} : {}),
      system: group.system, condition: group.condition, gate: group.gate,
      prior_results_viewed: group.prior_results_viewed, prior_stimulus_exposure: group.prior_stimulus_exposure,
      n_ratings: group.n_ratings, n_sessions: group.sessions.size, n_phrases: group.phrases.size,
      selection_ids: Array.from(group.selections).sort(), counts: group.counts,
      proportions: Object.fromEntries(Object.entries(group.counts).map(([key, n]) => [key, n / group.n_ratings]))
    })).sort((a, b) => [a.mode, a.analysis_family, a.task, a.system, a.condition, a.gate].join('|').localeCompare([b.mode, b.analysis_family, b.task, b.system, b.condition, b.gate].join('|')));
    return {build_id: catalog.build_id, review_context: CONTEXT, n_sessions: sessions.length,
      n_sessions_with_responses: sessions.filter(s => s.responses.some(r => r.choice !== 'skipped')).length,
      n_completed_sessions: sessions.filter(s => s.completed_at).length,
      n_ratings: nRatings, n_skipped: nSkipped, groups: rows, notes,
      feedback: sessions.filter(s => s.feedback && Object.values(s.feedback).some(Boolean)).map(s => ({
        session_id: s.session_id, mode: s.mode, selection_id: s.selection_id, ...s.feedback
      }))};
  }

  function render(container, summary) {
    if (!container || !container.ownerDocument) fail('Results need a DOM container.');
    const doc = container.ownerDocument;
    function element(tag, text, parent) {
      const node = doc.createElement(tag);
      if (text !== undefined) node.textContent = String(text);
      if (parent) parent.appendChild(node);
      return node;
    }
    function renderRows(rows, parent, task, includeCut) {
      const exposures = new Map();
      for (const row of rows) {
        const key = JSON.stringify([row.prior_results_viewed, row.prior_stimulus_exposure]);
        if (!exposures.has(key)) exposures.set(key, []);
        exposures.get(key).push(row);
      }
      for (const exposureRows of exposures.values()) {
        const first = exposureRows[0];
        let exposureLabel;
        if (first.prior_results_viewed === false && first.prior_stimulus_exposure === false) exposureLabel = 'First review in this browser';
        else if (first.prior_results_viewed === null || first.prior_stimulus_exposure === null) {
          const describe = value => value === null ? 'not recorded' : value ? 'yes' : 'no';
          exposureLabel = 'Earlier exposure — results: ' + describe(first.prior_results_viewed) + '; phrases: ' + describe(first.prior_stimulus_exposure);
        } else exposureLabel = 'Previously viewed ' + (first.prior_results_viewed && first.prior_stimulus_exposure ? 'phrases and results' : first.prior_results_viewed ? 'results' : 'phrases') + ' in this browser';
        const exposure = element('p', exposureLabel, parent); exposure.className = 'results-exposure';
        const wrapper = element('div', undefined, parent); wrapper.className = 'results-table-wrap';
        const table = element('table', undefined, wrapper); table.className = 'results-table';
        const head = element('tr', undefined, element('thead', undefined, table));
        for (const title of ['Version', ...(includeCut ? ['Cut'] : []), 'Ratings', ...CHOICES[task].map(choice => CHOICE_LABELS[choice])]) {
          const th = element('th', title, head); th.setAttribute('scope', 'col');
        }
        const body = element('tbody', undefined, table);
        const ordered = exposureRows.slice().sort((a, b) => versionOrder(a, b) ||
          (a.gate === 'earlier' ? 0 : 1) - (b.gate === 'earlier' ? 0 : 1));
        for (const row of ordered) {
          const tr = element('tr', undefined, body);
          const version = (SYSTEM_NAMES[row.system] || row.system) + (row.analysis_family === 'punctuation' ? ' · ' + (row.condition === 'period' ? 'period input' : 'question-mark input') : '');
          const label = element('th', version, tr); label.setAttribute('scope', 'row');
          if (includeCut) element('td', row.gate === 'earlier' ? 'Shorter' : 'Longer', tr);
          element('td', row.n_ratings, tr);
          for (const choice of CHOICES[task]) element('td', row.counts[choice] + '/' + row.n_ratings + ' (' + (row.proportions[choice] * 100).toFixed(1) + '%)', tr);
        }
      }
    }
    container.replaceChildren();
    element('p', 'Compare the responses to the same phrase across speech and text. Differences and notes can help us decide which recordings or questions need another check.', container);
    element('p', summary.n_ratings + ' ratings from ' + summary.n_completed_sessions + ' completed review' + (summary.n_completed_sessions === 1 ? '' : 's') + '. Percentages include Unsure.' + (summary.n_skipped ? ' Skipped versions are not counted as ratings.' : ''), container);
    const explanation = element('details');
    element('summary', 'How the counts are calculated', explanation);
    element('p', 'Hearing one version can affect how someone judges the next. Use these comparisons to prepare the participant pilot.', explanation);
    element('p', 'Each saved session is one completed review. One person may have created more than one session, so the session count is not a count of different people. We divide each response count by all ratings in that row, including Unsure, so uncertainty remains visible.', explanation);
    element('p', 'We keep earlier single-version reviews separate from reviews that compare several versions of each phrase, because the earlier listening can influence later answers. We also separate sessions that had already viewed phrases or results in this browser; exposure elsewhere cannot be recovered from these files.', explanation);
    if (!summary.groups.length) element('p', summary.n_completed_sessions ? 'No ratings were given. Any notes and feedback appear below.' : 'Import completed reviews to see their responses here.', container);
    for (const mode of MODES) {
      const modeRows = summary.groups.filter(row => row.mode === mode);
      if (!modeRows.length) continue;
      const section = element('section', undefined, container);
      element('h2', mode === 'phrase_walkthrough' ? 'All versions of each phrase' : mode === 'assigned_list' ? 'Assigned-list preview' : 'Shorter-then-longer walkthrough', section);
      if (mode === 'phrase_walkthrough') {
        const phraseIds = [...new Set(modeRows.slice().sort((a, b) => a.phrase_number - b.phrase_number).map(row => row.phrase_id))];
        for (const phraseId of phraseIds) {
          const phraseRows = modeRows.filter(row => row.phrase_id === phraseId);
          const phrase = element('section', undefined, section); phrase.className = 'results-phrase';
          const task = phraseRows[0].task;
          element('h3', 'Phrase ' + phraseRows[0].phrase_number + ' · ' + (task === 'question_projection' ? 'Question projection' : 'Possible completion'), phrase);
          for (const gate of ['earlier', 'later']) {
            const gateRows = phraseRows.filter(row => row.gate === gate);
            if (!gateRows.length) continue;
            element('h4', gate === 'earlier' ? 'Shorter cut' : 'Longer cut', phrase);
            if (gateRows[0].exposed_text) {
              const words = element('p', gateRows[0].exposed_text, phrase); words.className = 'results-cut-words';
            }
            for (const family of ['main', 'punctuation']) {
              const rows = gateRows.filter(row => row.analysis_family === family);
              if (!rows.length) continue;
              element('h5', family === 'main' ? 'Original speech, neutral synthesis and text' : 'Period and question-mark synthesis', phrase);
              renderRows(rows, phrase, task, false);
            }
          }
        }
      } else {
        for (const family of ['main', 'punctuation']) for (const task of Object.keys(CHOICES)) {
          const rows = modeRows.filter(row => row.analysis_family === family && row.task === task);
          if (!rows.length) continue;
          element('h4', (family === 'main' ? 'Main comparison' : 'Punctuation manipulation') + ' · ' + (task === 'question_projection' ? 'Question projection' : 'Possible completion'), section);
          renderRows(rows, section, task, true);
        }
      }
    }
    if (summary.feedback.length) {
      const details = element('details', undefined, container);
      element('summary', 'Written feedback (' + summary.feedback.length + (summary.feedback.length === 1 ? ' session)' : ' sessions)'), details);
      summary.feedback.forEach((feedback, index) => {
        const article = element('article', undefined, details);
        element('h4', 'Session ' + (index + 1) + ' · ' + (feedback.mode === 'phrase_walkthrough' ? 'All versions by phrase' : feedback.mode === 'assigned_list' ? 'Assigned list' : 'Walkthrough'), article);
        for (const [key, label] of [['instructions', 'Instructions'], ['short_clips', 'Short clips'], ['technical', 'Technical issues']]) {
          if (feedback[key]) { element('h5', label, article); element('p', feedback[key], article); }
        }
      });
    }
    if (summary.notes.length) {
      const details = element('details', undefined, container);
      element('summary', 'Notes on individual cuts (' + summary.notes.length + ')', details);
      for (const note of summary.notes) {
        const article = element('article', undefined, details);
        element('h4', 'Phrase ' + note.phrase_number + ' · ' + (SYSTEM_NAMES[note.system] || note.system) + ' · ' + note.condition + ' · ' + (note.gate === 'earlier' ? 'Shorter' : 'Longer'), article);
        element('p', note.note, article);
      }
    }
    container.appendChild(explanation);
    return container;
  }

  return Object.freeze({createCatalog, validateSession, mergeSessions, importJSON, aggregate, render,
    REVIEW_CONTEXT: CONTEXT, CHOICES, CHOICE_LABELS});
});
