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
  class Element {
    constructor(tag, doc) { this.tag = tag; this.ownerDocument = doc; this.children = []; this.textContent = ''; this.attrs = {}; }
    appendChild(child) { this.children.push(child); }
    replaceChildren() { this.children = []; }
    setAttribute(key, value) { this.attrs[key] = value; }
    set innerHTML(_) { throw new Error('Unsafe innerHTML'); }
    get text() { return this.textContent + ' ' + this.children.map(child => child.text).join(' '); }
  }
  const doc = {createElement(tag) { return new Element(tag, this); }}, container = new Element('div', doc);
  const payload = '<img src=x onerror=alert(1)>';
  R.render(container, R.aggregate([session({feedback: {technical: payload}})], catalog));
  assert.match(container.text, /1\/1 \(100\.0%\)/);
  assert.match(container.text, /One person may have created more than one session/);
  assert.match(container.text, /not recruited-participant results/);
  assert.ok(container.text.includes(payload));
  function tags(node) { return [node.tag, ...node.children.flatMap(tags)]; }
  assert.ok(!tags(container).includes('img'));
});

test('current exported lists and all walkthrough tracks round-trip as complete previews', () => {
  const dir = path.join(__dirname, '../review/data');
  const read = name => JSON.parse(fs.readFileSync(path.join(dir, name + '.json')));
  const c = R.createCatalog(read('stimuli'), read('metadata'), read('lists'));
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
