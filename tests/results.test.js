'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../review/results.js');

const stimuli = {build_id: 'build-A', stimuli: [
  {stimulus_id: 'q1', phrase_id: 'phrase-1', phrase_number: 1, task: 'question_projection', gate: 'earlier', modality: 'audio'},
  {stimulus_id: 'q2', phrase_id: 'phrase-1', phrase_number: 1, task: 'question_projection', gate: 'later', modality: 'audio'},
  {stimulus_id: 'p1', phrase_id: 'phrase-2', phrase_number: 2, task: 'question_projection', gate: 'earlier', modality: 'audio'},
  {stimulus_id: 't1', phrase_id: 'phrase-3', phrase_number: 3, task: 'possible_completion', gate: 'earlier', modality: 'text'}
]};
const metadata = {build_id: 'build-A', stimuli: [
  {stimulus_id: 'q1', system: 'original', condition: 'original', analysis_family: 'main'},
  {stimulus_id: 'q2', system: 'original', condition: 'original', analysis_family: 'main'},
  {stimulus_id: 'p1', system: 'f5', condition: 'question', analysis_family: 'punctuation'},
  {stimulus_id: 't1', system: 'text', condition: 'text', analysis_family: 'main'}
]};
const lists = {build_id: 'build-A', lists: [
  {list_id: 'P01', stimulus_ids: ['q1', 't1']}, {list_id: 'P02', stimulus_ids: ['q1', 't1']}
]};
const catalog = R.createCatalog(stimuli, metadata, lists);
function session(overrides = {}) {
  return {schema_version: 1, build_id: 'build-A', review_context: 'collaborator_preview',
    session_id: 'session-1', mode: 'cut_walkthrough', selection_id: 'main_original_original',
    started_at: '2026-10-17T10:00:00.000Z', completed_at: '2026-10-17T10:01:00.000Z',
    responses: [{trial_id: 'q1', choice: 'question'}, {trial_id: 'q2', choice: 'non_question'}], ...overrides};
}
function partial(overrides = {}) { const s = session({responses: [{trial_id: 'q1', choice: 'question'}], ...overrides}); delete s.completed_at; return s; }
function assigned(overrides = {}) { return session({mode: 'assigned_list', selection_id: 'P01', responses: [{trial_id: 'q1', choice: 'question'}, {trial_id: 't1', choice: 'could_finish'}], ...overrides}); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function currentCatalog() {
  const dir = path.join(__dirname, '../review/data');
  const read = name => JSON.parse(fs.readFileSync(path.join(dir, name + '.json')));
  return R.createCatalog(read('stimuli'), read('metadata'), read('lists'));
}
function allPhrases(c, overrides = {}) {
  return session({build_id: c.build_id, mode: 'phrase_walkthrough', selection_id: 'all_phrases_v1',
    prior_results_viewed: false, prior_stimulus_exposure: false,
    responses: c.phraseReviewIds.map((trial_id, order_index) => ({trial_id, order_index, choice: 'unsure'})), ...overrides});
}
function renderSummary(summary) {
  class Element {
    constructor(tag, doc) { this.tag = tag; this.ownerDocument = doc; this.children = []; this.textContent = ''; this.attrs = {}; }
    appendChild(child) { this.children.push(child); }
    replaceChildren() { this.children = []; }
    setAttribute(key, value) { this.attrs[key] = value; }
    set innerHTML(_) { throw new Error('Unsafe innerHTML'); }
    get text() { return this.textContent + ' ' + this.children.map(child => child.text).join(' '); }
  }
  const doc = {createElement(tag) { return new Element(tag, this); }}, container = new Element('div', doc);
  R.render(container, summary);
  return container;
}

test('reject wrong build and participant context, including collection wrappers', () => {
  assert.throws(() => R.validateSession(session({build_id: 'old'}), catalog), /another stimulus build/);
  assert.throws(() => R.validateSession(session({review_context: 'participant_study'}), catalog), /participant studies remain separate/);
  assert.throws(() => R.importJSON(JSON.stringify({schema_version: 1, build_id: 'build-A', review_context: 'participant_study', sessions: [session()]}), catalog), /different build, format, or review context/);
});

test('reject unknown stimuli, task-inappropriate choices, duplicated trials and invented fields', () => {
  assert.throws(() => R.validateSession(partial({responses: [{trial_id: 'absent', choice: 'question'}]}), catalog), /Unknown stimulus/);
  assert.throws(() => R.validateSession(partial({responses: [{trial_id: 't1', choice: 'question'}]}), catalog), /Invalid choice/);
  assert.throws(() => R.validateSession(partial({responses: [{trial_id: 'q1', choice: 'question'}, {trial_id: 'q1', choice: 'unsure'}]}), catalog), /Duplicate response/);
  assert.throws(() => R.validateSession(partial({responses: [{trial_id: 'q1', choice: 'question', system: 'fake'}]}), catalog), /unexpected field system/);
  assert.throws(() => R.validateSession(session({participant_id: 'private'}), catalog), /unexpected field participant_id/);
});

test('deduplicate exact session copies and reject conflicting copies atomically', () => {
  const existing = [session()];
  assert.equal(R.mergeSessions(existing, [clone(session())], catalog).length, 1);
  const conflict = session({responses: [{trial_id: 'q1', choice: 'non_question'}, {trial_id: 'q2', choice: 'non_question'}]});
  assert.throws(() => R.mergeSessions(existing, [session({session_id: 'new'}), conflict], catalog), /Conflicting copies/);
  assert.equal(existing.length, 1);
  assert.equal(existing[0].responses[0].choice, 'question');
});

test('partial sessions can resume but cannot be imported, merged or summarized as completed reviews', () => {
  assert.equal(R.validateSession(partial(), catalog).responses.length, 1);
  assert.throws(() => R.importJSON(JSON.stringify(partial()), catalog), /Finish this review/);
  assert.throws(() => R.mergeSessions([], [partial()], catalog), /Finish this review/);
  assert.throws(() => R.aggregate([partial()], catalog), /Finish this review/);
  assert.throws(() => R.validateSession(session({responses: partial().responses}), catalog), /every trial/);
  assert.throws(() => R.validateSession(assigned({responses: [{trial_id: 'q1', choice: 'question'}]}), catalog), /every trial/);
});

test('validated complete imports retain Unsure in each row denominator', () => {
  const a = session();
  const b = session({session_id: 'session-2', responses: [{trial_id: 'q1', choice: 'unsure'}, {trial_id: 'q2', choice: 'unsure'}]});
  const imported = R.importJSON(JSON.stringify({schema_version: 1, build_id: 'build-A', review_context: 'collaborator_preview', sessions: [a, b]}), catalog);
  const result = R.aggregate(imported, catalog), earlier = result.groups.find(g => g.gate === 'earlier');
  assert.equal(result.n_sessions, 2);
  assert.equal(result.n_ratings, 4);
  assert.deepEqual(earlier.counts, {question: 1, non_question: 0, unsure: 1});
  assert.equal(earlier.proportions.question, 0.5);
  assert.equal(earlier.n_phrases, 1);
  assert.equal(earlier.n_sessions, 2);
});

test('skips import without becoming ratings or changing Unsure denominators', () => {
  const skipped = session({session_id: 'with-skips', responses: [
    {trial_id: 'q1', choice: 'skipped', note: 'Could not listen here', audio_started: false, audio_ended: false},
    {trial_id: 'q2', choice: 'unsure', audio_started: true, audio_ended: false}
  ]});
  const imported = R.importJSON(JSON.stringify(skipped), catalog);
  assert.deepEqual(imported, [skipped]);
  const summary = R.aggregate([session(), ...imported], catalog);
  assert.equal(summary.n_ratings, 3); assert.equal(summary.n_skipped, 1);
  const early = summary.groups.find(row => row.gate === 'earlier');
  assert.equal(early.n_ratings, 1); assert.equal(early.proportions.question, 1);
  assert.equal(early.n_sessions, 1);
  const later = summary.groups.find(row => row.gate === 'later');
  assert.equal(later.n_ratings, 2); assert.equal(later.proportions.unsure, 0.5);
  assert.equal(later.proportions.non_question, 0.5);
  assert.ok(summary.groups.every(row => !Object.hasOwn(row.counts, 'skipped')));
  assert.equal(summary.notes[0].note, 'Could not listen here');
});

test('all-skipped completed reviews retain notes and feedback with no percentage rows', () => {
  const input = session({responses: [
    {trial_id: 'q1', choice: 'skipped', note: 'A useful note'}, {trial_id: 'q2', choice: 'skipped'}
  ], feedback: {instructions: 'Feedback without ratings'}});
  const summary = R.aggregate([input], catalog);
  assert.equal(summary.n_completed_sessions, 1); assert.equal(summary.n_sessions_with_responses, 0);
  assert.equal(summary.n_ratings, 0); assert.equal(summary.n_skipped, 2);
  assert.deepEqual(summary.groups, []); assert.equal(summary.notes.length, 1); assert.equal(summary.feedback.length, 1);
  const rendered = renderSummary(summary).text;
  assert.match(rendered, /0 ratings from 1 completed review/);
  assert.match(rendered, /A useful note/); assert.match(rendered, /Feedback without ratings/);
  assert.doesNotMatch(rendered, /NaN|Infinity|Import completed reviews to see/);
});

test('keep punctuation, tasks, gates and exposure modes separate', () => {
  const data = [session(), assigned({session_id: 'assigned'}),
    session({session_id: 'punct', selection_id: 'punctuation_f5_question', responses: [{trial_id: 'p1', choice: 'unsure'}]})];
  const result = R.aggregate(data, catalog);
  assert.equal(result.groups.length, 5);
  assert.equal(result.groups.filter(g => g.analysis_family === 'punctuation').length, 1);
  assert.equal(result.groups.filter(g => g.task === 'possible_completion').length, 1);
  assert.equal(result.groups.filter(g => g.gate === 'later').length, 1);
  assert.equal(result.groups.filter(g => g.mode === 'assigned_list').length, 2);
});

test('reject reversed order, wrong walkthrough coverage, repeated assigned phrases and unknown selections', () => {
  assert.throws(() => R.validateSession(partial({responses: [{trial_id: 'q2', choice: 'question'}, {trial_id: 'q1', choice: 'unsure'}]}), catalog), /walkthrough set/);
  assert.throws(() => R.validateSession(session({responses: [{trial_id: 'q1', choice: 'question'}, {trial_id: 'p1', choice: 'question'}]}), catalog), /walkthrough set/);
  assert.throws(() => R.validateSession(assigned({responses: [{trial_id: 'q1', choice: 'question'}, {trial_id: 'q2', choice: 'unsure'}]}), catalog), /repeats a source phrase/);
  assert.throws(() => R.validateSession(assigned({responses: [{trial_id: 't1', choice: 'unsure'}]}), catalog), /assigned list/);
  assert.throws(() => R.validateSession(assigned({selection_id: 'P03'}), catalog), /Unknown assigned list/);
  assert.throws(() => R.validateSession(session({selection_id: 'made-up'}), catalog), /Unknown walkthrough set/);
});

test('validate timing/playback fields without treating them as exclusion decisions', () => {
  const s = session(); s.responses[0] = {...s.responses[0], order_index: 0, audio_started: false, audio_ended: false, elapsed_ms: 0};
  assert.equal(R.aggregate([s], catalog).n_ratings, 2);
  for (const bad of [{elapsed_ms: -1}, {audio_started: 'true'}, {audio_ended: true}, {order_index: 4}]) {
    assert.throws(() => R.validateSession(partial({responses: [{trial_id: 'q1', choice: 'question', ...bad}]}), catalog));
  }
  assert.throws(() => R.validateSession(session({selection_id: 'main_text_text', responses: [{trial_id: 't1', choice: 'unsure', audio_started: true}]}), catalog), /Text trials/);
  assert.throws(() => R.validateSession(session({started_at: 'tomorrow'}), catalog), /ISO timestamp/);
});

test('catalog joins require matching builds and one-to-one metadata', () => {
  assert.throws(() => R.createCatalog(stimuli, {...metadata, build_id: 'old'}), /different builds/);
  assert.throws(() => R.createCatalog(stimuli, {...metadata, stimuli: metadata.stimuli.slice(1)}), /Missing metadata/);
  assert.throws(() => R.createCatalog(stimuli, {...metadata, stimuli: [...metadata.stimuli, metadata.stimuli[0]]}), /Duplicate metadata/);
});

test('previous exposure flags split summaries and missing flags are not treated as unexposed', () => {
  const responses = [session(), session({session_id: 'fresh', prior_results_viewed: false, prior_stimulus_exposure: false}),
    session({session_id: 'results_seen', prior_results_viewed: true, prior_stimulus_exposure: false}),
    session({session_id: 'phrases_seen', prior_results_viewed: false, prior_stimulus_exposure: true})];
  const result = R.aggregate(responses, catalog);
  assert.equal(result.groups.length, 8);
  assert.equal(result.groups.filter(g => g.prior_results_viewed === null).length, 2);
  assert.throws(() => R.validateSession(session({prior_results_viewed: 'no'}), catalog), /must be true or false/);
});

test('assigned lists aggregate across list IDs without inflating session or phrase counts', () => {
  const result = R.aggregate([assigned(), assigned({session_id: 'another', selection_id: 'P02'})], catalog);
  assert.equal(result.groups.length, 2);
  for (const group of result.groups) {
    assert.equal(group.n_sessions, 2); assert.equal(group.n_phrases, 1);
    assert.deepEqual(group.selection_ids, ['P01', 'P02']);
  }
});

test('retain bounded response notes separately from counts', () => {
  const s = session(); s.responses[0].note = 'The word ending is hard to hear.';
  const result = R.aggregate([s], catalog);
  assert.equal(result.n_ratings, 2); assert.equal(result.notes.length, 1); assert.equal(result.notes[0].system, 'original');
  assert.throws(() => R.validateSession(partial({responses: [{trial_id: 'q1', choice: 'question', note: 'x'.repeat(5001)}]}), catalog), /at most 5000/);
});

test('imports reject invalid JSON, unknown wrapper fields and mixed contexts atomically', () => {
  assert.throws(() => R.importJSON('not json', catalog), /not valid JSON/);
  assert.throws(() => R.importJSON(JSON.stringify({schema_version: 1, build_id: 'build-A', review_context: 'collaborator_preview', sessions: [], gold: 'answer'}), catalog), /unexpected field gold/);
  const existing = [session()];
  assert.throws(() => R.importJSON(JSON.stringify([session({session_id: 'valid'}), session({session_id: 'participant', review_context: 'participant_study'})]), catalog, existing), /participant studies/);
  assert.equal(existing.length, 1);
});

test('render uses text nodes for imported feedback and gives explicit denominators', () => {
  const payload = '<img src=x onerror=alert(1)>';
  const container = renderSummary(R.aggregate([session({feedback: {technical: payload}})], catalog));
  assert.match(container.text, /1\/1 \(100\.0%\)/);
  assert.match(container.text, /One person may have created more than one session/);
  assert.match(container.text, /Compare the responses to the same phrase across speech and text/);
  assert.match(container.text, /help us decide which recordings or questions need another check/);
  assert.match(container.text, /Hearing one version can affect how someone judges the next/);
  assert.doesNotMatch(container.text, /do not establish significance|not recruited-participant results/);
  assert.ok(container.text.includes(payload));
  function tags(node) { return [node.tag, ...node.children.flatMap(tags)]; }
  assert.ok(!tags(container).includes('img'));
});

test('current exported lists and all walkthrough tracks round-trip as complete previews', () => {
  const c = currentCatalog();
  const sessions = [];
  for (const [mode, selections] of [['assigned_list', c.lists], ['cut_walkthrough', c.tracks]]) {
    for (const [selection_id, ids] of selections) {
      const s = session({build_id: c.build_id, session_id: mode + '-' + selection_id, mode, selection_id,
        responses: ids.map((trial_id, order_index) => ({trial_id, order_index, choice: 'unsure'}))});
      sessions.push(s);
      const shorter = ids.map(id => c.byId.get(id).gate);
      assert.ok(shorter.join(',').match(/^(earlier,)*(earlier|later)(,later)*$/));
      assert.deepEqual(R.importJSON(JSON.stringify(s), c), [s]);
    }
  }
  assert.equal(sessions.length, 42);
  assert.equal(R.aggregate(sessions, c).n_ratings, 272);
});

test('phrase review covers all 104 versions once with the agreed per-phrase, cut and system ordering', () => {
  const c = currentCatalog(), rows = c.phraseReviewIds.map(id => c.byId.get(id));
  assert.equal(rows.length, 104); assert.equal(new Set(c.phraseReviewIds).size, 104);
  assert.deepEqual([...new Set(rows.map(row => row.phrase_number))], [1, 2, 3, 4, 5, 6]);
  const mainSystems = ['original', 'omnivoice', 'f5', 'cosyvoice2', 'qwen3_base', 'text'];
  const punctuation = ['omnivoice', 'f5', 'cosyvoice2', 'qwen3_base'].flatMap(system => [system + ':period', system + ':question']);
  for (let phrase = 1; phrase <= 6; phrase++) {
    const group = rows.filter(row => row.phrase_number === phrase), half = group.length / 2;
    assert.ok(group.slice(0, half).every(row => row.gate === 'earlier'));
    assert.ok(group.slice(half).every(row => row.gate === 'later'));
    for (const gate of ['earlier', 'later']) {
      const cut = group.filter(row => row.gate === gate);
      assert.deepEqual(cut.slice(0, 6).map(row => row.system), mainSystems);
      assert.ok(cut.slice(0, 6).every(row => row.analysis_family === 'main'));
      assert.deepEqual(cut.slice(6).map(row => row.system + ':' + row.condition), phrase <= 2 ? punctuation : []);
    }
  }
  const dir = path.join(__dirname, '../review/data'), read = name => JSON.parse(fs.readFileSync(path.join(dir, name + '.json')));
  const stimuli = read('stimuli'), metadata = read('metadata'); stimuli.stimuli.reverse(); metadata.stimuli.reverse();
  assert.deepEqual(R.createCatalog(stimuli, metadata, read('lists')).phraseReviewIds, c.phraseReviewIds);
});

test('phrase mode allows shorter cuts again at the next phrase while retaining strict coverage and resume validation', () => {
  const c = currentCatalog(), s = allPhrases(c);
  assert.deepEqual(R.importJSON(JSON.stringify(s), c), [s]);
  const firstNextPhrase = s.responses.findIndex(response => c.byId.get(response.trial_id).phrase_number === 2);
  assert.equal(c.byId.get(s.responses[firstNextPhrase - 1].trial_id).gate, 'later');
  assert.equal(c.byId.get(s.responses[firstNextPhrase].trial_id).gate, 'earlier');
  const partial = {...s, responses: s.responses.slice(0, firstNextPhrase + 1)}; delete partial.completed_at;
  assert.equal(R.validateSession(partial, c).responses.length, firstNextPhrase + 1);
  assert.throws(() => R.aggregate([partial], c), /Finish this review/);
  assert.throws(() => R.validateSession({...partial, completed_at: s.completed_at}, c), /every trial/);
  assert.throws(() => R.validateSession({...s, selection_id: 'all_phrases_v2'}, c), /Unknown walkthrough/);
  const reordered = clone(s); [reordered.responses[0], reordered.responses[14]] = [reordered.responses[14], reordered.responses[0]];
  assert.throws(() => R.validateSession(reordered, c), /walkthrough set|earlier cut/);
  const duplicate = clone(s); duplicate.responses[1] = duplicate.responses[0];
  assert.throws(() => R.validateSession(duplicate, c), /Duplicate response/);
});

test('phrase summaries keep phrases, cuts and punctuation separate and preserve legacy mode counts', () => {
  const c = currentCatalog(), first = allPhrases(c, {session_id: 'all-first'}), second = allPhrases(c, {session_id: 'all-second'});
  first.responses[0].choice = 'question';
  const old = session({build_id: c.build_id, session_id: 'old-assigned', mode: 'assigned_list', selection_id: 'P01',
    responses: c.lists.get('P01').map(trial_id => ({trial_id, choice: 'unsure'}))});
  const summary = R.aggregate([first, second, old], c), rows = summary.groups.filter(row => row.mode === 'phrase_walkthrough');
  assert.equal(summary.n_ratings, 214); assert.equal(summary.n_sessions, 3);
  assert.equal(rows.length, 104); assert.equal(new Set(rows.map(row => row.phrase_id)).size, 6);
  assert.equal(rows.filter(row => row.analysis_family === 'main').length, 72);
  assert.equal(rows.filter(row => row.analysis_family === 'punctuation').length, 32);
  assert.ok(rows.every(row => row.n_phrases === 1 && row.n_ratings === 2 && row.n_sessions === 2));
  assert.ok(rows.every(row => typeof row.exposed_text === 'string' && row.exposed_text.length > 0));
  const one = rows.find(row => row.phrase_number === 1 && row.system === 'original' && row.gate === 'earlier');
  assert.deepEqual(one.counts, {question: 1, non_question: 0, unsure: 1}); assert.equal(one.proportions.unsure, 0.5);
  const legacy = summary.groups.filter(row => row.mode === 'assigned_list');
  assert.equal(legacy.reduce((n, row) => n + row.n_ratings, 0), 6);
  assert.ok(legacy.every(row => !Object.hasOwn(row, 'phrase_id')));
});

test('phrase result display explains its purpose and keeps each phrase and synthesis comparison inspectable', () => {
  const c = currentCatalog(), input = allPhrases(c);
  input.responses[0].note = 'The final word is unclear.';
  const container = renderSummary(R.aggregate([input], c));
  const visit = node => [node, ...node.children.flatMap(visit)], nodes = visit(container);
  const phrases = nodes.filter(node => node.className === 'results-phrase');
  assert.equal(phrases.length, 6);
  assert.equal(nodes.filter(node => node.className === 'results-cut-words').length, 12);
  for (const [index, phrase] of phrases.entries()) {
    assert.match(phrase.text, new RegExp('Phrase ' + (index + 1)));
    assert.ok(phrase.text.indexOf('Shorter cut') < phrase.text.indexOf('Longer cut'));
    assert.match(phrase.text, /Original speech, neutral synthesis and text/);
    assert.match(phrase.text, /Gated text/);
    for (const gate of ['earlier', 'later']) {
      const reference = [...c.byId.values()].find(row => row.phrase_number === index + 1 && row.gate === gate);
      assert.ok(phrase.text.includes(reference.exposed_text));
    }
    if (index < 2) assert.match(phrase.text, /Period and question-mark synthesis/);
    else assert.doesNotMatch(phrase.text, /Period and question-mark synthesis/);
  }
  assert.match(container.text, /Use these comparisons to prepare the participant pilot/);
  assert.match(container.text, /104 ratings from 1 completed review/);
  assert.match(container.text, /1\/1 \(100\.0%\)/);
  assert.match(container.text, /The final word is unclear/);
  assert.equal(container.children.findIndex(node => node.tag === 'details') > container.children.findIndex(node => node.textContent.includes('Compare the responses to the same phrase')), true);
});
