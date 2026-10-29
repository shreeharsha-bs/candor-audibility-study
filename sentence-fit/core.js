(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SentenceFitCore=api;})(globalThis,function(){
  'use strict';
  const AUDIO_QUESTION='Which of these two sentences does the audio sound more likely to be part of?';
  const TEXT_QUESTION='Which of these two sentences do these words seem more likely to be part of?';
  const PROBLEMS=new Set(['audio_load','audio_playback','display','other']);
  function require(ok,message){if(!ok)throw new Error(message);}
  function normalizeTrial(row,index=0){
    require(row&&typeof row==='object','Study item is missing.');
    require(['audio','text'].includes(row.modality),'Study item has an unknown presentation type.');
    const trial={...row,trial_id:row.trial_id||row.presentation_id,presentation_id:row.presentation_id||row.trial_id,audio_url:row.audio_url||row.audio||null,exposed_text:row.exposed_text??row.text??'',phase:row.phase||'main',position:row.position??index+1};
    require(typeof trial.trial_id==='string'&&trial.trial_id&&typeof trial.presentation_id==='string'&&trial.presentation_id,'Study item identity is missing.');
    require(['main','practice','volume_check'].includes(trial.phase),'Unknown study phase.');
    if(trial.phase==='volume_check'){trial.options=[];trial.question='Check your listening volume';require(row.modality==='audio','The sound check requires audio.');}
    else{
      require(Array.isArray(row.options)&&row.options.length===2,'Two sentence choices are required.');
      trial.options=row.options.map((option,i)=>({id:option.id||option.label||['A','B'][i],text:option.text}));
      require(trial.options.every((option,i)=>option.id===['A','B'][i]&&typeof option.text==='string'&&option.text.trim()),'Sentence choices must contain the supplied A and B texts in order.');
      trial.question=row.modality==='audio'?AUDIO_QUESTION:TEXT_QUESTION;
      require(row.question===undefined||row.question===trial.question,'The study item question differs from the sentence-fit task.');
    }
    if(row.modality==='audio')require(typeof trial.audio_url==='string'&&trial.audio_url,'The audio file is missing.');
    else require(typeof trial.exposed_text==='string'&&trial.exposed_text.trim(),'The displayed words are missing.');
    return trial;
  }
  function normalizeTrials(rows){require(Array.isArray(rows)&&rows.length>0,'The study items could not be loaded.');const trials=rows.map(normalizeTrial);require(new Set(trials.map(row=>row.trial_id)).size===trials.length,'Duplicate study item identity.');return trials;}
  function sequence(rows,preparation){const before=[];if(preparation?.volumeCheck)before.push({...preparation.volumeCheck,trial_id:'sentence_fit_volume_check',presentation_id:'sentence_fit_volume_check',modality:'audio',phase:'volume_check'});for(const row of preparation?.practice||[])before.push({...row,phase:'practice'});return normalizeTrials([...before,...rows.map(row=>({...row,phase:'main'}))]);}
  function progressLabel(trials,index){const phase=trials[index].phase;if(phase==='volume_check')return 'Sound check';return `${phase==='practice'?'Practice':'Item'} ${trials.slice(0,index+1).filter(row=>row.phase===phase).length} of ${trials.filter(row=>row.phase===phase).length}`;}
  function fingerprint(trials){return JSON.stringify(trials.map(row=>[row.trial_id,row.presentation_id,row.phase,row.modality,row.audio_url,row.audio_sha256||null,row.input_sha256||null,row.exposed_text,row.question,row.options]));}
  function storageKey(context){return 'sentence_fit_simple_v1__'+[context.mode,context.build_id,context.list_id,context.session_id].map(value=>encodeURIComponent(String(value))).join('__');}
  function ready(trial,draft){return trial.modality==='text'||draft.first_play_completed===true;}
  function canAdvance(trial,draft){return PROBLEMS.has(draft.technical_problem)||(ready(trial,draft)&&(trial.phase==='volume_check'?draft.volume_confirmed===true:trial.options.some(option=>option.id===draft.choice)));}
  function freshDraft(trial,at){return {trial_id:trial.trial_id,started_at:at,choice:null,technical_problem:null,problem_note:'',volume_confirmed:false,first_play_completed:false,play_count:0,complete_listen_count:0,playback_events:[],playback_errors:[]};}
  function prepareState(saved,context,trials,at){
    const binding=fingerprint(trials);
    if(saved){
      require(saved.schema_version===1&&saved.binding===binding&&saved.context?.build_id===context.build_id&&saved.context?.list_id===context.list_id&&saved.context?.session_id===context.session_id&&saved.context?.mode===context.mode,'The study changed after this session began. Your earlier responses have been kept.');
      require(Array.isArray(saved.responses)&&saved.responses.length<=trials.length,'Saved progress could not be read.');
      saved.responses.forEach((response,i)=>require(response.trial_id===trials[i].trial_id,'Saved progress does not match this study list.'));
      require(!saved.draft||saved.draft.trial_id===trials[saved.responses.length]?.trial_id,'Saved item does not match the study list.');
      return saved;
    }
    return {schema_version:1,context:{...context},binding,started_at:at,responses:[],draft:null,pending_response:null,completed:false};
  }
  function responseFor(trial,draft,context,position,at){
    require(draft.trial_id===trial.trial_id&&canAdvance(trial,draft),'Listen to the whole extract and choose a sentence, or report a technical problem.');
    const problem=PROBLEMS.has(draft.technical_problem),option=problem?null:trial.options.find(item=>item.id===draft.choice);
    require(Number.isFinite(Date.parse(at))&&Number.isFinite(Date.parse(draft.started_at)),'Response timing could not be recorded.');
    return {schema_version:1,record_type:trial.phase==='volume_check'?'volume_check':trial.phase==='practice'?'sentence_fit_practice':problem?'technical_problem':'sentence_fit_response',response_id:[context.session_id,context.list_id,trial.trial_id].map(encodeURIComponent).join('::'),
      protocol_id:context.protocol_id,build_id:context.build_id,schedule_id:context.schedule_id||null,list_id:context.list_id,session_id:context.session_id,mode:context.mode,participant_data:context.mode==='participant',
      host:context.host||null,engineering_qa:context.engineering_qa===true,analysis_excluded:context.analysis_excluded===true||context.mode==='preview',
      trial_id:trial.trial_id,presentation_id:trial.presentation_id,position,phase:trial.phase,modality:trial.modality,question:trial.question,
      audio_sha256:trial.modality==='audio'?(trial.audio_sha256||null):null,input_sha256:trial.input_sha256||null,
      displayed_options:trial.options.map(item=>({...item})),choice:option?.id||null,chosen_sentence:option?.text||null,
      technical_problem:problem?draft.technical_problem:null,problem_note:problem?draft.problem_note||'':null,
      volume_confirmed:trial.phase==='volume_check'?(!problem&&draft.volume_confirmed===true):null,headphones_confirmed:draft.headphones_confirmed===true,
      started_at:draft.started_at,responded_at:at,response_time_ms:Math.max(0,Date.parse(at)-Date.parse(draft.started_at)),
      first_play_completed:trial.modality==='audio'?draft.first_play_completed===true:null,play_count:draft.play_count||0,complete_listen_count:draft.complete_listen_count||0,
      playback_events:JSON.parse(JSON.stringify(draft.playback_events||[])),playback_errors:JSON.parse(JSON.stringify(draft.playback_errors||[]))};
  }
  return {AUDIO_QUESTION,TEXT_QUESTION,normalizeTrial,normalizeTrials,sequence,progressLabel,fingerprint,storageKey,ready,canAdvance,freshDraft,prepareState,responseFor};
});
