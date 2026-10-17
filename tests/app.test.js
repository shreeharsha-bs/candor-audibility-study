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
function storage() {
  const data = new Map();
  return {data, failWrites: false, getItem: key => data.get(key) || null,
    setItem(key, value) { if (this.failWrites) throw new Error('QuotaExceededError'); data.set(key, String(value)); }};
}
async function boot(saved = storage(), search = '') {
  const elements = new Map();
  const document = {getElementById: id => { if (!elements.has(id)) throw Error('Unknown DOM ID ' + id); return elements.get(id); },
    createElement: tag => new Element(tag, document)};
  for (const match of read('index.html').matchAll(/<([a-z][a-z0-9]*)\b[^>]*\bid="([^"]+)"[^>]*>/g)) {
    const node = new Element(match[1], document); node.hidden = /\bhidden(?:\s|>)/.test(match[0]);
    node.disabled = /\bdisabled(?:\s|>)/.test(match[0]); elements.set(match[2], node);
  }
  let ticks = 0;
  const sandbox = {document, localStorage: saved, location: {search}, console,
    window: {scrollTo() {}}, URLSearchParams, Blob, URL: {createObjectURL: () => 'blob:mock', revokeObjectURL() {}},
    crypto: {randomUUID: () => 'test-session-' + (++nextId)}, performance: {now: () => ++ticks}, setTimeout() {}};
  const context = vm.createContext(sandbox);
  const parseInPage = vm.runInContext('JSON.parse', context);
  sandbox.fetch = async url => ({ok: true, json: async () => parseInPage(read(url))});
  vm.runInContext(read('results.js'), context, {filename: 'results.js'});
  await vm.runInContext(read('app.js'), context, {filename: 'app.js'});
  const $ = id => document.getElementById(id);
  assert.equal($('error').hidden, true, $('error').textContent);
  const getState = () => JSON.parse(saved.getItem(storageKey));
  function startTrack(id) { $('track').value = id; $('start-track').click(); }
  function startList(id = 'P01') { $('list').value = id; $('start-assigned').click(); }
  function choose(index = 2) { $('choices').children[index].click(); }
  function play() { $('audio').onplay(); }
  function end() { $('audio').onended(); }
  function answer() { choose(); if (!$('audio').hidden) { play(); end(); } $('save-next').click(); }
  function finishText() {
    startTrack('main_text_text');
    while (!$('trial').hidden) answer();
    $('finish').click();
    assert.equal($('complete').hidden, false, $('error').textContent);
  }
  return {$, saved, getState, startTrack, startList, choose, play, end, answer, finishText};
}

test('audio requires a choice and a full playback before advancing; playback is never automatic', async () => {
  const page = await boot(); page.startTrack('main_original_original');
  const {$} = page;
  assert.equal($('audio').hidden, false); assert.equal($('save-next').disabled, true);
  page.choose(); assert.equal($('save-next').disabled, true);
  $('save-next').onclick(); assert.equal($('progress').textContent, 'Item 1 of 12');
  assert.equal(page.getState().seenStimuli.length, 0, 'Loading audio must not count as listening.');
  page.play(); assert.equal($('save-next').disabled, true);
  page.end(); assert.equal($('save-next').disabled, false);
  $('save-next').click(); assert.equal($('progress').textContent, 'Item 2 of 12');
  const response = page.getState().sessions[0].responses[0];
  assert.equal(response.audio_started, true); assert.equal(response.audio_ended, true);
  assert.equal(response.order_index, 0); assert.equal($('results').hidden, true);
});

test('a saved partial review resumes at the next item with its unsent note intact', async () => {
  const saved = storage(); const first = await boot(saved); first.startList('P01'); first.answer();
  first.$('clip-note').value = 'Draft note for the next clip'; first.$('clip-note').oninput();
  const prior = first.getState().sessions[0];
  const reloaded = await boot(saved); assert.match(reloaded.$('load-note').textContent, /1 review in progress/);
  reloaded.startList('P01');
  assert.equal(reloaded.$('progress').textContent, 'Item 2 of 6');
  assert.equal(reloaded.$('clip-note').value, 'Draft note for the next clip');
  assert.equal(reloaded.getState().sessions.length, 1);
  assert.equal(reloaded.getState().sessions[0].session_id, prior.session_id);
  assert.deepEqual(reloaded.getState().sessions[0].responses, prior.responses);
  assert.equal(reloaded.getState().sessions[0].prior_stimulus_exposure, false);
});

