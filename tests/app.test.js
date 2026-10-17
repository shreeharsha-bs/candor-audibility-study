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
const byMeta = new Map(metadata.stimuli.map(t => [t.stimulus_id, t]));
let nextId = 0;

class Element {
  constructor(tag, doc) {
    this.tagName = tag.toUpperCase(); this.ownerDocument = doc; this.children = [];
    this.attributes = {}; this.hidden = false; this.disabled = false; this.value = ''; this._text = '';
    this.files = []; this.loadCount = 0; this.pauseCount = 0; this.dataset = {};
  }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set textContent(value) { this._text = String(value); this.children = []; }
  append(...children) {
    for (const child of children) {
      this.children.push(child);
      child.parentElement = this;
      if (this.tagName === 'SELECT' && this.children.length === 1) this.value = child.value;
    }
  }
  appendChild(child) { this.append(child); return child; }
  replaceChildren(...children) { this.children = []; this._text = ''; this.append(...children); }
  setAttribute(key, value) { this.attributes[key] = String(value); if (key === 'class') this.className = String(value); if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value); }
  getAttribute(key) { return key === 'src' ? this.src || null : key === 'class' ? this.className || null : key.startsWith('data-') ? this.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] || this.attributes[key] || null : this.attributes[key] || null; }
  removeAttribute(key) { delete this.attributes[key]; if (key === 'src') this.src = ''; }
  pause() { this.pauseCount++; }
  load() { this.loadCount++; }
  click() { if (!this.disabled && this.onclick) return this.onclick(); }
  addEventListener(name, handler) { this['on' + name] = handler; }
  querySelectorAll(selector) { return descendants(this).filter(el => matches(el, selector)); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  set innerHTML(_) { throw new Error('Unsafe HTML in app test'); }
}
function descendants(root) { return root.children.flatMap(child => [child, ...descendants(child)]); }
function matches(el, selector) {
  if (selector.includes(',')) return selector.split(',').some(part => matches(el, part.trim()));
  const parts = selector.trim().split(/\s+/); const last = parts.pop();
  const attr = last.match(/^\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]$/);
  const own = last.startsWith('.') ? String(el.className || '').split(/\s+/).includes(last.slice(1))
    : last.startsWith('#') ? el.getAttribute('id') === last.slice(1)
    : attr ? el.getAttribute(attr[1]) !== null && (attr[2] === undefined || el.getAttribute(attr[1]) === attr[2])
    : last === '*' || el.tagName.toLowerCase() === last.toLowerCase();
  if (!own || !parts.length) return own;
  let parent = el.parentElement; while (parent) { if (matches(parent, parts.join(' '))) return true; parent = parent.parentElement; }
  return false;
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
    createElement: tag => new Element(tag, document),
    querySelectorAll: selector => [...new Set([...elements.values()].flatMap(el => [el, ...descendants(el)]))].filter(el => matches(el, selector)),
    querySelector: selector => document.querySelectorAll(selector)[0] || null};
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
  const downloads = [], requests = [];
  class BrowserURL extends URL { static createObjectURL(blob) { downloads.push(blob); return 'blob:mock'; } static revokeObjectURL() {} }
  const sandbox = {document, localStorage: saved, location, history, console,
    window: {scrollTo() {}, location, history}, URLSearchParams, Blob, URL: BrowserURL,
    crypto: {randomUUID: () => 'test-session-' + (++nextId), getRandomValues: bytes => { bytes.fill(Math.floor(random * 0xffffffff)); return bytes; }},
    performance: {now: () => ++ticks}, setTimeout() {}};
  const context = vm.createContext(sandbox);
  const parseInPage = vm.runInContext('JSON.parse', context);
  vm.runInContext('Math.random = () => ' + random, context);
  sandbox.fetch = async (url, options) => { requests.push({url, options}); return {ok: true, json: async () => parseInPage(read(url))}; };
  vm.runInContext(read('results.js'), context, {filename: 'results.js'});
  await vm.runInContext(read('app.js'), context, {filename: 'app.js'});
  const $ = id => document.getElementById(id);
  if (!saved.failWrites) assert.equal($('error').hidden, true, $('error').textContent);
  const getState = () => JSON.parse(saved.getItem(storageKey));
  function startTrack(id) { $('track').value = id; $('start-track').click(); }
  function startPreview() { $('start-assigned').click(); }
  function resumeList(id) { $('legacy-list').value = id; $('resume-list').click(); }
  function choose(index = 2) { $('choices').children[index].click(); }
  function play() { $('audio').onplay(); }
  function end() { $('audio').onended(); }
  function answer() { choose(); if (!$('audio').hidden) { play(); end(); } $('save-next').click(); }
  function finishText() {
    startTrack('main_text_text');
    while (!$('trial').hidden) answer();
    $('finish').click(); assert.equal($('complete').hidden, false, $('error').textContent);
  }
  function cards() { return $('phrase-content').querySelectorAll('.version-card'); }
  function rateCard(card, choice = 2, playAudio = true) {
    const audio = card.querySelector('audio');
    if (audio && playAudio) { audio.onplay(); audio.onended(); }
    card.querySelector('.choices').children[choice].click();
  }
  function rateGroup() { for (const card of cards()) rateCard(card); $('phrase-next').click(); }
  return {$, saved, getState, startTrack, startPreview, resumeList, choose, play, end, answer, finishText, location, history, cards, rateCard, rateGroup, downloads, requests};
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

