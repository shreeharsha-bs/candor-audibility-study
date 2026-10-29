"use strict";

function newPlayback() { return {startedAtZero:false,invalid:false,completed:false}; }
function canComplete(playback, ranges, duration, currentTime) {
  if (!playback.startedAtZero || playback.invalid || !Number.isFinite(duration) || duration<=0 || currentTime<duration-.08) return false;
  let covered=0;
  for(const [start,end] of ranges){if(start>covered+.08)return false;covered=Math.max(covered,end);}
  return covered>=duration-.08;
}
function choiceOrder(id) {
  let hash=0;
  for (const c of id) hash=(hash*31+c.charCodeAt(0))|0;
  return (hash&1)?["extended","short"]:["short","extended"];
}
function sourceLabel(version){
  if(version==="original")return "Original human recording";
  const [system,condition]=version.split("__");
  const names={omnivoice:"OmniVoice",f5:"F5-TTS",cosyvoice2:"CosyVoice2",qwen3_base:"Qwen3-TTS Base"};
  return `${names[system]||system} · ${condition==="extended"?"extended sentence":"short sentence"}`;
}
function availableSources(presentations,pairId,gate){
  const keys=new Set(presentations.filter(row=>row.pair_id===pairId&&row.gate===gate).map(row=>row.version_id||"original"));
  return [...keys].sort((a,b)=>a==="original"?-1:b==="original"?1:a.localeCompare(b));
}
function selectPresentation(presentations,pairId,gate,source,modality){
  return presentations.find(row=>row.pair_id===pairId&&row.gate===gate&&(row.version_id||"original")===(modality==="text"?"original":source));
}
function parakeetSummary(checks){
  if(!checks)return "Parakeet checks have not been added to this preview.";
  const counts=checks.counts;
  return `${checks.completed} / ${checks.expected} audio clips checked with Parakeet. ${counts.lexical_match} exact normalized-word matches; ${counts.lexical_mismatch} transcript differences (including ${counts.empty_transcript||0} empty transcripts); ${counts.runtime_error} runtime errors. All clips remain available for review.`;
}
function parakeetStatus(check,modality){
  if(modality==="text")return "Text baseline: no speech recognizer is applied to these words. Select Audio to inspect the corresponding recording.";
  if(!check)return "A Parakeet transcript check has not been added for this clip.";
  if(check.status==="runtime_error")return "The automated check encountered a runtime error. The clip remains available for listening review.";
  if(check.status==="empty_transcript")return "Parakeet did not produce a transcript for this clip. This is a transcript mismatch, not a runtime error; review the audio directly.";
  return check.lexical_match?"Parakeet’s normalized words match the expected exposed words. Listening review is still pending.":"Parakeet’s transcript differs from the expected exposed words. Review the audio and cut; the transcript alone does not establish which words are audible.";
}
function reviewQueue(presentations,scope){return scope==="uncertain"?presentations.filter(row=>row.parakeet_check?.uncertain===true):presentations;}
function itemSetPresentations(presentations,newPairIds,itemSet){const added=new Set(newPairIds||[]);return itemSet==="added"?presentations.filter(row=>added.has(row.pair_id)):presentations;}
function selectedCheckSummary(presentations){if(!presentations.length||presentations.some(row=>!row.parakeet_check))return null;const counts={lexical_match:0,lexical_mismatch:0,empty_transcript:0,runtime_error:0};for(const row of presentations){const check=row.parakeet_check;counts[check.status==="runtime_error"?"runtime_error":check.lexical_match?"lexical_match":"lexical_mismatch"]++;if(check.status==="empty_transcript")counts.empty_transcript++;}return {expected:presentations.length,completed:presentations.length,counts};}
function reviewReasons(check){const labels={ctc_whisper_endpoint_disagreement_over_120ms:"Automatic endpoint comparison differs by more than 120 ms",parakeet_exposed_word_mismatch:"Parakeet recognized missing, extra or different words",parakeet_timestamp_outside_clip_or_reversed:"Parakeet assigned an invalid word timing (zero duration, reversed, or outside the clip)",low_ctc_separator_emission_score:"Low alignment score at the word separator",parakeet_empty_transcript:"Parakeet returned an empty transcript",parakeet_word_timestamps_missing:"Parakeet word timings are missing",low_ctc_final_word_emission_score:"Low alignment score for the final word",parakeet_timestamp_words_differ_from_transcript:"Parakeet word timings contain different words from its transcript"};return (check?.review_reasons||[]).map(reason=>{if(reason==="parakeet_exposed_word_mismatch"&&Object.values(check.word_errors||{}).length===3&&Object.values(check.word_errors).every(Number.isFinite))return `Parakeet transcript: ${check.word_errors.missing} missing, ${check.word_errors.extra} extra and ${check.word_errors.different} substituted words`;if(reason==="ctc_whisper_endpoint_disagreement_over_120ms"&&Number.isFinite(check.boundary_evidence?.comparison_s))return `Automatic endpoint comparison differs by ${Math.round(Math.abs(check.boundary_evidence.comparison_s)*1000)} ms (120 ms review threshold)`;return labels[reason]||reason.replaceAll("_"," ");});}
function reviewStorageKey(buildId){return "sentence_fit_quality_review_v1__"+buildId;}
function qualityProgress(presentations,responses){const decisions=new Map(responses.filter(row=>["fits","needs_adjustment","unsure"].includes(row.human_quality_decision)).map(row=>[row.presentation_id,row]));const reviewed=row=>decisions.get(row.presentation_id)?.audio_sha256===row.audio_sha256;const uncertain=reviewQueue(presentations,"uncertain");return {reviewed:presentations.filter(reviewed).length,total:presentations.length,uncertain_reviewed:uncertain.filter(reviewed).length,uncertain_total:uncertain.length,next:uncertain.find(row=>!reviewed(row))||null};}
function restorableResponses(saved,manifest){if(!saved||saved.build_id!==manifest.build_id||saved.triage_sha256!==(manifest.parakeet_summary?.triage_sha256||null)||saved.parakeet_checks_sha256!==(manifest.parakeet_summary?.checks_sha256||null))return [];const audio=new Map(manifest.presentations.map(row=>[row.presentation_id,row]));return (saved.responses||[]).filter(row=>{const source=audio.get(row.presentation_id);if(source)return row.audio_sha256===source.audio_sha256;return row.modality==="text"&&typeof row.presentation_id==="string"&&row.presentation_id.endsWith("__text")&&audio.get(row.presentation_id.slice(0,-6))?.source_type==="original";});}
function compatibleResponses(saved,manifest){
  if(!saved||saved.build_id===manifest.build_id||!Array.isArray(saved.responses))return [];
  const entries=(manifest.compatible_review_builds||[]).filter(entry=>entry.build_id===saved.build_id);
  if(entries.length!==1)return [];const allowed=entries[0];
  if(saved.triage_sha256!==allowed.triage_sha256||saved.parakeet_checks_sha256!==allowed.checks_sha256)return [];
  const ids=new Set(allowed.presentation_ids),audio=new Map(manifest.presentations.map(row=>[row.presentation_id,row]));
  return saved.responses.filter(row=>{const source=audio.get(row.presentation_id);return ids.has(row.presentation_id)&&source&&row.modality==="audio"&&row.audio_sha256===source.audio_sha256&&row.pair_id===source.pair_id&&row.gate===source.gate&&row.source_version===(source.version_id||"original")&&row.triage_sha256===allowed.triage_sha256&&row.parakeet_checks_sha256===allowed.checks_sha256;}).map(row=>({...row,restored_from_build_id:saved.build_id,restored_source_record:JSON.parse(JSON.stringify(row)),restoration_is_new_human_data:false,current_build_id:manifest.build_id,current_triage_sha256:manifest.parakeet_summary?.triage_sha256||null,current_parakeet_checks_sha256:manifest.parakeet_summary?.checks_sha256||null}));
}
function mergeStoredResponses(currentSaved,compatibleSaved,manifest){const merged=new Map();for(const saved of compatibleSaved)for(const row of compatibleResponses(saved,manifest))if(!merged.has(row.presentation_id))merged.set(row.presentation_id,row);for(const row of restorableResponses(currentSaved,manifest))merged.set(row.presentation_id,row);return [...merged.values()];}
if(typeof module!=="undefined")module.exports={newPlayback,canComplete,choiceOrder,availableSources,selectPresentation,parakeetSummary,parakeetStatus,reviewQueue,itemSetPresentations,selectedCheckSummary,reviewReasons,reviewStorageKey,qualityProgress,restorableResponses,compatibleResponses,mergeStoredResponses};

