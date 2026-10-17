'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const review = path.join(__dirname, '../review');
const read = name => fs.readFileSync(path.join(review, name), 'utf8');
const manifest = JSON.parse(read('data/stimuli.json'));
const metadata = JSON.parse(read('data/metadata.json'));
const lists = JSON.parse(read('data/lists.json'));
const storageKey = 'candor_shared_review_v1_' + manifest.build_id;
const byTrial = new Map(manifest.stimuli.map(t => [t.trial_id, t]));
let nextId = 0;

class Element {
  constructor(tag, doc) {
    this.tagName = tag.toUpperCase(); this.ownerDocument = doc; this.children = [];
    this.attributes = {}; this.hidden = false; this.disabled = false; this.value = ''; this._text = '';
    this.files = []; this.loadCount = 0; this.pauseCount = 0;
  }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set textContent(value) { this._text = String(value); this.children = []; }
  append(...children) {
    for (const child of children) {
      this.children.push(child);
      if (this.tagName === 'SELECT' && this.children.length === 1) this.value = child.value;
    }
  }
  appendChild(child) { this.append(child); return child; }
  replaceChildren(...children) { this.children = []; this._text = ''; this.append(...children); }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return key === 'src' ? this.src || null : this.attributes[key] || null; }
  removeAttribute(key) { delete this.attributes[key]; if (key === 'src') this.src = ''; }
  pause() { this.pauseCount++; }
  load() { this.loadCount++; }
  click() { if (!this.disabled && this.onclick) return this.onclick(); }
  set innerHTML(_) { throw new Error('Unsafe HTML in app test'); }
}
function storage(seed) {
  const data = new Map(); if (seed) data.set(storageKey, JSON.stringify(seed));
  return {data, failWrites: false, getItem: key => data.get(key) || null,
    setItem(key, value) { if (this.failWrites) throw new Error('QuotaExceededError'); data.set(key, String(value)); }};
}
function oldSession(id, listId, hour, answerCount = 0, complete = false) {
  const list = lists.lists.find(l => l.list_id === listId);
  const value = {schema_version: 1, build_id: manifest.build_id, review_context: 'collaborator_preview',
    session_id: id, mode: 'assigned_list', selection_id: listId, started_at: `2026-10-17T${hour}:00:00.000Z`,
    prior_results_viewed: false, prior_stimulus_exposure: false,
    responses: list.stimulus_ids.slice(0, answerCount).map((trial_id, order_index) => ({trial_id, order_index, choice: 'unsure'}))};
  if (complete) { value.completed_at = `2026-10-17T${hour}:10:00.000Z`; value.feedback = {instructions: 'Earlier review retained'}; }
  return value;
}
function oldStore(overrides = {}) { return {sessions: [], imports: [], drafts: {}, resultsViewed: false, seenStimuli: [], sessionExposure: {}, ...overrides}; }
async function boot(saved = storage(), search = '', random = 0.37) {
  const elements = new Map();
  const document = {getElementById: id => { if (!elements.has(id)) throw Error('Unknown DOM ID ' + id); return elements.get(id); },
    createElement: tag => new Element(tag, document)};
  for (const match of read('index.html').matchAll(/<([a-z][a-z0-9]*)\b[^>]*\bid="([^"]+)"[^>]*>/g)) {
    const node = new Element(match[1], document); node.hidden = /\bhidden(?:\s|>)/.test(match[0]);
    node.disabled = /\bdisabled(?:\s|>)/.test(match[0]); elements.set(match[2], node);
    for (const attr of match[0].matchAll(/([\w-]+)="([^"]*)"/g)) node.setAttribute(attr[1], attr[2]);
  }
  let ticks = 0;
  const initial = new URL('https://example.test/candor-audibility-study/review/' + search);
  const location = {pathname: initial.pathname, search: initial.search, hash: initial.hash, href: initial.href};
  const history = {calls: [], replaceState(state, title, address) {
    this.calls.push(address); const next = new URL(address, location.href);
    Object.assign(location, {pathname: next.pathname, search: next.search, hash: next.hash, href: next.href});
  }};
  class BrowserURL extends URL { static createObjectURL() { return 'blob:mock'; } static revokeObjectURL() {} }
  const sandbox = {document, localStorage: saved, location, history, console,
    window: {scrollTo() {}, location, history}, URLSearchParams, Blob, URL: BrowserURL,
    crypto: {randomUUID: () => 'test-session-' + (++nextId), getRandomValues: bytes => { bytes.fill(Math.floor(random * 0xffffffff)); return bytes; }},
    performance: {now: () => ++ticks}, setTimeout() {}};
  const context = vm.createContext(sandbox);
  const parseInPage = vm.runInContext('JSON.parse', context);
  vm.runInContext('Math.random = () => ' + random, context);
  sandbox.fetch = async url => ({ok: true, json: async () => parseInPage(read(url))});
  vm.runInContext(read('results.js'), context, {filename: 'results.js'});
  await vm.runInContext(read('app.js'), context, {filename: 'app.js'});
  const $ = id => document.getElementById(id);
  if (!saved.failWrites) assert.equal($('error').hidden, true, $('error').textContent);
  const getState = () => JSON.parse(saved.getItem(storageKey));
  function startTrack(id) { $('track').value = id; $('start-track').click(); }
  function startPreview() { $('start-assigned').click(); }
  function choose(index = 2) { $('choices').children[index].click(); }
  function play() { $('audio').onplay(); }
  function end() { $('audio').onended(); }
  function answer() { choose(); if (!$('audio').hidden) { play(); end(); } $('save-next').click(); }
  function finishText() {
    startTrack('main_text_text');
    while (!$('trial').hidden) answer();
    $('finish').click(); assert.equal($('complete').hidden, false, $('error').textContent);
  }
  return {$, saved, getState, startTrack, startPreview, choose, play, end, answer, finishText, location, history};
}

