(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.Study40Core=api;})(globalThis,function(){
  'use strict';
  const STORAGE_PREFIX='candor_study40_v1';
  const TASKS=['question_projection','possible_completion'];
  const OPTIONS={question_projection:[['question','Yes'],['non_question','No'],['unsure','Unsure']],possible_completion:[['could_finish_here','Could finish here'],['more_speech_expected','More speech expected'],['unsure','Unsure']]};
  const copy=value=>JSON.parse(JSON.stringify(value));
  const identity=ids=>[ids.PROLIFIC_PID,ids.STUDY_ID,ids.SESSION_ID].join('::');
  function materialExposure(raw,at){
    let value;try{value=typeof raw==='string'?JSON.parse(raw):raw;}catch(_){return {scope:'this_browser_and_site_only',observed_at:at,readable:false,presentations:{}};}
    const presentations={};
    for(const [id,time]of Object.entries(value?.presentations||{}))if(/^p_[a-f0-9]+$/.test(id)&&typeof time==='string'&&Number.isFinite(Date.parse(time)))presentations[id]=time;
    return {scope:'this_browser_and_site_only',observed_at:at,readable:true,presentations};
  }
  function question(task,modality){
    if(task==='question_projection')return modality==='audio'?'Does this sound like someone asking a question, or starting to ask one?':'Do these words suggest someone asking a question, or starting to ask one?';
    return modality==='audio'?'At this point, could the speaker reasonably finish, or does more speech sound expected?':'At this point, could the speaker reasonably finish, or do more words seem expected?';
  }
  function catalog(data){
    if(data.schema_version!==1||!data.build_id||!Array.isArray(data.cohorts)||!data.presentations)throw Error('Study materials could not be read.');
    const lists=new Map(),presentations=new Map(Object.entries(data.presentations));
    for(const [id,row] of presentations){
      if(row.presentation_id!==id||!TASKS.includes(row.task)||!['audio','text'].includes(row.modality)||typeof row.ready!=='boolean')throw Error('A study item has an invalid identity.');
      if(row.ready){
        if(!row.input_fingerprint)throw Error('A study item is missing its content identity.');
        if(row.modality==='text'&&(typeof row.text!=='string'||!row.text||/[.?!,;:]/.test(row.text)))throw Error('The text item must contain unpunctuated words.');
        if(row.modality==='audio'&&(typeof row.audio_url!=='string'||!/^(?:https:\/\/shreeharsha-bs\.github\.io\/candor-audibility-study\/study40\/)?audio\/p_[a-f0-9]+(?:_[a-f0-9]{12})?\.wav$/.test(row.audio_url)))throw Error('An audio item has an invalid filename.');
      }
    }
    for(const cohort of data.cohorts){
      if(!cohort.cohort_id||cohort.lists.length!==42)throw Error('A study cohort needs 42 assigned lists.');
      const conditions=new Set();
      for(const list of cohort.lists){
        if(!Number.isInteger(list.condition_number)||list.condition_number<1||list.condition_number>42||conditions.has(list.condition_number)||lists.has(list.list_id)||list.blocks.length!==2)throw Error('A study assignment is invalid.');
        conditions.add(list.condition_number);
        const trials=[];
        for(const block of list.blocks){
          if(!TASKS.includes(block.task))throw Error('A study block has an unknown question.');
          for(const trial of block.trials){
            const row=presentations.get(trial.presentation_id);
            if(!row||row.task!==block.task)throw Error('A study item does not match its block.');
            trials.push({...trial,...row,block_index:block.block_index});
          }
        }
        if(trials.length!==40||new Set(trials.map(t=>t.presentation_id)).size!==40||trials.filter(t=>t.task==='question_projection').length!==28||trials.filter(t=>t.task==='possible_completion').length!==12||new Set(list.blocks.map(b=>b.task)).size!==2)throw Error('A study list must have 28 question and 12 completion items.');
        lists.set(list.list_id,{...list,cohort_id:cohort.cohort_id,trials});
      }
    }
    return {data,lists,presentations};
  }
  function chooseAssignment(c,config,ids,serverCondition,query){
    const live=config.mode==='live',params=query||new URLSearchParams();
    if(live){
      const ready=['consent_approved','production_frozen','hosted_save_export_verified','duplicate_check_verified'];
      if(ready.some(name=>config[name]!==true)||c.data.production_frozen!==true||!config.consent_paragraphs?.length)throw Error('This study is not open yet. Please return to the study invitation.');
      if(Object.values(ids).length!==3||Object.values(ids).some(v=>typeof v!=='string'||!v.trim()||/[{}]/.test(v)))throw Error('Please open the study using your participant invitation.');
      if(params.has('condition')||params.has('list')||params.has('cohort'))throw Error('Please use the original participant invitation link.');
    }
    const explicitList=!live&&params.get('list')?c.lists.get(params.get('list')):null;
    if(!live&&params.get('list')&&!explicitList)throw Error('That preview list is unavailable.');
    const cohort=live?config.cohort_id:(explicitList?.cohort_id||params.get('cohort')||config.preview_assignment?.cohort_id||config.cohort_id||c.data.cohorts[0].cohort_id);
    const condition=live||config.host==='cognition'?Number(serverCondition):Number(explicitList?.condition_number||params.get('condition')||config.preview_assignment?.condition_number||1);
    if(!Number.isInteger(condition)||condition<1||condition>42)throw Error('A study list has not been assigned. Please reopen your invitation.');
    const list=[...c.lists.values()].find(x=>x.cohort_id===cohort&&x.condition_number===condition);
    if(!list)throw Error('The assigned study list is unavailable.');
    if(live&&list.trials.some(row=>!row.ready))throw Error('This study is not open yet. Please return to the study invitation.');
    const trials=list.trials;
    return {build_id:c.data.build_id,schedule_id:c.data.schedule_id,cohort_id:cohort,list_id:list.list_id,condition_number:condition,mode:live?'live':'preview',ids:copy(ids),trials:copy(trials)};
  }
  function stateKey(a){return STORAGE_PREFIX+':'+a.mode+':'+identity(a.ids);}
  function claim(registry,a,now){
    const result=copy(registry||{}),id=a.ids.PROLIFIC_PID,old=result[id];
    if(old&&(old.identity!==identity(a.ids)||old.cohort_id!==a.cohort_id||old.list_id!==a.list_id||old.build_id!==a.build_id))throw Error('A study session has already been started for this participant. Please return to that session.');
    result[id]=old||{identity:identity(a.ids),cohort_id:a.cohort_id,list_id:a.list_id,build_id:a.build_id,started_at:now,completed:false};
    return result;
  }
  function prepareState(saved,a,now){
    if(!saved)return {schema_version:1,assignment:copy(a),created_at:now,consent:null,hearing:null,headphones:null,instructions_seen:[],breaks_taken:[],responses:[],draft:null,status:'active',feedback:null,save_acknowledged:false};
    const s=copy(saved);
    if(s.schema_version!==1||!Array.isArray(s.responses)||identity(s.assignment?.ids||{})!==identity(a.ids)||s.assignment.build_id!==a.build_id||s.assignment.list_id!==a.list_id||s.assignment.mode!==a.mode||JSON.stringify(s.assignment.trials)!==JSON.stringify(a.trials))throw Error('The study changed after this session began. Your saved responses have been kept. Please contact the researcher.');
    if(s.responses.length>a.trials.length||s.responses.some((r,i)=>r.presentation_id!==a.trials[i].presentation_id)||new Set(s.responses.map(r=>r.presentation_id)).size!==s.responses.length)throw Error('Saved progress could not be read. Your responses have been kept. Please contact the researcher.');
    return s;
  }
  const current=s=>s.assignment.trials[s.responses.length]||null;
  function startTrial(s,now){
    const row=current(s);if(!row||s.status!=='active')return null;
    if(s.draft?.presentation_id===row.presentation_id)return s.draft;
    s.draft={presentation_id:row.presentation_id,started_at:now,answer:null,note:'',technical_problem:null,play_count:0,audio_started:false,audio_ended:false,playback_errors:[],playback_events:[],max_audio_time_s:0};
    return s.draft;
  }
  function commit(s,draft,now){
    const row=current(s);
    if(!row||s.status!=='active'||draft.presentation_id!==row.presentation_id)throw Error('This item has already been saved.');
    if(!row.ready)throw Error('This preview item is not available for a judgment.');
    if(draft.technical_problem){
      if(!['audio_load','audio_playback','display','other'].includes(draft.technical_problem)||draft.answer!==null)throw Error('A technical problem must be recorded separately from an answer.');
    }else if(!OPTIONS[row.task].some(([value])=>value===draft.answer))throw Error('Please choose an answer, or report a technical problem.');
    const duration=Date.parse(now)-Date.parse(draft.started_at);
    if(!Number.isFinite(duration)||duration<0)throw Error('Response timing could not be recorded. Please try again.');
    const record={schema_version:1,record_type:'judgment',response_id:identity(s.assignment.ids)+'::'+row.presentation_id,...copy(s.assignment.ids),build_id:s.assignment.build_id,schedule_id:s.assignment.schedule_id,cohort_id:s.assignment.cohort_id,list_id:s.assignment.list_id,condition_number:s.assignment.condition_number,run_mode:s.assignment.mode,trial_id:row.presentation_id,presentation_id:row.presentation_id,trial_index:s.responses.length+1,presented_trial_index:s.responses.length+1,scheduled_trial_index:row.trial_index,block_index:row.block_index,task:row.task,modality:row.modality,input_fingerprint:row.input_fingerprint,...copy(draft),responded_at:now,response_time_ms:duration,hearing:s.hearing,headphones:s.headphones,consent_at:s.consent?.at||null};
    s.responses.push(record);s.draft=null;return record;
  }
  function skipUnavailable(s,now){
    const row=current(s);
    if(s.assignment.mode!=='preview'||!row||row.ready||s.status!=='active')throw Error('Only an unavailable preview item can be skipped.');
    const record={record_type:'preview_unavailable',...copy(s.assignment.ids),response_id:identity(s.assignment.ids)+'::'+row.presentation_id,build_id:s.assignment.build_id,schedule_id:s.assignment.schedule_id,cohort_id:s.assignment.cohort_id,list_id:s.assignment.list_id,run_mode:'preview',presentation_id:row.presentation_id,trial_id:row.presentation_id,presented_trial_index:s.responses.length+1,scheduled_trial_index:row.trial_index,block_index:row.block_index,task:row.task,modality:row.modality,at:now};
    s.responses.push(record);s.draft=null;return record;
  }
  function finish(s,feedback,now){
    if(current(s)||s.status!=='active')throw Error('The study is not ready to finish.');
    s.feedback=String(feedback||'');s.finished_at=now;s.status='awaiting_save';
    return {record_type:'completion',...copy(s.assignment.ids),build_id:s.assignment.build_id,schedule_id:s.assignment.schedule_id,cohort_id:s.assignment.cohort_id,list_id:s.assignment.list_id,run_mode:s.assignment.mode,response_count:s.responses.length,feedback:s.feedback,finished_at:now};
  }
  function acknowledge(s,receipt,now){
    if(s.status!=='awaiting_save'||receipt?.acknowledged!==true)throw Error('The final save has not been confirmed.');
    s.save_acknowledged=true;s.save_receipt=copy(receipt);s.status='completed';s.completed_at=now;
  }
  function completionUrl(s,config){
    if(s.status!=='completed'||!s.save_acknowledged||s.assignment.mode!=='live')return null;
    let url;try{url=new URL(config.completion_url);}catch(_){throw Error('The return link is unavailable. Please contact the researcher.');}
    if(url.protocol!=='https:'||url.hostname!=='app.prolific.com'||url.pathname!=='/submissions/complete'||!url.searchParams.get('cc'))throw Error('The return link is unavailable. Please contact the researcher.');
    return url.href;
  }
  function validateServerEnvelope(record,assignment,seen){
    if(identity(record)!==identity(assignment.ids)||record.build_id!==assignment.build_id||record.cohort_id!==assignment.cohort_id||record.list_id!==assignment.list_id)throw Error('Response assignment mismatch.');
    const row=assignment.trials[(record.presented_trial_index||record.trial_index)-1];
    if(!row||row.presentation_id!==record.presentation_id||row.input_fingerprint!==record.input_fingerprint||row.task!==record.task||row.modality!==record.modality)throw Error('Response item mismatch.');
    if(seen?.has(record.response_id))throw Error('Duplicate response ID.');
    if(record.technical_problem?record.answer!==null:!OPTIONS[row.task].some(([v])=>v===record.answer))throw Error('Invalid response value.');
    return true;
  }
  return {STORAGE_PREFIX,TASKS,OPTIONS,identity,materialExposure,question,catalog,chooseAssignment,stateKey,claim,prepareState,current,startTrial,commit,skipUnavailable,finish,acknowledge,completionUrl,validateServerEnvelope};
});
