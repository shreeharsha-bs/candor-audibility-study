(() => {
  const config = window.STUDY_CONFIG || {};
  const lists = window.CANDOR_TRIAL_LISTS || {};
  const schemaVersion = "2026-06-02.1";

  const els = {};
  let state = null;
  let selectedResponse = "";
  let trialStartedAt = 0;
  let firstPlayAt = "";
  let playCount = 0;
  let audioEnded = false;

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    for (const id of [
      "setupPanel", "studyPanel", "donePanel", "setupForm", "participantId", "listSelect",
      "saveStatus", "progressText", "progressFill", "trialMeta", "audioPlayer", "questionText",
      "optionButtons", "listenerNotes", "submitTrial", "doneSummary", "retrySaves", "exportCsv"
    ]) {
      els[id] = document.getElementById(id);
    }

    buildListSelect();
    const params = new URLSearchParams(window.location.search);
    const listParam = normalizeListId(params.get("list"));
    if (listParam && lists[listParam]) els.listSelect.value = listParam;
    const participantParam = params.get("participant") || params.get("pid");
    if (participantParam) els.participantId.value = participantParam;

    els.setupForm.addEventListener("submit", startStudy);
    els.submitTrial.addEventListener("click", saveCurrentTrial);
    els.retrySaves.addEventListener("click", retryPendingUploads);
    els.exportCsv.addEventListener("click", exportResponsesCsv);
    els.audioPlayer.addEventListener("play", () => {
      playCount += 1;
      if (!firstPlayAt) firstPlayAt = new Date().toISOString();
      updateSubmitState();
    });
    els.audioPlayer.addEventListener("ended", () => {
      audioEnded = true;
      updateSubmitState();
    });

    setStatus(config.SUBMIT_URL ? "Auto-save ready" : "Local save only");
  }

  function buildListSelect() {
    els.listSelect.innerHTML = "";
    for (const listId of Object.keys(lists).sort()) {
      const option = document.createElement("option");
      option.value = listId;
      option.textContent = `List ${listId} (${lists[listId].length} trials)`;
      els.listSelect.appendChild(option);
    }
    if (config.ALLOW_LIST_PICKER === false) {
      els.listSelect.disabled = true;
    }
  }

  function startStudy(event) {
    event.preventDefault();
    const listId = els.listSelect.value || Object.keys(lists).sort()[0];
    const trials = lists[listId] || [];
    if (!trials.length) {
      setStatus("No trials found for selected list", true);
      return;
    }
    state = {
      study_id: config.STUDY_ID || "candor_proxy_audibility",
      schema_version: schemaVersion,
      session_id: makeId("session"),
      participant_id: cleanId(els.participantId.value) || makeId("participant"),
      list_id: listId,
      started_at: new Date().toISOString(),
      trial_index: 0,
      trials,
      responses: [],
      pending: []
    };
    persistState();
    els.setupPanel.hidden = true;
    els.studyPanel.hidden = false;
    renderTrial();
  }

  function renderTrial() {
    selectedResponse = "";
    firstPlayAt = "";
    playCount = 0;
    audioEnded = false;
    trialStartedAt = performance.now();
    els.listenerNotes.value = "";

    const trial = currentTrial();
    els.trialMeta.textContent = `Trial ${state.trial_index + 1} of ${state.trials.length}`;
    els.audioPlayer.src = trial.audio_url;
    els.questionText.textContent = trial.audibility_question;
    els.optionButtons.innerHTML = "";
    for (const option of trial.options) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option-button";
      button.dataset.value = option.value;
      button.dataset.label = option.label;
      button.setAttribute("aria-pressed", "false");
      button.textContent = config.SHOW_OPTION_VALUES ? `${option.label} (${option.value})` : option.label;
      button.addEventListener("click", () => chooseOption(button));
      els.optionButtons.appendChild(button);
    }
    updateProgress();
    updateSubmitState();
    setStatus(config.SUBMIT_URL ? "Auto-save ready" : "Local save only");
  }

  function chooseOption(button) {
    selectedResponse = button.dataset.value;
    for (const child of els.optionButtons.children) child.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-pressed", "true");
    updateSubmitState();
  }

  async function saveCurrentTrial() {
    if (!selectedResponse) return;
    if (config.REQUIRE_AUDIO_PLAYED !== false && playCount < 1) {
      setStatus("Play the audio before saving", true);
      return;
    }
    const trial = currentTrial();
    const option = trial.options.find((item) => item.value === selectedResponse) || {};
    const record = {
      event_type: "trial_response",
      study_id: state.study_id,
      schema_version: state.schema_version,
      session_id: state.session_id,
      participant_id: state.participant_id,
      list_id: state.list_id,
      trial_index: state.trial_index + 1,
      trial_count: state.trials.length,
      sample_id: trial.sample_id,
      base_item_id: trial.base_item_id,
      task: trial.task,
      prompt_length_condition: trial.prompt_length_condition,
      prompt_length_s: trial.prompt_length_s,
      evidence_level: trial.evidence_level,
      audio_url: trial.audio_url,
      audibility_question: trial.audibility_question,
      response: selectedResponse,
      response_label: option.label || selectedResponse,
      listener_notes: els.listenerNotes.value.trim(),
      trial_started_at: new Date(Date.now() - Math.round(performance.now() - trialStartedAt)).toISOString(),
      response_submitted_at: new Date().toISOString(),
      response_time_ms: Math.round(performance.now() - trialStartedAt),
      first_play_at: firstPlayAt,
      play_count: playCount,
      audio_ended: audioEnded,
      page_url: window.location.href,
      user_agent: navigator.userAgent
    };

    state.responses.push(record);
    persistState();
    await uploadRecord(record);
    state.trial_index += 1;
    persistState();

    if (state.trial_index >= state.trials.length) finishStudy();
    else renderTrial();
  }

  async function uploadRecord(record) {
    if (!config.SUBMIT_URL) {
      record.remote_status = "local_only";
      setStatus("Saved locally");
      persistState();
      return;
    }
    try {
      await fetch(config.SUBMIT_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(record)
      });
      record.remote_status = "sent";
      record.remote_saved_at = new Date().toISOString();
      setStatus("Saved");
    } catch (error) {
      record.remote_status = "queued";
      record.remote_error = String(error && error.message ? error.message : error);
      state.pending.push(record);
      setStatus("Saved locally; upload queued", true);
    }
    persistState();
  }

  async function retryPendingUploads() {
    if (!state || !state.pending.length) return;
    const queued = [...state.pending];
    state.pending = [];
    for (const record of queued) await uploadRecord(record);
    persistState();
    finishStudy();
  }

  function finishStudy() {
    els.studyPanel.hidden = true;
    els.donePanel.hidden = false;
    updateProgress();
    const pendingText = state.pending.length ? `${state.pending.length} upload(s) queued.` : "All available responses handled.";
    els.doneSummary.textContent = `${state.responses.length} responses saved. ${pendingText}`;
    setStatus(state.pending.length ? "Uploads queued" : "Complete");
  }

  function currentTrial() { return state.trials[state.trial_index]; }

  function updateSubmitState() {
    els.submitTrial.disabled = !selectedResponse || (config.REQUIRE_AUDIO_PLAYED !== false && playCount < 1);
  }

  function updateProgress() {
    const total = state ? state.trials.length : 0;
    const current = state ? Math.min(state.trial_index, total) : 0;
    els.progressText.textContent = `${current} / ${total}`;
    els.progressFill.style.width = total ? `${(current / total) * 100}%` : "0%";
  }

  function setStatus(message, isError = false) {
    els.saveStatus.textContent = message;
    els.saveStatus.style.color = isError ? "var(--danger)" : "var(--muted)";
  }

  function persistState() {
    if (!state) return;
    localStorage.setItem(`candorStudy:${state.session_id}`, JSON.stringify(state));
  }

  function exportResponsesCsv() {
    if (!state) return;
    const rows = state.responses;
    const headers = Array.from(rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set()));
    const csv = [headers.join(",")].concat(rows.map((row) => headers.map((key) => csvCell(row[key])).join(","))).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${state.study_id}_${state.participant_id}_${state.session_id}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function csvCell(value) {
    const text = value == null ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function cleanId(value) {
    return String(value || "").trim().replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 80);
  }

  function makeId(prefix) {
    if (window.crypto && crypto.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function normalizeListId(value) {
    if (!value) return "";
    const text = String(value).trim();
    if (/^\d$/.test(text)) return `0${text}`;
    return text;
  }
})();
