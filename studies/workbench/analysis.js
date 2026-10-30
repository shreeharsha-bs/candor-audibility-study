/* Descriptive batch analysis. No network, mutation of input, or inferential claims. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WBAnalysis = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const GATES = ['early', 'late', 'full', 'shared_end'];
  const SYSTEMS = ['original', 'cosyvoice2', 'f5', 'omnivoice', 'qwen3_base', 'text'];
  const mean = a => a.length ? a.reduce((s, n) => s + n, 0) / a.length : null;
  const number = x => x !== null && x !== '' && x !== undefined && Number.isFinite(Number(x)) ? Number(x) : null;
  const yes = x => x === true || x === 'true';
  const date = x => x && Number.isFinite(Date.parse(x)) ? Date.parse(x) : null;
  const unique = a => Array.from(new Set(a));
  const sum = a => a.reduce((x, y) => x + y, 0);
  const keyFor = (study, cell, role) => [study, cell, role].join('::');
  const recordKey = r => r.key || [r.study_id, r.session_id, r.response_id].join('::');
  const sessionKey = r => [r.study_id, r.mode, r.session_id].join('::');
  const main = r => r.phase === 'main' && r.record_type === 'study_response';
  const technical = r => typeof r.technical_problem === 'string' && r.technical_problem !== '' && r.technical_problem !== 'null';
  const parseArray = x => Array.isArray(x) ? x : (() => { try { const p = JSON.parse(x); return Array.isArray(p) ? p : []; } catch (_) { return []; } })();
  function quantile(values, p) {
    const a = values.filter(x => number(x) !== null).map(Number).sort((x, y) => x - y);
    if (!a.length) return null;
    const i = (a.length - 1) * p, low = Math.floor(i), high = Math.ceil(i);
    return a[low] + (a[high] - a[low]) * (i - low);
  }
  function labelVersion(v) {
    const labels = { original: 'Original', cosyvoice2: 'CosyVoice2', f5: 'F5-TTS', omnivoice: 'OmniVoice', qwen3_base: 'Qwen3-TTS Base', text: 'Text' };
    const bits = String(v).split('__');
    const suffix = { neutral: 'neutral punctuation', period: 'period', question: 'question mark', short: 'S alone', extended: 'S+C' };
    return (labels[bits[0]] || bits[0]) + (bits[1] ? ' · ' + (suffix[bits[1]] || bits[1]) : '');
  }
  function classify(cell, study) {
    return study === 'turn' ? cell.allocation_group === 'g1' ? 'End' : cell.allocation_group === 'g2' ? 'Cont' : 'Unknown' : 'question';
  }
  function isExcluded(r, exclusions) {
    return exclusions.has(r.session_id) || exclusions.has(sessionKey(r)) || exclusions.has([r.study_id, r.session_id].join('::'));
  }
  function usable(r, c) {
    // QA is explicitly excluded by core from live eligibility, but its valid
    // answers can be inspected in the separate test view. Honor all live holds.
    return main(r) && r.valid === true && (r.mode === 'test' || r.eligible === true) && !r.conflict && !technical(r) && c &&
      c.options.some(o => o.id === r.choice) && (c.modality !== 'audio' || yes(r.listen_completed));
  }
  function deduplicate(records) {
    const map = new Map();
    const fields = ['study_id', 'mode', 'session_id', 'participant_id', 'response_id', 'cell_id', 'analysis_role', 'choice', 'technical_problem', 'listen_completed', 'response_ms', 'option_order', 'batch_id', 'schedule_id', 'slot_id'];
    for (const r of records) {
      if (!r || typeof r !== 'object') continue;
      const key = recordKey(r);
      if (!map.has(key)) { map.set(key, r); continue; }
      const prior = map.get(key);
      if (r.conflict || prior.conflict || fields.some(k => JSON.stringify(r[k]) !== JSON.stringify(prior[k]))) map.set(key, { ...prior, conflict: true, eligible: false });
    }
    return Array.from(map.values());
  }
  function coverageRows(manifest, study, target) {
    const result = [];
    for (const cell of manifest.cells) {
      const roles = [cell.comparison_role || 'primary'];
      if (study === 'turn' && cell.allocation_group === 'g1' && cell.primary_version !== 'original') roles.push('end_support');
      for (const role of roles) result.push({ ...cell, key: keyFor(study, cell.cell_id, role), study_id: study, analysis_role: role,
        group: classify(cell, study), system: cell.primary_version || String(cell.version).split('__')[0],
        label: labelVersion(cell.version), target: role === 'end_support' ? null : target,
        valid: 0, technical: 0, excluded: 0, invalid: 0, conflict: 0, repeated_exposure: 0, reserved: 0,
        first: [0, 0], reservedFirst: [0, 0], numerator: 0, chosenFirst: 0, outcome: study === 'question' ? 'yes' : 'extended', value: null,
        participants: [], session_ids: [] });
    }
    return result;
  }
  function groupRows(coverage, study) {
    const map = new Map();
    for (const c of coverage) {
      const version = study === 'turn' && c.analysis_role === 'primary' ? c.primary_version : c.version;
      const key = [c.analysis_role, c.group, version, c.gate].join('::');
      if (!map.has(key)) map.set(key, { key, study_id: study, analysis_role: c.analysis_role, group: c.group, version,
        gate: c.gate, label: labelVersion(version), cells: [] });
      map.get(key).cells.push(c);
    }
    return Array.from(map.values()).map(g => {
      const observed = g.cells.filter(c => c.valid > 0), n = sum(observed.map(c => c.valid)), numerator = sum(observed.map(c => c.numerator));
      return { ...g, cells: g.cells.map(c => c.key), n, numerator, value: mean(observed.map(c => c.value)), pooledValue: n ? numerator / n : null,
        phraseCount: observed.length, plannedPhrases: g.cells.length, missingPhrases: g.cells.length - observed.length,
        missingCells: g.cells.filter(c => !c.valid).map(c => c.key), minN: observed.length ? Math.min(...observed.map(c => c.valid)) : 0,
        maxN: observed.length ? Math.max(...observed.map(c => c.valid)) : 0, weighting: 'Equal weight per observed phrase cell; not all planned phrases are necessarily observed.' };
    }).sort((a, b) => a.analysis_role.localeCompare(b.analysis_role) || a.group.localeCompare(b.group) ||
      (SYSTEMS.indexOf(String(a.version).split('__')[0]) - SYSTEMS.indexOf(String(b.version).split('__')[0])) || a.version.localeCompare(b.version) || GATES.indexOf(a.gate) - GATES.indexOf(b.gate));
  }
  function pairContrast(left, right, info) {
    const leftMap = new Map(left.map(c => [c.phrase_id, c])), rightMap = new Map(right.map(c => [c.phrase_id, c]));
    const planned = unique([...leftMap.keys(), ...rightMap.keys()]), pairs = [];
    for (const phrase of planned) {
      const a = leftMap.get(phrase), b = rightMap.get(phrase);
      if (a?.valid > 0 && b?.valid > 0) pairs.push({ phrase_id: phrase, left_cell_id: a.cell_id, right_cell_id: b.cell_id,
        left_role: a.analysis_role, right_role: b.analysis_role, left_value: a.value, right_value: b.value,
        value: a.value - b.value, left_n: a.valid, right_n: b.valid });
    }
    return { ...info, pairs, nPairs: pairs.length, plannedPairs: planned.length, missingPairs: planned.length - pairs.length,
      value: mean(pairs.map(p => p.value)), left_n: sum(pairs.map(p => p.left_n)), right_n: sum(pairs.map(p => p.right_n)),
      weighting: 'Mean within-phrase difference over pairs observed on both sides. Unobserved pairs are reported, not assigned zero.' };
  }
  function contrasts(coverage, study) {
    const output = [], gates = unique(coverage.map(c => c.gate));
    const primary = coverage.filter(c => c.analysis_role === 'primary');
    for (const group of unique(primary.map(c => c.group))) for (const gate of gates) {
      const subset = primary.filter(c => c.group === group && c.gate === gate);
      const versions = unique(subset.map(c => study === 'turn' ? c.primary_version : c.version));
      const original = subset.filter(c => c.version === 'original');
      for (const version of versions.filter(v => v !== 'original')) {
        const versionCells = subset.filter(c => (study === 'turn' ? c.primary_version : c.version) === version);
        output.push(pairContrast(versionCells, original, { key: ['original', group, version, gate].join('::'), kind: 'versus_original', group, version, gate,
          label: labelVersion(version) + ' − Original', left: labelVersion(version), right: 'Original', analysis_role: 'primary' }));
      }
    }
    if (study === 'turn') {
      for (const version of SYSTEMS.filter(v => !['original', 'text'].includes(v))) for (const gate of gates) {
        const longer = coverage.filter(c => c.group === 'Cont' && c.analysis_role === 'primary' && c.primary_version === version && c.gate === gate);
        const short = coverage.filter(c => c.group === 'Cont' && c.analysis_role === 'secondary' && c.system === version && c.gate === gate);
        output.push(pairContrast(longer, short, { key: ['continuation', version, gate].join('::'), kind: 'continuation_text', group: 'Cont', version, gate,
          label: labelVersion(version) + ': S+C − S alone', left: 'S+C', right: 'S alone', analysis_role: 'secondary' }));
      }
    }
    return output;
  }
  function gateChanges(coverage) {
    const map = new Map(), output = [];
    for (const c of coverage.filter(c => c.analysis_role !== 'end_support')) {
      const key = [c.analysis_role, c.group, c.version].join('::');
      if (!map.has(key)) map.set(key, []); map.get(key).push(c);
    }
    for (const [key, cells] of map) {
      const ordered = unique(cells.map(c => c.gate)).sort((a, b) => GATES.indexOf(a) - GATES.indexOf(b));
      for (let i = 1; i < ordered.length; i++) {
        const later = ordered[i], earlier = ordered[i - 1], c = cells[0];
        output.push(pairContrast(cells.filter(x => x.gate === later), cells.filter(x => x.gate === earlier), { key: key + '::' + later + '-' + earlier,
          kind: 'gate_change', analysis_role: c.analysis_role, group: c.group, version: c.version, gate: later,
          label: labelVersion(c.version) + ': ' + later + ' − ' + earlier, left: later, right: earlier }));
      }
    }
    return output;
  }
  function compute(input, catalog, options = {}) {
    const study = options.study || 'question', mode = options.mode || 'live', manifest = catalog?.studies?.[study];
    if (!manifest || !Array.isArray(manifest.cells)) throw Error('A known study manifest is required for analysis.');
    if (!['live', 'test'].includes(mode)) throw Error('Choose live or test data explicitly.');
    const target = Object.prototype.hasOwnProperty.call(catalog, 'reporting_target_per_cell') ? catalog.reporting_target_per_cell : (manifest.target_per_cell ?? 12);
    if (![10, 12].includes(target)) throw Error('Reporting target must be 10 or 12 usable ratings per required cell.');
    const exclusions = new Set(Array.isArray(options.excludedSessions) ? options.excludedSessions : Object.keys(options.excludedSessions || {}).filter(k => options.excludedSessions[k]));
    const allRecords = deduplicate(Array.isArray(input) ? input : []), records = allRecords.filter(r => r.study_id === study && r.mode === mode);
    const cells = new Map(manifest.cells.map(c => [c.cell_id, c])), coverage = coverageRows(manifest, study, target), byKey = new Map(coverage.map(c => [c.key, c]));
    const identities = new Map();
    for (const r of records.filter(r => r.session_id)) {
      const k = sessionKey(r);
      if (!identities.has(k)) identities.set(k, new Set());
      identities.get(k).add(JSON.stringify([r.participant_id, r.batch_id, r.schedule_id, r.slot_id, r.list_id]));
    }
    const identityConflicts = new Set(Array.from(identities).filter(([, values]) => values.size > 1).map(([k]) => k));
    // Repeated exposure cannot produce independent ratings. Hold all ambiguous
    // participant/phrase answers until the researcher excludes a duplicate session.
    const exposure = new Map();
    for (const r of records.filter(r => usable(r, cells.get(r.cell_id)) && !isExcluded(r, exclusions) && !identityConflicts.has(sessionKey(r)))) {
      const k = [r.participant_id, r.phrase_id].join('::');
      if (!exposure.has(k)) exposure.set(k, { participant_id: r.participant_id, phrase_id: r.phrase_id, sessions: new Set(), keys: [] });
      const x = exposure.get(k); x.sessions.add(r.session_id); x.keys.push(recordKey(r));
    }
    const repeatedExposures = Array.from(exposure.values()).filter(x => x.sessions.size > 1).map(x => ({ ...x, sessions: Array.from(x.sessions) }));
    const held = new Set(repeatedExposures.flatMap(x => x.keys)), included = [], unmapped = [], sessionMap = new Map();
    for (const r of records) {
      if (r.session_id) { const k = sessionKey(r); if (!sessionMap.has(k)) sessionMap.set(k, []); sessionMap.get(k).push(r); }
      if (!main(r)) continue;
      const c = byKey.get(keyFor(study, r.cell_id, r.analysis_role));
      if (!c) { unmapped.push(recordKey(r)); continue; }
      if (technical(r)) c.technical++;
      if (r.valid !== true) c.invalid++;
      if (r.conflict || identityConflicts.has(sessionKey(r))) c.conflict++;
      if (identityConflicts.has(sessionKey(r))) continue;
      if (isExcluded(r, exclusions)) { c.excluded++; continue; }
      if (held.has(recordKey(r))) { c.repeated_exposure++; continue; }
      if (!usable(r, cells.get(r.cell_id))) continue;
      c.valid++; c.numerator += Number(r.choice === c.outcome);
      const order = parseArray(r.option_order), firstIndex = c.options.findIndex(o => o.id === order[0]);
      if (firstIndex >= 0) c.first[firstIndex]++;
      if (order[0] === r.choice) c.chosenFirst++;
      c.participants.push(r.participant_id); c.session_ids.push(r.session_id); included.push(r);
    }
    for (const c of coverage) { c.value = c.valid ? c.numerator / c.valid : null; c.remaining = c.target === null ? null : Math.max(0, c.target - c.valid); c.participants = unique(c.participants); c.session_ids = unique(c.session_ids); }
    const includedKeys = new Set(included.map(recordKey)), expected = manifest.trials_per_session;
    const sessions = Array.from(sessionMap.entries()).map(([key, rows]) => {
      const first = rows[0], responses = rows.filter(main), uniqueCells = unique(responses.map(r => r.cell_id).filter(Boolean));
      const markers = rows.filter(r => r.record_type === 'study_complete' && r.valid === true && !r.conflict);
      const complete = markers.length > 0 && uniqueCells.length === expected && responses.length === expected &&
        responses.every(r => r.valid === true && !r.conflict) && !identityConflicts.has(key) && markers.every(r => number(r.main_response_count) === expected);
      const starts = rows.map(r => date(r.started_at)).filter(x => x !== null), ends = markers.map(r => date(r.completed_at)).filter(x => x !== null);
      const started = starts.length ? Math.min(...starts) : null, ended = ends.length ? Math.max(...ends) : null;
      const durationSeconds = started !== null && ended !== null && ended >= started ? (ended - started) / 1000 : null;
      const nativeElapsed = quantile(rows.map(r => number(r.time_elapsed)).filter(x => x !== null && x >= 0), 1);
      const valid = responses.filter(r => includedKeys.has(recordKey(r))), rt = valid.map(r => number(r.response_ms)).filter(x => x !== null && x >= 0);
      const validSetup = rows.filter(r => r.valid === true && !r.conflict);
      const missingSetup = ['study_start', 'study_consent', 'volume_check'].filter(type => !validSetup.some(r => r.record_type === type));
      const practiceCount = unique(validSetup.filter(r => r.record_type === 'study_practice').map(recordKey)).length;
      if (practiceCount < (manifest.practice || []).length) missingSetup.push('study_practice');
      return { key, session_id: first.session_id, participant_id: first.participant_id, study_id: study, mode,
        batch_id: first.batch_id, slot_id: first.slot_id, list_id: first.list_id, excluded: rows.some(r => isExcluded(r, exclusions)),
        complete, status: complete ? 'Complete in imported data' : 'Not complete in imported data', expected_main: expected,
        main_rows: responses.length, unique_main_cells: uniqueCells.length, valid_main: valid.length,
        missing_main: Math.max(0, expected - uniqueCells.length), completion_marker: markers.length > 0,
        completion_mismatch: markers.length > 0 && !complete, technical: responses.filter(technical).length,
        invalid: responses.filter(r => r.valid !== true).length, conflicts: responses.filter(r => r.conflict).length,
        identity_conflict: identityConflicts.has(key),
        missing_setup: missingSetup, practice_records: practiceCount, expected_practice: (manifest.practice || []).length,
        repeated_exposure: responses.filter(r => held.has(recordKey(r))).length,
        playback_error_rows: responses.filter(r => parseArray(r.playback_errors).length > 0).length,
        replays: sum(valid.map(r => Math.max(0, (number(r.play_count) || 0) - 1))),
        duration_seconds: durationSeconds, native_elapsed_seconds: nativeElapsed === null ? null : nativeElapsed / 1000,
        median_response_ms: quantile(rt, 0.5), short_response_rows: rt.filter(x => x < 1000).length,
        first_option_count: valid.filter(r => parseArray(r.option_order)[0] === r.choice).length,
        outcome_count: valid.filter(r => r.choice === (study === 'question' ? 'yes' : 'extended')).length,
        started_at: started === null ? null : new Date(started).toISOString(), completed_at: ended === null ? null : new Date(ended).toISOString() };
    }).sort((a, b) => String(a.started_at || '').localeCompare(String(b.started_at || '')) || a.key.localeCompare(b.key));
    const batchId = value => value || 'unknown_batch';
    const batches = unique([...sessions.map(s => batchId(s.batch_id)), ...records.map(r => batchId(r.batch_id))]).sort().map(id => {
      const batchSessions = sessions.filter(s => batchId(s.batch_id) === id);
      const batchAnswers = included.filter(r => batchId(r.batch_id) === id);
      const batchMain = records.filter(r => batchId(r.batch_id) === id && main(r));
      return { id, sessions: batchSessions.length, complete: batchSessions.filter(s => s.complete).length,
        required_usable_ratings: batchAnswers.filter(r => r.analysis_role !== 'end_support').length,
        support_ratings: batchAnswers.filter(r => r.analysis_role === 'end_support').length,
        technical_rows: batchMain.filter(technical).length,
        playback_error_rows: batchMain.filter(r => parseArray(r.playback_errors).length > 0).length,
        median_completed_seconds: quantile(batchSessions.filter(s => s.complete && !s.excluded).map(s => s.duration_seconds), .5),
        excluded: batchSessions.filter(s => s.excluded).length };
    });
    const required = coverage.filter(c => c.target !== null), support = coverage.filter(c => c.target === null), validRequired = sum(required.map(c => c.valid));
    const participantStudies = new Map();
    for (const r of allRecords.filter(r => r.mode === 'live' && r.valid === true && r.participant_id && !isExcluded(r, exclusions))) {
      if (!participantStudies.has(r.participant_id)) participantStudies.set(r.participant_id, new Set()); participantStudies.get(r.participant_id).add(r.study_id);
    }
    const crossStudy = Array.from(participantStudies).filter(([, studies]) => studies.size > 1).map(([participant_id, studies]) => ({ participant_id, studies: Array.from(studies) }));
    const groups = groupRows(coverage, study), comparison = contrasts(coverage, study), changes = gateChanges(coverage);
    const summary = { study_id: study, mode, target_per_cell: target, planned_cells: required.length,
      observed_cells: required.filter(c => c.valid > 0).length, zero_cells: required.filter(c => !c.valid).length,
      cells_at_target: required.filter(c => c.valid >= c.target).length, min_per_cell: required.length ? Math.min(...required.map(c => c.valid)) : 0,
      max_per_cell: required.length ? Math.max(...required.map(c => c.valid)) : 0, valid_required_ratings: validRequired,
      target_ratings: sum(required.map(c => c.target)), remaining_ratings: sum(required.map(c => c.remaining)), surplus_ratings: sum(required.map(c => Math.max(0, c.valid - c.target))),
      support_ratings: sum(support.map(c => c.valid)), support_cells: support.length, included_main: included.length,
      imported_main: records.filter(main).length, imported_records: records.length, sessions: sessions.length,
      complete_sessions: sessions.filter(s => s.complete).length, incomplete_sessions: sessions.filter(s => !s.complete).length,
      excluded_sessions: sessions.filter(s => s.excluded).length, technical_rows: records.filter(r => main(r) && technical(r)).length,
      invalid_main: records.filter(r => main(r) && r.valid !== true).length, conflicting_main: records.filter(r => main(r) && r.conflict).length,
      identity_conflict_sessions: identityConflicts.size,
      sessions_missing_setup: sessions.filter(s => s.missing_setup.length).length,
      repeated_exposure_rows: held.size, repeated_exposure_participants: unique(repeatedExposures.map(x => x.participant_id)).length,
      cross_study_participants: crossStudy.length, unique_participants: unique(included.map(r => r.participant_id)).length,
      median_duration_seconds: quantile(sessions.filter(s => s.complete && !s.excluded).map(s => s.duration_seconds), .5),
      duration_p90_seconds: quantile(sessions.filter(s => s.complete && !s.excluded).map(s => s.duration_seconds), .9),
      median_response_ms: quantile(included.map(r => r.response_ms), .5),
      playback_error_rows: records.filter(r => main(r) && parseArray(r.playback_errors).length > 0).length,
      first_option_proportion: included.length ? included.filter(r => parseArray(r.option_order)[0] === r.choice).length / included.length : null,
      test_records_outside_live: allRecords.filter(r => r.study_id === study && r.mode === 'test').length,
      unclassified_records: allRecords.filter(r => r.study_id === study && r.mode === 'unknown').length,
      usable_partial_ratings: sum(sessions.filter(s => !s.complete).map(s => s.valid_main)),
      target_reached: required.length > 0 && required.every(c => c.valid >= c.target) };
    const diagnostics = { repeatedExposures, crossStudy, unmappedRecordKeys: unmapped, identityConflictSessions: Array.from(identityConflicts),
      invalidRecords: records.filter(r => main(r) && (r.valid !== true || r.conflict)).map(r => ({ key: recordKey(r), session_id: r.session_id, cell_id: r.cell_id, errors: r.errors || [], conflict: !!r.conflict })),
      completionMismatches: sessions.filter(s => s.completion_mismatch).map(s => s.key),
      missingSetupRecords: sessions.filter(s => s.missing_setup.length).map(s => ({ key: s.key, missing: s.missing_setup, practice_records: s.practice_records, expected_practice: s.expected_practice })),
      limitations: ['Import completeness is limited to the files supplied; missing native runs cannot be detected without their export.',
        'Incomplete means not complete in imported data. It does not establish dropout or the current Cognition status.',
        'Timing and repeated-answer patterns are descriptive flags, not automatic grounds for participant exclusion.',
        'Response proportions are exploratory descriptions, not accuracy, power estimates, or hypothesis tests.',
        'Aggregate proportions weight each observed phrase cell equally. Missing planned cells remain visible in coverage.',
        'No independent-trial confidence intervals are shown; participants and phrases are repeated in the design.'] };
    const insights = [];
    if (!summary.imported_records) insights.push({ level: 'info', title: mode === 'live' ? 'No participant data imported yet' : 'No test data imported yet', text: 'Import completed-batch ZIPs to see coverage and response patterns. All planned cells currently remain at zero.' });
    else if (!summary.included_main) insights.push({ level: 'warning', title: 'No usable answers in this view', text: 'The imported rows are tests, excluded, technical, invalid, or held for review. Inspect the import report and session details.' });
    if (summary.conflicting_main || summary.invalid_main || held.size || identityConflicts.size) insights.push({ level: 'warning', title: 'Resolve data checks before interpreting results', text: `${summary.invalid_main} invalid main rows, ${summary.conflicting_main} conflicting rows, ${identityConflicts.size} sessions with inconsistent identities, and ${held.size} repeated-exposure rows are kept out of coverage. Repeated exposure can be resolved by excluding the duplicate session after review.` });
    if (summary.playback_error_rows || summary.technical_rows) insights.push({ level: 'warning', title: 'Inspect listening problems', text: `${summary.technical_rows} technical reports and ${summary.playback_error_rows} rows with playback errors were imported. Check the affected sessions and items before the next batch.` });
    if (summary.sessions_missing_setup) insights.push({ level: 'warning', title: 'Some setup records are missing from the import', text: `${summary.sessions_missing_setup} sessions lack valid start, consent, volume, or expected practice records. Check the export before interpreting completeness. Valid main answers remain available; a completion marker does not establish that all setup evidence was imported.` });
    if (summary.imported_records) insights.push({ level: summary.target_reached ? 'success' : 'info', title: summary.target_reached ? 'Every required cell has reached the coverage target' : summary.zero_cells ? `${summary.zero_cells} planned cells have no usable rating yet` : 'Every planned cell has at least one usable rating', text: summary.target_reached ? `The minimum is at least ${summary.target_per_cell} usable ratings per required cell. Surplus ratings are retained. This is a coverage milestone, not evidence of statistical power.` : `${summary.remaining_ratings} additional usable ratings are needed to bring every required cell to ${summary.target_per_cell}. This is a rating deficit, not a participant count.` });
    if (study === 'question') {
      const waveIds = unique(records.map(r => r.batch_id).filter(Boolean)), known = (catalog.schedules || []).filter(w => waveIds.includes(w.batch_id) && w.study_id === study && w.mode === mode);
      const assigned = new Set(known.flatMap(w => w.conditions.flatMap(s => s.assignments.map(a => a.cell_id))));
      const neverAssigned = required.filter(c => !assigned.has(c.cell_id)).length;
      if (known.length && neverAssigned > 0) insights.push({ level: 'warning', title: 'The next batch needs a new assignment wave', text: `${neverAssigned} required cells are absent from the imported wave assignments. Resetting Cognition's run counter and repeating those same assignments cannot fill these gaps. Generate the next wave from the cumulative coverage.` });
    }
    if (summary.cross_study_participants) insights.push({ level: 'info', title: 'Participant overlap across tasks', text: `${summary.cross_study_participants} participant IDs appear in both imported live studies. Participation in both tasks is allowed. Retain the shared participant IDs for analysis across tasks; this overlap does not exclude their answers.` });
    insights.push({ level: 'note', title: 'Use interim results to check the study', text: 'Pause for technical or data problems. Do not change recruitment because a preferred effect appears or disappears; keep the declared per-cell target.' });
    const examples = comparison.flatMap(c => c.pairs.filter(p => p.left_n >= 3 && p.right_n >= 3).map(p => ({ ...p, contrast_key: c.key, kind: c.kind, label: c.label, gate: c.gate, group: c.group,
      selection_rule: 'Largest absolute matched phrase difference among pairs with at least 3 usable ratings on each side; illustrative, not representative.' })))
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value) || Math.min(b.left_n, b.right_n) - Math.min(a.left_n, a.right_n) || a.phrase_id.localeCompare(b.phrase_id));
    return { study_id: study, mode, outcome: study === 'question' ? 'Question response (Yes)' : 'Longer sentence chosen (S+C)', summary, coverage, groups,
      contrasts: comparison, gateChanges: changes, sessions, batches, diagnostics, insights, examples, weighting: 'Equal observed phrase cells; see matched contrasts and missing coverage.',
      inference: 'Descriptive only. No significance tests or power claims.' };
  }
  return { compute, quantile, labelVersion, keyFor };
});