test('visitor markup has one preview start and keeps material choices off the main page', () => {
  const html = read('index.html');
  assert.match(html, /<title>Speech continuation user study preview<\/title>/);
  assert.match(html, /<h1 id="home-title">Speech continuation user study preview<\/h1>/);
  assert.doesNotMatch(html, /id="(?:list|gate|phase-note)"/);
  assert.doesNotMatch(html, /Collaborator preview|Shorter cuts always come first|There is no correct-answer feedback|About 2 minutes/);
  assert.equal((html.match(/id="start-assigned"/g) || []).length, 1);
  assert.match(html, /id="materials-link"[^>]*href="\?view=materials"|href="\?view=materials"[^>]*id="materials-link"/);
  assert.match(html, /id="materials"/);
});

test('new visitors get a valid stable assignment without creating an answered or unfinished session', async () => {
  const saved = storage(); const first = await boot(saved, '', 0.02);
  const assignment = first.getState().previewListId;
  assert.equal(first.$('start-assigned').textContent, 'Start preview');
  assert.ok(lists.lists.some(l => l.list_id === assignment));
  assert.equal(first.getState().sessions.length, 0); assert.equal(first.$('home').hidden, false);
  const reloaded = await boot(saved, '', 0.98);
  assert.equal(reloaded.getState().previewListId, assignment);
  reloaded.startPreview(); assert.equal(reloaded.getState().sessions[0].selection_id, assignment);
});

test('explicit valid URL list wins over unfinished and stored assignments', async () => {
  const old = oldSession('unfinished', 'P02', '09', 1);
  const saved = storage(oldStore({sessions: [old], previewListId: 'P03'}));
  const page = await boot(saved, '?list=P01'); page.startPreview();
  assert.equal(page.getState().sessions.at(-1).selection_id, 'P01');
  assert.deepEqual(page.getState().sessions.find(s => s.session_id === old.session_id), old);
});

test('latest unfinished assignment wins even with zero answers and a different stored list', async () => {
  const older = oldSession('older', 'P01', '08', 1), latest = oldSession('latest-zero', 'P02', '09', 0);
  const page = await boot(storage(oldStore({sessions: [older, latest], previewListId: 'P03'})), '?list=invalid');
  page.startPreview(); assert.equal(page.$('progress').textContent, 'Item 1 of 6');
  const state = page.getState(); assert.equal(state.sessions.length, 2);
  assert.equal(state.previewListId, 'P02');
  page.answer(); assert.equal(page.getState().sessions.find(s => s.session_id === latest.session_id).responses.length, 1);
  assert.equal(page.getState().sessions.find(s => s.session_id === older.session_id).responses.length, 1);
});