test('default Start begins all versions without creating a session merely by visiting', async () => {
  const saved = storage(); const page = await boot(saved);
  assert.equal(page.$('home').hidden, false);
  assert.equal(page.getState()?.sessions.length || 0, 0);
  page.startPreview();
  const session = page.getState().sessions[0];
  assert.equal(session.mode, 'phrase_walkthrough'); assert.equal(session.selection_id, 'all_phrases_v1');
  assert.equal(session.responses.length, 0); assert.equal(page.$('phrase-trial').hidden, false);
  assert.equal(page.$('trial').hidden, true);
});

test('explicit valid URL list wins over unfinished and stored assignments', async () => {
  const old = oldSession('unfinished', 'P02', '09', 1);
  const saved = storage(oldStore({sessions: [old], previewListId: 'P03'}));
  const page = await boot(saved, '?list=P01'); page.startPreview();
  assert.equal(page.getState().sessions.at(-1).selection_id, 'P01');
  assert.deepEqual(page.getState().sessions.find(s => s.session_id === old.session_id), old);
});

test('old random assignments and unfinished six-item lists do not replace the all-versions default', async () => {
  const older = oldSession('older', 'P01', '08', 1), latest = oldSession('latest-zero', 'P02', '09', 0);
  const page = await boot(storage(oldStore({sessions: [older, latest], previewListId: 'P03'})), '?list=invalid');
  page.startPreview();
  const state = page.getState(); assert.equal(state.sessions.length, 3);
  assert.deepEqual(state.sessions.slice(0, 2), [older, latest]);
  assert.equal(state.sessions[2].mode, 'phrase_walkthrough'); assert.equal(state.sessions[2].selection_id, 'all_phrases_v1');
});

test('materials selector resumes an older list while the plain default URL still opens all versions', async () => {
  const old = oldSession('unfinished-zero', 'P02', '09', 0);
  const page = await boot(storage(oldStore({sessions: [old], previewListId: 'P03'})), '?view=materials');
  page.resumeList('P02'); assert.equal(page.$('progress').textContent, 'Item 1 of 6');
  assert.equal(page.getState().sessions.length, 1); page.answer();
  assert.equal(page.getState().sessions[0].responses.length, 1);
  const defaultPage = await boot(page.saved); defaultPage.startPreview();
  assert.equal(defaultPage.getState().sessions.at(-1).mode, 'phrase_walkthrough');
  assert.equal(defaultPage.getState().sessions[0].responses.length, 1);
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
  const page = await boot(storage(oldStore({sessions: [older, latest], drafts: {[latest.session_id]: {note: 'Legacy draft'}}})), '?list=P01');
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
  const page = await boot(saved, '?list=P02'); page.startPreview();
  assert.equal(page.$('feedback').hidden, false); assert.equal(page.$('trial').hidden, true);
  assert.equal(page.$('feedback-instructions').value, 'Draft feedback retained');
  assert.equal(page.getState().sessions.length, 1); assert.equal(page.getState().sessions[0].completed_at, undefined);
});