test('resuming records exposure in another unfinished review even without an answer there', async () => {
  const page = await boot(); page.startList('P01'); page.answer(); page.$('pause').click();
  page.startTrack('main_original_original'); page.play(); page.$('pause').click();
  const other = page.getState().sessions.find(s => s.mode === 'cut_walkthrough');
  assert.equal(other.responses.length, 0);
  page.startList('P01');
  const resumed = page.getState().sessions.find(s => s.mode === 'assigned_list');
  assert.equal(resumed.prior_stimulus_exposure, true);
  assert.equal(resumed.prior_results_viewed, false);
  assert.equal(page.$('progress').textContent, 'Item 2 of 6');
});

test('resuming after viewing another completed review records results exposure', async () => {
  const page = await boot(); page.startList('P01'); page.answer(); page.$('pause').click();
  page.finishText(); page.$('show-results').click();
  assert.equal(page.$('results').hidden, false, page.$('error').textContent);
  page.$('results-home').click(); page.startList('P01');
  const resumed = page.getState().sessions.find(s => s.mode === 'assigned_list');
  assert.equal(resumed.prior_results_viewed, true); assert.equal(resumed.prior_stimulus_exposure, true);
  assert.equal(resumed.responses.length, 1); assert.equal(page.$('results').hidden, true);
});

test('selected participant list keeps exact assignment and shorter cuts before longer ones', async () => {
  const selected = lists.lists.find(list => list.stimulus_ids.some(id => manifest.stimuli.find(t => t.trial_id === id).gate === 'later'));
  const page = await boot(storage(), '?list=' + selected.list_id);
  assert.equal(page.$('list').value, selected.list_id); page.$('start-assigned').click();
  const gates = [];
  for (let index = 0; index < 6; index++) {
    gates.push(page.$('gate').textContent); assert.equal(page.$('progress').textContent, 'Item ' + (index + 1) + ' of 6'); page.answer();
  }
  assert.equal(page.$('feedback').hidden, false); assert.equal(page.$('complete').hidden, true);
  assert.ok(!gates.slice(gates.indexOf('Longer cut')).includes('Shorter cut'));
  assert.deepEqual(page.getState().sessions[0].responses.map(r => r.trial_id), selected.stimulus_ids);
});

test('gated text shows all twelve matched prefixes, with six shorter cuts first and no audio playback', async () => {
  const page = await boot(); page.startTrack('main_text_text'); const gates = [], words = [];
  for (let index = 0; index < 12; index++) {
    assert.equal(page.$('audio').hidden, true); assert.equal(page.$('words').hidden, false);
    assert.equal(page.$('audio').getAttribute('src'), null);
    gates.push(page.$('gate').textContent); words.push(page.$('words').textContent);
    page.choose(); assert.equal(page.$('save-next').disabled, false); page.$('save-next').click();
  }
  assert.deepEqual(gates, [...Array(6).fill('Shorter cut'), ...Array(6).fill('Longer cut')]);
  const textIds = new Set(metadata.stimuli.filter(row => row.system === 'text').map(row => row.stimulus_id));
  const expected = manifest.stimuli.filter(t => textIds.has(t.trial_id)).sort((a,b) => (a.gate === 'earlier' ? 0 : 1) - (b.gate === 'earlier' ? 0 : 1) || a.phrase_number-b.phrase_number);
  assert.deepEqual(words, expected.map(t => t.text));
  assert.ok(page.getState().sessions[0].responses.every(r => !r.audio_started && !r.audio_ended));
  assert.equal(page.$('feedback').hidden, false);
});

test('quota failures stay visible across task, feedback and completion without claiming a saved review', async () => {
  const saved = storage(); saved.failWrites = true; const page = await boot(saved); page.startTrack('main_text_text');
  assert.equal(page.$('error').hidden, false); assert.match(page.$('error').textContent, /only in this open page/);
  assert.notEqual(page.$('save-state').textContent, 'Saved on this device');
  for (let index = 0; index < 12; index++) page.answer();
  assert.equal(page.$('feedback').hidden, false); assert.equal(page.$('error').hidden, false);
  page.$('finish').click();
  assert.equal(page.$('complete').hidden, false); assert.equal(page.$('error').hidden, false);
  assert.equal(page.$('complete-status').textContent, 'Download now to keep your review');
  assert.equal(saved.data.size, 0);
});