test('most recent unfinished session of the selected list resumes, preserving older sessions', async () => {
  const newer = oldSession('newer-same-list', 'P01', '10', 2), older = oldSession('older-same-list', 'P01', '08', 1);
  const page = await boot(storage(oldStore({sessions: [older, newer], drafts: {[newer.session_id]: {note: 'Latest draft'}}})), '?list=P01');
  page.startPreview(); assert.equal(page.$('progress').textContent, 'Item 3 of 6');
  assert.equal(page.$('clip-note').value, 'Latest draft'); page.answer();
  assert.equal(page.getState().sessions.find(s => s.session_id === newer.session_id).responses.length, 3);
  assert.deepEqual(page.getState().sessions.find(s => s.session_id === older.session_id), older);
});

test('old unfinished reviews without timestamps resume by array order without rewriting their records', async () => {
  const older = oldSession('legacy-first', 'P01', '08', 0), latest = oldSession('legacy-last', 'P01', '09', 1);
  delete older.started_at; delete latest.started_at;
  const page = await boot(storage(oldStore({sessions: [older, latest], drafts: {[latest.session_id]: {note: 'Legacy draft'}}})));
  assert.equal(page.$('start-assigned').textContent, 'Resume preview');
  page.startPreview();
  assert.equal(page.$('progress').textContent, 'Item 2 of 6');
  assert.equal(page.$('clip-note').value, 'Legacy draft');
  assert.deepEqual(page.getState().sessions, [older, latest]);
  assert.equal(page.getState().sessions.some(s => Object.hasOwn(s, 'started_at')), false);
});

test('all answers awaiting feedback resume at feedback rather than creating another session', async () => {
  const waiting = oldSession('awaiting-feedback', 'P02', '11', 6);
  const saved = storage(oldStore({sessions: [waiting], previewListId: 'P01', drafts: {[waiting.session_id]: {feedback: {instructions: 'Draft feedback retained'}}}}));
  const page = await boot(saved); page.startPreview();
  assert.equal(page.$('feedback').hidden, false); assert.equal(page.$('trial').hidden, true);
  assert.equal(page.$('feedback-instructions').value, 'Draft feedback retained');
  assert.equal(page.getState().sessions.length, 1); assert.equal(page.getState().sessions[0].completed_at, undefined);
});

test('old completed reviews, imported files, and unrelated drafts survive automatic assignment', async () => {
  const completed = oldSession('old-completed', 'P01', '08', 6, true), imported = oldSession('old-imported', 'P02', '09', 6, true);
  const drafts = {'unrelated-draft': {note: 'Retain this note'}};
  const saved = storage(oldStore({sessions: [completed], imports: [imported], drafts}));
  const page = await boot(saved); assert.equal(page.$('saved-results').hidden, false);
  assert.deepEqual(page.getState().sessions, [completed]); assert.deepEqual(page.getState().imports, [imported]);
  assert.deepEqual(page.getState().drafts, drafts);
  page.startPreview(); assert.equal(page.getState().sessions.length, 2);
  assert.equal(Object.hasOwn(page.getState().sessions[1], 'previewListId'), false);
  assert.deepEqual(page.getState().sessions[0], completed); assert.deepEqual(page.getState().imports, [imported]);
});

test('material and results routes override list links; legacy set links reach materials without starting a review', async () => {
  const materials = await boot(storage(), '?view=materials&list=P01');
  assert.equal(materials.$('materials').hidden, false); assert.equal(materials.$('home').hidden, true);
  assert.equal(materials.$('home-link').href, '?list=P01');
  assert.equal(materials.getState()?.sessions.length || 0, 0);
  materials.$('materials-home').click(); assert.equal(materials.$('home').hidden, false);
  assert.notEqual(new URLSearchParams(materials.location.search).get('view'), 'materials');
  assert.equal(new URLSearchParams(materials.location.search).get('list'), 'P01');
  materials.startPreview(); assert.equal(materials.getState().sessions[0].selection_id, 'P01');
  const results = await boot(storage(), '?view=results&list=P01');
  assert.equal(results.$('results').hidden, false); assert.equal(results.getState().sessions.length, 0);
  assert.equal(results.getState().resultsViewed, true);
  const legacy = await boot(storage(), '?set=main_text_text');
  assert.equal(legacy.$('materials').hidden, false); assert.equal(legacy.$('track').value, 'main_text_text');
  assert.equal(legacy.$('home-link').href, './');
  assert.equal(legacy.getState()?.sessions.length || 0, 0);
});