if(typeof document!=="undefined"){
const $=id=>document.getElementById(id);
const audio=$("audio");
let manifest=null,current=null,playback=newPlayback(),order=[],replayReset=false;
const feedback=new Map();
const sessionId=globalThis.crypto?.randomUUID?.()||`local_${Date.now()}_${Math.random().toString(16).slice(2)}`;
const events=[];
const textQuestion="Which of these two sentences do these words seem more likely to be part of?";
function record(type,details={}){events.push({type,presentation_id:current?.presentation_id||null,at:new Date().toISOString(),...details});}
function selectedPresentations(){return itemSetPresentations(manifest.presentations,manifest.new_pair_ids,$("item-set").value);}
function refreshProgress(){const progress=qualityProgress(selectedPresentations(),[...feedback.values()]);$("quality-progress").textContent=`Reviewed ${progress.uncertain_reviewed}/${progress.uncertain_total} uncertain cuts; ${progress.reviewed}/${progress.total} clips in this item set.`;$("next-unreviewed").disabled=!progress.next;}
function persistFeedback(){try{localStorage.setItem(reviewStorageKey(manifest.build_id),JSON.stringify({schema_version:1,build_id:manifest.build_id,triage_sha256:manifest.parakeet_summary?.triage_sha256||null,parakeet_checks_sha256:manifest.parakeet_summary?.checks_sha256||null,responses:[...feedback.values()]}));}catch(error){$("export-status").textContent="Browser storage is unavailable. Export feedback before leaving this page.";}refreshProgress();}
function restoreFeedback(){const readSaved=buildId=>{try{return JSON.parse(localStorage.getItem(reviewStorageKey(buildId))||"null");}catch(error){return null;}};const currentSaved=readSaved(manifest.build_id),oldSaved=(manifest.compatible_review_builds||[]).map(entry=>readSaved(entry.build_id));for(const row of mergeStoredResponses(currentSaved,oldSaved,manifest))feedback.set(row.presentation_id,row);const imported=[...feedback.values()].filter(row=>row.restored_from_build_id).length;if(imported)$("export-status").textContent=`Restored ${imported} existing review records for unchanged clips. These remain prior reviews; no new listening is implied.`;}
function entry(){if(!feedback.has(current.presentation_id))feedback.set(current.presentation_id,{presentation_id:current.presentation_id,pair_id:current.pair_id,gate:current.gate,modality:current.modality,source_version:current.modality==="text"?"text":current.version_id||"original",question:current.modality==="text"?textQuestion:manifest.question,audio_sha256:current.modality==="text"?null:current.audio_sha256,triage_sha256:manifest.parakeet_summary?.triage_sha256||null,parakeet_checks_sha256:manifest.parakeet_summary?.checks_sha256||null,display_order:[...order],choice:null,cut_review:null,human_quality_decision:null,notes:"",technical_problem:false,first_play_completed:current.modality==="text"?null:false});return feedback.get(current.presentation_id);}
function enableChoices(enabled){$("choice-a").disabled=!enabled;$("choice-b").disabled=!enabled;for(const id of ["cut-fits","cut-adjust","cut-unsure"])$(id).disabled=!enabled||current?.modality==="text";}
function setPlayStatus(text){$("playback-status").textContent=text;}
function choose(index){if(!playback.completed)return;const row=entry();row.choice=order[index];row.choice_position=index===0?"A":"B";row.chosen_sentence=current.sentences[order[index]];row.choice_at=new Date().toISOString();row.first_play_completed=current.modality==="text"?null:true;for(const [i,id]of["choice-a","choice-b"].entries())$(id).classList.toggle("selected",i===index);$("choice-status").textContent=`Selected ${row.choice_position}. You can change your choice.`;record("choice",{choice:row.choice,position:row.choice_position});persistFeedback();}
function render(target=null){
  if(!target?.presentation_id)target=null;
  const modality=$("modality").value,selected=selectedPresentations(),uncertain=reviewQueue(selected,"uncertain").length;
  $("review-scope").options[0].textContent=`Uncertain cuts (${uncertain})`;$("review-scope").options[0].disabled=!uncertain;$("review-scope").options[1].textContent=`All clips (${selected.length})`;if(!uncertain)$("review-scope").value="all";
  const pool=modality==="text"?selected:reviewQueue(selected,$("review-scope").value);
  const previousPair=target?.pair_id||$("item").value,previousGate=target?.gate||$("gate").value,previousSource=target?.version_id||$("source").value;
  const items=[...new Map(pool.map(row=>[row.pair_id,row])).values()];$("item").replaceChildren();for(const row of items){const option=document.createElement("option");option.value=row.pair_id;option.textContent=`Item ${row.candidate_number}`;$("item").append(option);}
  $("item").value=items.some(row=>row.pair_id===previousPair)?previousPair:items[0].pair_id;
  const pairId=$("item").value,gates=[...new Set(pool.filter(row=>row.pair_id===pairId).map(row=>row.gate))];for(const option of $("gate").options)option.disabled=!gates.includes(option.value);$("gate").value=gates.includes(previousGate)?previousGate:gates[0];
  const gate=$("gate").value,sources=availableSources(pool,pairId,gate);
  $("source").replaceChildren();for(const source of sources){const option=document.createElement("option");option.value=source;option.textContent=sourceLabel(source);$("source").append(option);}
  $("source").value=modality==="text"?"original":sources.includes(previousSource)?previousSource:sources[0];$("source").disabled=modality==="text"||sources.length<=1;
  const next=selectPresentation(selected,pairId,gate,$("source").value,modality);
  if(!next)throw new Error("This item does not have the selected audio cut.");
  audio.pause();current={...next,modality,presentation_id:next.presentation_id+(modality==="text"?"__text":"")};playback=newPlayback();replayReset=false;audio.src=current.audio;audio.load();
  order=choiceOrder(`${pairId}_${gate}`);
  ["choice-a","choice-b"].forEach((id,i)=>{$(id).querySelector(".sentence").textContent=current.sentences[order[i]];$(id).classList.remove("selected");$(id).setAttribute("aria-label",`${i===0?"A":"B"}: ${current.sentences[order[i]]}`);});
  enableChoices(modality==="text");if(modality==="text")playback.completed=true;$("play").disabled=false;$("play").textContent="Play audio";$("replay").disabled=true;$("problem").disabled=false;$("notes").disabled=false;$("export").disabled=false;
  $("player").hidden=modality==="text";$("text-stimulus").hidden=modality!=="text";$("text-stimulus").textContent=current.exposed_text;
  $("question").textContent=modality==="text"?textQuestion:manifest.question;
  $("instructions").textContent=modality==="text"?"Read the words below. Both sentences may match them. Choose the sentence that seems to fit better.":"You will hear a short extract. Both sentences may match the words you hear. Listen to how the words are said, then choose the sentence that seems to fit better.";
  $("problem").textContent=modality==="text"?"Report a display problem":"Report a playback problem";
  const saved=feedback.get(current.presentation_id);$("notes").value=saved?.notes||"";
  $("review-scope").disabled=modality==="text";const queueIndex=pool.findIndex(row=>row.presentation_id===next.presentation_id);$("queue-position").textContent=modality==="text"?"Text baseline · one presentation per item and cut":`Cut ${queueIndex+1} of ${pool.length} in ${$("review-scope").value==="uncertain"?"uncertain-cut queue":"all clips"}`;$("previous-cut").disabled=modality==="text"||queueIndex<=0;$("next-cut").disabled=modality==="text"||queueIndex>=pool.length-1;
  const triage=current.parakeet_check;$("cut-review-reasons").textContent=modality==="text"?"Cut feedback applies to audio only.":triage?triage.uncertain?"Flagged for review: "+reviewReasons(triage).join("; "):"No uncertainty flags from the automated checks. Listening approval remains pending.":"Automated cut triage is pending.";
  $("cut-review-status").textContent=saved?.cut_review?`Saved cut feedback: ${saved.cut_review}. Listen again before changing it.`:"Listen to the clip before recording cut feedback.";for(const[id,value]of[["cut-fits","fits"],["cut-adjust","needs_adjustment"],["cut-unsure","unsure"]])$(id).classList.toggle("selected",saved?.cut_review===value);
  $("choice-status").textContent=saved?.choice?(modality==="text"?"A previous preview choice is saved. You can change it.":"A previous preview choice is saved. Listen again before changing it."):(modality==="text"?"Choose the sentence that seems to fit better.":"Choose after listening.");
  setPlayStatus("Complete one listen to choose.");
  $("source-status").textContent=modality==="text"?"Text baseline: one exposed-word presentation per item and cut, shared across all audio versions.":current.canonical_playback?"Canonical playback used for SC, with one common gain within each batch. Boundary and listening review remain pending; participant release is not approved.":current.source_type==="tts"?"Technical native cut: boundary and playback review pending. Native levels have not been matched across versions; this is not a participant-ready stimulus.":"Original recording: existing playback audio reused for this new task. The new task remains under review.";
  const originalCount=selected.filter(row=>row.source_type==="original").length;$("availability").textContent=`Selected item set: ${originalCount} original cuts, ${selected.length-originalCount} technical TTS cuts and ${originalCount} unique text presentations.`;$("automated-summary").textContent=parakeetSummary(selectedCheckSummary(selected));
  const fields=[["Presentation",current.presentation_id],["Source",modality==="text"?"Text baseline":sourceLabel(current.version_id||"original")],["Exposed words",current.exposed_text],["Audio review",current.review_status],["Sentence review",current.pair_review_status||"Draft"],["Playback status",current.playback_status||"New-task review pending"],["Review flags",current.flags.length?current.flags.join("; "):"None recorded"],["Audio SHA-256",modality==="text"?"Not applicable":current.audio_sha256]];
  $("provenance").replaceChildren();for(const[label,value]of fields){const dt=document.createElement("dt"),dd=document.createElement("dd");dt.textContent=label;dd.textContent=value;$("provenance").append(dt,dd);}
  const check=current.parakeet_check;$("parakeet-status").textContent=parakeetStatus(check,modality);$("parakeet-check").replaceChildren();
  if(modality==="audio"&&check){
    const checks=[["Expected exposed words",check.expected_exposed_text],["Parakeet transcript",check.transcript||"No transcript produced"],["Word differences",!Number.isFinite(check.edit_distance)||!Number.isFinite(check.word_error_rate)?"Not available":`${check.edit_distance} word edits; ${Math.round(check.word_error_rate*100)}% word error rate`],["Final expected word",check.final_word_match===null?"Not available":check.final_word_match?"Matches the transcript ending":"Differs from the transcript ending"],["Review reasons",check.uncertain?reviewReasons(check).join("; "):"No uncertainty flags from automated checks"],["Review state","Automated evidence only; listening review pending"]];
    for(const[label,value]of checks){const dt=document.createElement("dt"),dd=document.createElement("dd");dt.textContent=label;dd.textContent=value;$("parakeet-check").append(dt,dd);}
  }
  record("presentation_opened");refreshProgress();
}
$("play").addEventListener("click",async()=>{
  if(!audio.paused){audio.pause();return;}
  if(audio.ended){replayReset=true;audio.currentTime=0;playback.startedAtZero=false;playback.invalid=false;}
  try{await audio.play();}catch(error){setPlayStatus("Playback could not start. Try again or report a problem.");record("playback_error",{message:String(error)});}
});
$("replay").addEventListener("click",async()=>{audio.pause();replayReset=true;audio.currentTime=0;playback.startedAtZero=false;playback.invalid=false;try{await audio.play();}catch(error){setPlayStatus("Replay could not start.");}});
audio.addEventListener("play",()=>{if(audio.currentTime<=.08)playback.startedAtZero=true;$("play").textContent="Pause";setPlayStatus("Listening…");record("play",{current_time:audio.currentTime});});
audio.addEventListener("pause",()=>{if(audio.ended)return;$("play").textContent="Continue";if(current)setPlayStatus(playback.completed?"Listen complete. You can choose or replay.":"Paused. Continue to finish listening.");});
audio.addEventListener("seeking",()=>{if(current?.modality==="text")return;if(!replayReset){playback.invalid=true;enableChoices(false);setPlayStatus("Please replay from the beginning before choosing.");}record("seeking",{current_time:audio.currentTime});});
audio.addEventListener("seeked",()=>{replayReset=false;});
audio.addEventListener("ended",()=>{
  if(current?.modality==="text")return;
  const ranges=[];for(let i=0;i<audio.played.length;i++)ranges.push([audio.played.start(i),audio.played.end(i)]);
  if(canComplete(playback,ranges,audio.duration,audio.currentTime)){
    playback.completed=true;entry().first_play_completed=true;enableChoices(true);setPlayStatus("Listen complete. Choose the sentence that fits better.");record("first_play_completed");
  }else{enableChoices(false);setPlayStatus("Please replay the complete clip before choosing.");}
  $("play").textContent="Play again";$("replay").disabled=false;record("ended",{completed:playback.completed});
});
audio.addEventListener("error",()=>{if(current?.modality==="text")return;playback.invalid=true;enableChoices(false);setPlayStatus("Audio could not be loaded. Report a playback problem.");if(current)record("audio_error",{code:audio.error?.code});});
$("choice-a").addEventListener("click",()=>choose(0));$("choice-b").addEventListener("click",()=>choose(1));
for(const[id,value]of[["cut-fits","fits"],["cut-adjust","needs_adjustment"],["cut-unsure","unsure"]])$(id).addEventListener("click",()=>{if(!playback.completed||current.modality!=="audio")return;const row=entry();row.cut_review=value;row.human_quality_decision=value;row.cut_review_at=new Date().toISOString();for(const other of ["cut-fits","cut-adjust","cut-unsure"])$(other).classList.toggle("selected",other===id);$("cut-review-status").textContent=`Saved cut feedback: ${value}. Add details in the review note below.`;record("cut_review",{cut_review:value});persistFeedback();});
$("problem").addEventListener("click",()=>{entry().technical_problem=true;record("technical_problem");$("choice-status").textContent="Technical problem recorded for this preview. You can add details below.";persistFeedback();});
$("notes").addEventListener("input",()=>{entry().notes=$("notes").value;persistFeedback();});
$("item").addEventListener("change",render);$("gate").addEventListener("change",render);$("modality").addEventListener("change",render);$("source").addEventListener("change",render);
$("item-set").addEventListener("change",render);$("review-scope").addEventListener("change",render);for(const[id,step]of[["previous-cut",-1],["next-cut",1]])$(id).addEventListener("click",()=>{const queue=reviewQueue(selectedPresentations(),$("review-scope").value),index=queue.findIndex(row=>row.presentation_id===current.presentation_id),target=queue[index+step];if(target)render(target);});
$("next-unreviewed").addEventListener("click",()=>{const target=qualityProgress(selectedPresentations(),[...feedback.values()]).next;if(target){$("modality").value="audio";$("review-scope").value="uncertain";render(target);}});
$("export").addEventListener("click",()=>{
 const output={protocol:manifest.protocol,build_id:manifest.build_id,question:manifest.question,purpose:"technical_cut_review_and_prototype_feedback",participant_data:false,triage_sha256:manifest.parakeet_summary?.triage_sha256||null,parakeet_checks_sha256:manifest.parakeet_summary?.checks_sha256||null,session_id:sessionId,exported_at:new Date().toISOString(),responses:[...feedback.values()],events};
 const blob=new Blob([JSON.stringify(output,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=`sentence_fit_preview_${new Date().toISOString().replace(/[:.]/g,"-")}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$("export-status").textContent=`Exported ${feedback.size} item/cut feedback records. These are prototype feedback.`;
});
fetch("data.json",{cache:"no-store"}).then(response=>{if(!response.ok)throw new Error("Preview data is not built yet. Run scripts/build_preview.py after material preparation.");return response.json();}).then(data=>{
 manifest=data;restoreFeedback();$("question").textContent=data.question;const hasAdded=itemSetPresentations(data.presentations,data.new_pair_ids,"added").length>0;$("item-set").options[0].disabled=!hasAdded;$("item-set").value=hasAdded?"added":"all";$("item-set").disabled=false;const uncertain=reviewQueue(selectedPresentations(),"uncertain").length;$("review-scope").value=uncertain?"uncertain":"all";$("review-scope").disabled=false;
 $("availability").textContent=`Available: ${data.availability.original} original cuts, ${data.availability.new_tts||0} technical TTS cuts and ${data.availability.text} unique text presentations.`;
 $("automated-summary").textContent=parakeetSummary(data.parakeet_summary);
 $("pending-status").textContent=`Boundary and listening review remain pending; SC outputs are not included in this preview${data.availability.expected_tts?`; ${data.availability.new_tts||0}/${data.availability.expected_tts} TTS cuts available`:""}.`;
 $("build").textContent=`${data.protocol} · ${data.build_id}`;$("item").disabled=false;$("gate").disabled=false;$("modality").disabled=false;render();if(feedback.size)persistFeedback();
}).catch(error=>{$("fatal").hidden=false;$("fatal").textContent=String(error.message||error);$("availability").textContent="Materials unavailable.";});
}
