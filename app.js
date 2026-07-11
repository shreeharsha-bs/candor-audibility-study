(() => {
  const config = window.STUDY_CONFIG || {};
  const lists = window.CANDOR_TRIAL_LISTS || {};
  const schemaVersion = "2026-06-15.1";

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
      "saveStatus", "progressText", "progressFill", "trialMeta", "audioPlayer", "questionText", "studyTitle",
      "textStimulus", "optionButtons", "listenerNotes", "submitTrial", "doneSummary", "retrySaves", "exportCsv"
    ]) {
      els[id] = document.getElementById(id);
    }

    const params = new URLSearchParams(window.location.search);
    const taskParam = normalizeTask(params.get("task"));
    const blockParam = normalizeBlock(params.get("block") || params.get("study_block") || params.get("modality"));
    applyBlockTitle(blockParam);
    buildListSelect(taskParam, blockParam);
    const listParam = resolveListId(taskParam, blockParam, params.get("list"));
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

  function buildListSelect(taskFilter = "", blockFilter = "") {
    els.listSelect.innerHTML = "";
    const listIds = Object.keys(lists).sort().filter((listId) => {
      if (blockFilter && blockMatchesList(listId, lists[listId], blockFilter)) return true;
      if (blockFilter) return false;
      if (!taskFilter) return true;
      if (listId.startsWith(`${taskFilter}_`)) return true;
      return (lists[listId] || []).some((trial) => taskMatches(trial.task, taskFilter));
    });
    for (const listId of listIds) {
      const option = document.createElement("option");
      option.value = listId;
      option.textContent = listLabel(listId, lists[listId]);
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
    const textMode = isTextTrial(trial);
    document.getElementById("trialTitle").textContent = textMode ? "Read and Respond" : "Listen and Respond";
    els.trialMeta.textContent = `Trial ${state.trial_index + 1} of ${state.trials.length}`;
    if (textMode) {
      els.audioPlayer.hidden = true;
      els.audioPlayer.removeAttribute("src");
      els.textStimulus.hidden = false;
      els.textStimulus.textContent = displayText(trial);
    } else {
      els.audioPlayer.hidden = false;
      els.audioPlayer.src = trial.audio_url;
      els.textStimulus.hidden = true;
      els.textStimulus.textContent = "";
    }
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
    if (trialRequiresAudio(currentTrial()) && playCount < 1) {
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
      study_block: trial.study_block || "",
      trial_mode: trial.trial_mode || (isTextTrial(trial) ? "text" : "audio"),
      display_text: isTextTrial(trial) ? displayText(trial) : "",
      is_attention_check: Boolean(trial.is_attention_check),
      attention_check_kind: trial.attention_check_kind || "",
      attention_check_expected_response: trial.attention_check_expected_response || "",
      attention_check_source_sample_id: trial.attention_check_source_sample_id || "",
      attention_check_passed: trial.is_attention_check ? selectedResponse === trial.attention_check_expected_response : "",
      prompt_length_condition: trial.prompt_length_condition,
      prompt_progress_condition: trial.prompt_progress_condition,
      prompt_fraction: trial.prompt_fraction,
      prompt_length_s: trial.prompt_length_s,
      prompt_duration_s: trial.prompt_duration_s,
      evidence_level: trial.evidence_level,
      turn_gate_condition: trial.turn_gate_condition,
      turn_gate_word_cutoff: trial.turn_gate_word_cutoff,
      silence_expected: trial.silence_expected,
      question_pair_id: trial.question_pair_id,
      question_match_scope: trial.question_match_scope,
      source_speech_rate_wps: trial.source_speech_rate_wps,
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
    const needsAudio = state ? trialRequiresAudio(currentTrial()) : true;
    els.submitTrial.disabled = !selectedResponse || (needsAudio && playCount < 1);
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

  function listLabel(listId, trials) {
    const task = listId.startsWith("question_audio_") ? "Question audio"
      : listId.startsWith("question_text_") ? "Question text"
      : listId.startsWith("turn_audio_") ? "Turn audio"
      : listId.startsWith("turn_text_") ? "Turn text"
      : listId.startsWith("question_act_") ? "Question-act"
      : listId.startsWith("turn_floor_transfer_") ? "Turn floor-transfer"
      : listId.startsWith("turn_completion_") ? "Turn-completion"
      : "Mixed";
    const suffix = listId.split("_").slice(-1)[0];
    return `${task} list ${suffix} (${trials.length} trials)`;
  }

  function resolveListId(task, block, listValue) {
    const normalized = normalizeListId(listValue);
    if (block && normalized && lists[`${block}_${normalized}`]) return `${block}_${normalized}`;
    if (block) {
      return Object.keys(lists).sort().find((listId) => blockMatchesList(listId, lists[listId], block)) || "";
    }
    if (task && normalized && lists[`${task}_${normalized}`]) return `${task}_${normalized}`;
    if (normalized && lists[normalized]) return normalized;
    if (task) {
      return Object.keys(lists).sort().find((listId) => {
        if (listId.startsWith(`${task}_`)) return true;
        return (lists[listId] || []).some((trial) => taskMatches(trial.task, task));
      }) || "";
    }
    return normalized;
  }

  function normalizeTask(value) {
    const text = String(value || "").trim().toLowerCase().replace(/[ -]/g, "_");
    if (["question", "question_act", "questions"].includes(text)) return "question_act";
    if (["turn", "turn_taking", "floor_transfer", "turn_floor_transfer"].includes(text)) return "turn_floor_transfer";
    if (["turn_completion", "completion"].includes(text)) return "turn_completion";
    return "";
  }

  function normalizeBlock(value) {
    const text = String(value || "").trim().toLowerCase().replace(/[ -]/g, "_");
    if (["question_audio", "questions_audio", "question_act_audio"].includes(text)) return "question_audio";
    if (["question_text", "questions_text", "question_act_text"].includes(text)) return "question_text";
    if (["turn_audio", "turn_taking_audio", "turn_floor_transfer_audio"].includes(text)) return "turn_audio";
    if (["turn_text", "turn_taking_text", "turn_floor_transfer_text"].includes(text)) return "turn_text";
    return "";
  }

  function applyBlockTitle(block) {
    const titles = {
      question_audio: "Question Act: Audio",
      question_text: "Question Act: Text",
      turn_audio: "Turn Taking: Audio",
      turn_text: "Turn Taking: Text"
    };
    const title = titles[block] || "CANDOR Conversational Cue Study";
    els.studyTitle.textContent = title;
    document.title = title;
  }

  function taskMatches(task, taskFilter) {
    if (task === taskFilter) return true;
    if (taskFilter === "turn_floor_transfer" && task === "turn_completion") return true;
    return false;
  }

  function blockMatchesList(listId, trials, block) {
    if (listId.startsWith(`${block}_`)) return true;
    return (trials || []).some((trial) => {
      const mode = isTextTrial(trial) ? "text" : "audio";
      if (block === "question_audio") return taskMatches(trial.task, "question_act") && mode === "audio";
      if (block === "question_text") return taskMatches(trial.task, "question_act") && mode === "text";
      if (block === "turn_audio") return taskMatches(trial.task, "turn_floor_transfer") && mode === "audio";
      if (block === "turn_text") return taskMatches(trial.task, "turn_floor_transfer") && mode === "text";
      return false;
    });
  }

  function isTextTrial(trial) {
    const mode = String(trial.trial_mode || trial.modality || "").toLowerCase();
    const block = String(trial.study_block || "").toLowerCase();
    return mode === "text" || block.endsWith("_text") || !trial.audio_url;
  }

  function trialRequiresAudio(trial) {
    return config.REQUIRE_AUDIO_PLAYED !== false && !isTextTrial(trial);
  }

  function displayText(trial) {
    return trial.display_text || trial.text || trial.keep_text || trial.heard_text || trial.source_text || trial.transcript || "";
  }

  function normalizeListId(value) {
    if (!value) return "";
    const text = String(value).trim();
    if (/^\d$/.test(text)) return `0${text}`;
    return text;
  }
})();