test('opening transcript details is recorded as exposure when an unfinished preview resumes', async () => {
  const unfinished = oldSession('before-materials', 'P01', '11', 1);
  const page = await boot(storage(oldStore({sessions: [unfinished]})), '?view=materials');
  page.$('material-details').open = true; page.$('material-details').ontoggle();
  assert.equal(page.getState().materialsViewed, true);
  assert.equal(page.getState().seenStimuli.length, manifest.stimuli.length);
  page.$('materials-home').click(); page.startPreview();
  assert.equal(page.getState().sessions[0].prior_stimulus_exposure, true);
  assert.equal(page.getState().sessions[0].prior_results_viewed, false);
  assert.equal(page.$('progress').textContent, 'Item 2 of 6');
});

test('analysis-only route imports completed files without creating a review or inventing judgments', async () => {
  const exported = JSON.stringify(oldSession('external-review', 'P01', '10', 6, true));
  const page = await boot(storage(), '?view=materials'); page.$('analyse-files').click();
  assert.equal(page.$('results').hidden, false); assert.equal(page.getState().sessions.length, 0);
  assert.equal(new URLSearchParams(page.location.search).get('view'), 'results');
  page.$('imports').files = [{size: exported.length, text: async () => exported}]; await page.$('imports').onchange();
  assert.equal(page.getState().imports.length, 1); assert.match(page.$('result-content').textContent, /6 ratings from 1 completed review/);
  assert.equal(page.getState().sessions.length, 0);
  const reloaded = await boot(page.saved); assert.equal(reloaded.$('saved-results').hidden, false);
  assert.deepEqual(reloaded.getState().imports, [JSON.parse(exported)]);
});

test('audio requires a choice and a full playback before advancing; playback is never automatic', async () => {
  const page = await boot(storage(), '?view=materials'); page.startTrack('main_original_original'); const {$} = page;
  assert.equal($('audio').hidden, false); assert.equal($('save-next').disabled, true);
  assert.equal($('footer').hidden, true);
  page.choose(); assert.equal($('save-next').disabled, true); $('save-next').onclick();
  assert.equal($('progress').textContent, 'Item 1 of 12'); assert.equal(page.getState().seenStimuli.length, 0);
  page.play(); assert.equal($('save-next').disabled, true); page.end(); assert.equal($('save-next').disabled, false);
  $('save-next').click(); assert.equal($('progress').textContent, 'Item 2 of 12');
  const response = page.getState().sessions[0].responses[0];
  assert.equal(response.audio_started, true); assert.equal(response.audio_ended, true);
  assert.equal(response.order_index, 0); assert.equal($('results').hidden, true);
});

test('a saved partial review resumes automatically at its next item with the draft note intact', async () => {
  const saved = storage(); const first = await boot(saved, '?list=P01'); first.startPreview(); first.answer();
  first.$('clip-note').value = 'Draft note for the next clip'; first.$('clip-note').oninput(); const prior = first.getState().sessions[0];
  const reloaded = await boot(saved); assert.equal(reloaded.$('start-assigned').textContent, 'Resume preview'); reloaded.startPreview();
  assert.equal(reloaded.$('progress').textContent, 'Item 2 of 6'); assert.equal(reloaded.$('clip-note').value, 'Draft note for the next clip');
  assert.equal(reloaded.getState().sessions.length, 1); assert.equal(reloaded.getState().sessions[0].session_id, prior.session_id);
  assert.deepEqual(reloaded.getState().sessions[0].responses, prior.responses);
  assert.equal(reloaded.getState().sessions[0].prior_stimulus_exposure, false);
});