test('old completed reviews, imports and unrelated drafts survive the all-versions default', async () => {
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
  const page = await boot(storage(oldStore({sessions: [unfinished]})), '?view=materials&list=P01');
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
  const reloaded = await boot(saved, '?list=P01'); assert.equal(reloaded.$('start-assigned').textContent, 'Resume preview'); reloaded.startPreview();
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

test('first phrase card group contains every shorter version and no longer audio or text', async () => {
  const page = await boot(); page.startPreview();
  assert.match(page.$('phrase-progress').textContent, /Phrase\s*1\s*of\s*6.*Shorter/i);
  assert.match(page.$('phrase-content').textContent, /Punctuation versions/);
  const sections = page.$('phrase-content').children;
  assert.equal(sections.length, 2);
  assert.equal(sections[0].querySelectorAll('.version-card').length, 6);
  assert.equal(sections[1].querySelectorAll('.version-card').length, 8);
  const cards = page.cards(); assert.equal(cards.length, 14);
  const ids = cards.map(c => c.getAttribute('data-trial-id'));
  assert.equal(new Set(ids).size, 14);
  const rows = ids.map(id => byTrial.get(id));
  assert.ok(rows.every(t => t.phrase_number === 1 && t.gate === 'earlier'));
  assert.equal(ids.filter(id => byMeta.get(id).analysis_family === 'main').length, 6);
  assert.equal(ids.filter(id => byMeta.get(id).analysis_family === 'punctuation').length, 8);
  for (const card of cards) {
    const t = byTrial.get(card.getAttribute('data-trial-id'));
    if (t.modality === 'audio') {
      assert.equal(card.querySelectorAll('audio').length, 1);
      assert.equal(card.querySelector('audio').src, t.audio_url);
    } else {
      assert.equal(card.querySelectorAll('audio').length, 0);
      assert.ok(card.textContent.includes(t.text));
    }
  }
  assert.equal(page.$('phrase-next').disabled, true);
  assert.equal(page.getState().sessions[0].responses.length, 0);
});

test('group advancement requires a separate choice and completed playback for every audio version', async () => {
  const page = await boot(); page.startPreview(); const cards = page.cards();
  for (const card of cards) page.rateCard(card, 2, false);
  assert.equal(page.$('phrase-next').disabled, true);
  page.$('phrase-next').onclick(); assert.equal(page.getState().sessions[0].responses.length, 0);
  const audioCards = cards.filter(c => c.querySelector('audio'));
  for (const card of audioCards.slice(0, -1)) { const a = card.querySelector('audio'); a.onplay(); a.onended(); }
  assert.equal(page.$('phrase-next').disabled, true);
  const last = audioCards.at(-1).querySelector('audio'); last.onplay();
  assert.equal(page.$('phrase-next').disabled, true); last.onended();
  assert.equal(page.$('phrase-next').disabled, false); page.$('phrase-next').click();
  assert.equal(page.getState().sessions[0].responses.length, 14);
  assert.match(page.$('phrase-progress').textContent, /Phrase\s*1\s*of\s*6.*Longer/i);
  assert.ok(page.cards().every(c => byTrial.get(c.getAttribute('data-trial-id')).gate === 'later'));
});

test('switching recordings pauses the previous player without letting a stale play event pause the new one', async () => {
  const page = await boot(); page.startPreview();
  const [first, second] = page.cards().map(card => card.querySelector('audio')).filter(Boolean);
  first.onplay();
  const priorPauses = first.pauseCount;
  second.onplay();
  assert.equal(first.pauseCount, priorPauses + 1);
  first.paused = true;
  const secondPauses = second.pauseCount;
  first.onplay();
  assert.equal(second.pauseCount, secondPauses);
});

test('out-of-order card drafts and notes survive pause and reload without being committed twice', async () => {
  const saved = storage(); const first = await boot(saved); first.startPreview();
  const cards = first.cards(); const last = cards.at(-1); const lastId = last.getAttribute('data-trial-id');
  first.rateCard(last, 0); const note = last.querySelector('textarea'); note.value = 'Please check this ending'; note.oninput();
  const sessionId = first.getState().sessions[0].session_id;
  assert.equal(first.getState().sessions[0].responses.length, 0);
  first.$('phrase-pause').click(); assert.equal(first.$('home').hidden, false);
  const resumed = await boot(saved); resumed.startPreview();
  assert.equal(resumed.getState().sessions.length, 1);
  assert.equal(resumed.getState().sessions[0].session_id, sessionId);
  const restored = resumed.cards().find(c => c.getAttribute('data-trial-id') === lastId);
  assert.equal(restored.querySelector('textarea').value, 'Please check this ending');
  assert.equal(restored.querySelector('.choices').children[0].getAttribute('aria-pressed'), 'true');
  const expectedOrder = resumed.cards().map(c => c.getAttribute('data-trial-id'));
  for (const card of resumed.cards().filter(c => c !== restored).reverse()) resumed.rateCard(card);
  assert.equal(resumed.$('phrase-next').disabled, false); resumed.$('phrase-next').click();
  const records = resumed.getState().sessions[0].responses;
  assert.deepEqual(records.map(r => r.trial_id), expectedOrder);
  assert.deepEqual(records.map(r => r.order_index), Array.from({length: 14}, (_, i) => i));
  assert.equal(records.find(r => r.trial_id === lastId).note, 'Please check this ending');
  assert.equal(resumed.getState().sessions[0].prior_stimulus_exposure, false);
});

test('all phrases finish with all 104 presentations exactly once and export as one compatible review', async () => {
  const page = await boot(); page.startPreview(); const groupKeys = [], allIds = [];
  for (let index = 0; index < 12; index++) {
    assert.equal(page.$('phrase-trial').hidden, false, page.$('error').textContent);
    const ids = page.cards().map(c => c.getAttribute('data-trial-id'));
    const rows = ids.map(id => byTrial.get(id));
    const expectedPhrase = Math.floor(index / 2) + 1, expectedGate = index % 2 ? 'later' : 'earlier';
    assert.ok(rows.every(t => t.phrase_number === expectedPhrase && t.gate === expectedGate));
    assert.equal(rows.length, expectedPhrase <= 2 ? 14 : 6);
    groupKeys.push(expectedPhrase + ':' + expectedGate); allIds.push(...ids); page.rateGroup();
  }
  assert.equal(page.$('feedback').hidden, false); assert.equal(page.$('phrase-trial').hidden, true);
  assert.equal(allIds.length, 104); assert.equal(new Set(allIds).size, 104);
  assert.deepEqual([...allIds].sort(), manifest.stimuli.map(t => t.trial_id).sort());
  const pending = metadata.stimuli.filter(t => t.pending_endpoint).map(t => t.stimulus_id);
  assert.equal(pending.length, 3); assert.ok(pending.every(id => allIds.includes(id)));
  const waiting = page.getState().sessions[0]; assert.equal(waiting.completed_at, undefined);
  assert.equal(waiting.responses.length, 104); assert.equal(waiting.mode, 'phrase_walkthrough');
  assert.equal(waiting.responses.filter(r => byTrial.get(r.trial_id).modality === 'audio').length, 92);
  assert.equal(waiting.responses.filter(r => byMeta.get(r.trial_id).analysis_family === 'punctuation').length, 32);
  for (const response of waiting.responses) {
    const audio = byTrial.get(response.trial_id).modality === 'audio';
    assert.equal(response.audio_started, audio); assert.equal(response.audio_ended, audio);
  }
  const reloaded = await boot(page.saved); reloaded.startPreview();
  assert.equal(reloaded.$('feedback').hidden, false); assert.equal(reloaded.getState().sessions.length, 1);
  reloaded.$('feedback-short').value = 'Both cuts were useful'; reloaded.$('feedback-short').oninput();
  reloaded.$('finish').click(); assert.equal(reloaded.$('complete').hidden, false, reloaded.$('error').textContent);
  reloaded.$('download-current').click(); const exported = await reloaded.downloads.at(-1).text();
  const record = JSON.parse(exported); assert.equal(record.responses.length, 104);
  assert.equal(record.feedback.short_clips, 'Both cuts were useful');
  const receiver = await boot(storage(), '?view=results');
  receiver.$('imports').files = [{size: exported.length, text: async () => exported}]; await receiver.$('imports').onchange();
  assert.equal(receiver.getState().imports.length, 1, receiver.$('import-state').textContent);
  assert.equal(receiver.getState().imports[0].mode, 'phrase_walkthrough');
  assert.equal(receiver.getState().sessions.length, 0);
  assert.ok([...page.requests, ...reloaded.requests, ...receiver.requests].every(r => !r.options?.method || r.options.method === 'GET'));
});