test('resuming records exposure in another unfinished review even without an answer there', async () => {
  const page = await boot(storage(), '?list=P01'); page.startPreview(); page.answer(); page.$('pause').click();
  page.startTrack('main_original_original'); page.play(); page.$('pause').click();
  const other = page.getState().sessions.find(s => s.mode === 'cut_walkthrough'); assert.equal(other.responses.length, 0);
  page.startPreview(); const resumed = page.getState().sessions.find(s => s.mode === 'assigned_list');
  assert.equal(resumed.prior_stimulus_exposure, true); assert.equal(resumed.prior_results_viewed, false);
  assert.equal(page.$('progress').textContent, 'Item 2 of 6');
});

test('resuming after another completed review and its results records results exposure', async () => {
  const page = await boot(storage(), '?list=P01'); page.startPreview(); page.answer(); page.$('pause').click();
  page.finishText(); page.$('show-results').click(); assert.equal(page.$('results').hidden, false, page.$('error').textContent);
  page.$('results-home').click(); page.startPreview(); const resumed = page.getState().sessions.find(s => s.mode === 'assigned_list');
  assert.equal(resumed.prior_results_viewed, true); assert.equal(resumed.prior_stimulus_exposure, true);
  assert.equal(resumed.responses.length, 1); assert.equal(page.$('results').hidden, true);
});

test('selected list preserves exact trial assignment and shorter-prefix ordering without on-screen gate labels', async () => {
  const selected = lists.lists.find(l => l.stimulus_ids.some(id => byTrial.get(id).gate === 'later'));
  const page = await boot(storage(), '?list=' + selected.list_id); page.startPreview();
  for (let index = 0; index < 6; index++) { assert.equal(page.$('progress').textContent, 'Item ' + (index + 1) + ' of 6'); page.answer(); }
  assert.equal(page.$('feedback').hidden, false); assert.equal(page.$('complete').hidden, true);
  assert.equal(page.$('footer').hidden, true);
  const ids = page.getState().sessions[0].responses.map(r => r.trial_id); assert.deepEqual(ids, selected.stimulus_ids);
  const gates = ids.map(id => byTrial.get(id).gate); assert.ok(!gates.slice(gates.indexOf('later')).includes('earlier'));
});

test('gated text still gives twelve matching prefixes, six shorter first, without audio', async () => {
  const page = await boot(storage(), '?view=materials'); page.startTrack('main_text_text'); const words = [];
  for (let index = 0; index < 12; index++) {
    assert.equal(page.$('audio').hidden, true); assert.equal(page.$('words').hidden, false);
    assert.equal(page.$('audio').getAttribute('src'), null); words.push(page.$('words').textContent);
    page.choose(); assert.equal(page.$('save-next').disabled, false); page.$('save-next').click();
  }
  const responses = page.getState().sessions[0].responses, trials = responses.map(r => byTrial.get(r.trial_id));
  assert.deepEqual(trials.map(t => t.gate), [...Array(6).fill('earlier'), ...Array(6).fill('later')]);
  assert.deepEqual(words, trials.map(t => t.text)); assert.ok(responses.every(r => !r.audio_started && !r.audio_ended));
  const textIds = metadata.stimuli.filter(m => m.system === 'text').map(m => m.stimulus_id).sort();
  assert.deepEqual(responses.map(r => r.trial_id).sort(), textIds); assert.equal(page.$('feedback').hidden, false);
});

test('quota failures remain visible through task, feedback and completion without claiming a saved review', async () => {
  const saved = storage(); saved.failWrites = true; const page = await boot(saved, '?view=materials'); page.startTrack('main_text_text');
  assert.equal(page.$('error').hidden, false); assert.match(page.$('error').textContent, /only in this open page/);
  assert.notEqual(page.$('save-state').textContent, 'Saved on this device');
  for (let index = 0; index < 12; index++) page.answer();
  assert.equal(page.$('feedback').hidden, false); assert.equal(page.$('error').hidden, false); page.$('finish').click();
  assert.equal(page.$('complete').hidden, false); assert.equal(page.$('error').hidden, false);
  assert.equal(page.$('complete-status').textContent, 'Download now to keep your review'); assert.equal(saved.data.size, 0);
});
