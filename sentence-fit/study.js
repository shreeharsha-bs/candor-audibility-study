(function(root){
  'use strict';
  const C=root.SentenceFitCore,now=()=>new Date().toISOString();
  const element=(tag,text,attrs={})=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;for(const[key,value]of Object.entries(attrs))node.setAttribute(key,value);return node;};
  function button(text,action,className=''){const node=element('button',text,{type:'button'});node.className=className;node.addEventListener('click',action);return node;}
  function configuration(options){
    const context={...options.context};
    for(const key of ['protocol_id','build_id','list_id','session_id'])if(typeof context[key]!=='string'||!context[key])throw Error('The study session could not be identified. Please reopen your invitation.');
    if(!['preview','participant'].includes(context.mode))throw Error('The study mode is missing.');
    const trials=C.sequence(options.trials,options.preparation).map(row=>options.assetBase&&row.audio_url?{...row,audio_url:new URL(row.audio_url,options.assetBase).href}:row);
    return {context,trials,storage:options.storage===undefined?root.localStorage:options.storage,key:options.storageKey||C.storageKey(context)};
  }
  function readState(options){const config=configuration(options),raw=config.storage?.getItem(config.key);let saved=null;if(raw){try{saved=JSON.parse(raw);}catch(error){throw Error('Saved progress could not be read. Your earlier responses have been kept.');}}return C.prepareState(saved,config.context,config.trials,now());}
  function savedRecords(state){return JSON.parse(JSON.stringify(state?.responses||[]));}
  function mount(options){
    const container=options.container;
    if(!container)throw Error('The study display is missing.');
    const {context,trials,storage,key}=configuration(options);
    if(context.mode==='participant'&&(!options.onComplete||(!options.onResponse&&!options.onAdvance)))throw Error('The study connection is missing. Please reopen your invitation.');
    let state=readState(options),stopped=false,busy=false,media=null,playback=null,saveTimer=null,completionStarted=false;
    if(state.draft&&trials[state.responses.length]?.modality==='audio'){
      state.draft.first_play_completed=false;state.draft.audio_started=false;state.draft.audio_ended=false;
      state.draft.playback_events=state.draft.playback_events||[];
      state.draft.playback_events.push({event:'resume_requires_new_complete_listen',at:now(),audio_time_s:0});
    }
    const save=()=>{if(storage)storage.setItem(key,JSON.stringify(state));};
    const saveSoon=()=>{clearTimeout(saveTimer);saveTimer=setTimeout(()=>{saveTimer=null;try{save();}catch(error){showError('Your browser could not save progress. Please keep this page open and report the problem.');}},150);};
    function clearPlayer(){if(playback){playback.destroy();playback=null;}if(media){media.pause();media.removeAttribute('src');media.load();media=null;}clearTimeout(saveTimer);saveTimer=null;}
    function stop(){stopped=true;clearPlayer();}
    function showError(message){let node=container.querySelector('[role="alert"]');if(!node){node=element('p',undefined,{role:'alert',class:'error'});container.prepend(node);}node.textContent=message;}
    function resetPage(){clearPlayer();container.replaceChildren();}
    function previewNote(){if(context.mode==='preview'&&context.host!=='cognition')container.append(element('p','Preview · Choices stay in this browser and are separate from participant responses.',{class:'preview-note'}));}
    function renderCompletion(){resetPage();const section=element('section',undefined,{class:'complete'}),localPreview=context.mode==='preview'&&context.host!=='cognition';section.append(element('h1',state.setup_failed?'Sound check incomplete':localPreview?'Preview finished':'Thank you'),element('p',state.setup_failed?'The audio check could not be completed. Please contact the researcher.':localPreview?'You have reached the end of this list.':'You have completed the study.'));container.append(section);
      if(localPreview){
        const actions=element('div',undefined,{class:'completion-actions'});
        actions.append(button('Save my preview responses',()=>{const output={purpose:'sentence_fit_preview',participant_data:false,...state},url=URL.createObjectURL(new Blob([JSON.stringify(output,null,2)],{type:'application/json'})),link=element('a',undefined,{href:url,download:'sentence-fit-preview-responses.json'});link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}));
        section.append(actions);previewNote();
      }
    }
    function acknowledgeCompletion({render=true}={}){state.completed=true;state.completion_status='saved';state.completion_saved_at=now();save();if(render)renderCompletion();}
    const api={stop,getState:()=>JSON.parse(JSON.stringify(state)),acknowledgeCompletion,renderCompletion,storageKey:key};
    async function complete(){
      if(completionStarted||stopped)return;completionStarted=true;
      if(state.completed){renderCompletion();return;}
      state.completion_status='awaiting_save';
      state.completion=state.completion||{schema_version:1,record_type:state.setup_failed?'sentence_fit_setup_failed':'sentence_fit_complete',response_id:[context.session_id,context.list_id,'complete'].map(encodeURIComponent).join('::'),...context,participant_data:context.mode==='participant',response_count:state.responses.length,main_response_count:state.responses.filter(row=>row.phase==='main').length,practice_response_count:state.responses.filter(row=>row.phase==='practice').length,completed_at:now()};
      save();resetPage();container.append(element('h1','Finishing…'),element('p','Please keep this page open while your responses are saved.',{role:'status'}));
      try{if(options.onComplete)await options.onComplete({...state.completion},api);if(context.mode==='preview'&&context.host!=='cognition'&&!stopped)acknowledgeCompletion();}
      catch(error){completionStarted=false;if(!stopped){showError('Your responses could not be saved yet. Please try again.');container.append(button('Try again',()=>complete(),'primary'));}}
    }
    async function deliver(response){
      // The committed response is durable before any host trial can end.
      if(options.onResponse)await options.onResponse({...response},api);
      state.pending_response=null;save();
      if(stopped)return;
      try{if(options.onAdvance)await options.onAdvance({...response},api);}catch(error){state.pending_response=response;save();throw error;}
      if(!stopped){busy=false;render();}
    }
    async function advance(trial,draft){
      if(busy||stopped||!C.canAdvance(trial,draft))return;busy=true;for(const control of container.querySelectorAll('button,select,textarea'))control.disabled=true;
      if(media)media.pause();
      try{
        const position=trial.phase==='volume_check'?null:trials.slice(0,state.responses.length+1).filter(row=>row.phase===trial.phase).length;
        const response=C.responseFor(trial,draft,context,position,now());
        state.responses.push(response);state.draft=null;state.pending_response=response;if(trial.phase==='volume_check'&&response.technical_problem)state.setup_failed=true;save();
        await deliver(response);
      }catch(error){if(!stopped){showError('Your response could not be saved yet. Please try again.');renderPending();}}
      finally{busy=false;}
    }
    function renderPending(){
      if(stopped)return;resetPage();container.append(element('h1','Save this response'),element('p','Your choice is kept in this browser. Try again to continue.'));
      const retry=button('Try again',async()=>{if(busy)return;busy=true;retry.disabled=true;try{await deliver(state.pending_response);}catch(error){if(!stopped){showError('Your response could not be saved yet. Please try again.');retry.disabled=false;}}finally{busy=false;}},'primary');container.append(retry);previewNote();
    }
    function render(){
      if(stopped)return;
      if(state.pending_response){renderPending();return;}
      if(state.responses.length===trials.length||state.setup_failed){complete();return;}
      if(options.preparation&&!state.preparation?.started_at){renderPreparation();return;}
      resetPage();
      const trial=trials[state.responses.length];state.draft=state.draft||C.freshDraft(trial,now());const draft=state.draft;draft.headphones_confirmed=state.preparation?.headphones_confirmed===true;save();
      const heading=element('header',undefined,{class:'study-heading'});heading.append(element('h1','Speech study'),element('p',C.progressLabel(trials,state.responses.length),{class:'progress'}));container.append(heading);
      let next,status,play,pause,replay,volume;
      const choices=element('div',undefined,{class:'answers',role:'group','aria-labelledby':'sentence-fit-question'});
      const selection=element('p','',{class:'choice-status','aria-live':'polite'});
      const technical=element('details'),problem=element('select',undefined,{id:'technical-problem'}),note=element('textarea',undefined,{id:'technical-note',rows:'2',placeholder:'Describe the problem (optional).'});
      function update(){
        const ready=C.ready(trial,draft);
        for(const child of choices.children){child.disabled=!ready||busy;child.setAttribute('aria-pressed',String(child.dataset.choice===draft.choice));}
        selection.textContent=draft.technical_problem?'Technical problem selected. You can continue.':draft.choice?`Sentence ${draft.choice} selected.`:'';selection.hidden=!selection.textContent;
        if(next)next.disabled=busy||!C.canAdvance(trial,draft);
        if(volume)volume.disabled=!ready||busy;
        if(media){play.disabled=busy||!media.paused;pause.disabled=busy||media.paused;replay.disabled=busy||!draft.audio_started;status.textContent=draft.first_play_completed?'You have listened to the whole extract. You can replay it.':!media.paused?'Listening…':'Listen to the whole extract before answering.';}
      }
      if(trial.modality==='audio'){
        media=element('audio',undefined,{preload:'auto',hidden:'','aria-label':'Conversation extract'});media.src=trial.audio_url;container.append(media);
        const controls=element('div',undefined,{class:'audio-controls',role:'group','aria-label':'Audio playback'});
        play=button('Play',()=>playback.play());pause=button('Pause',()=>playback.pause());replay=button('Replay',()=>playback.replay());controls.append(play,pause,replay);
        status=element('p','Listen to the whole extract before answering.',{class:'playback-status',role:'status','aria-live':'polite'});container.append(controls,status);
        playback=root.SentenceFitPlayback.attach({media,draft,save:saveSoon,onChange:update,onError:showError});
      }else{container.append(element('p',trial.exposed_text,{class:'words'}));}
      const question=element('h2',trial.question,{id:'sentence-fit-question',tabindex:'-1'});container.append(question);
      if(trial.phase!=='main')container.append(element('p',trial.phase==='volume_check'?'Play the recording and adjust your device volume until the speech is comfortable to hear.':'Try the controls and choose the sentence that fits better. Your answer will not be marked right or wrong.',{class:'instructions'}));
      for(const option of trial.options){
        const choice=button('',()=>{if(!C.ready(trial,draft)||busy)return;draft.choice=option.id;draft.technical_problem=null;problem.value='';technical.open=false;save();update();},'answer');
        choice.dataset.choice=option.id;choice.setAttribute('aria-pressed','false');choice.append(element('span',option.id,{class:'letter','aria-hidden':'true'}),element('span',option.text,{class:'sentence'}));choices.append(choice);
      }
      if(trial.phase==='volume_check'){const label=element('label',undefined,{class:'headphone-check'});volume=element('input',undefined,{type:'checkbox'});volume.checked=draft.volume_confirmed===true;volume.addEventListener('change',()=>{draft.volume_confirmed=volume.checked;save();update();});label.append(volume,document.createTextNode('I can hear the recording at a comfortable volume.'));container.append(label);}else container.append(choices,selection);
      technical.append(element('summary','Report a technical problem'),element('label','What went wrong?',{for:'technical-problem'}));
      const problems=[['','Choose a problem'],['audio_load','The audio did not load'],['audio_playback','The audio would not play'],['display','The words or choices did not display'],['other','Another technical problem']];
      for(const[value,text]of problems){if(trial.modality==='text'&&value.startsWith('audio_'))continue;problem.append(element('option',text,{value}));}
      problem.value=draft.technical_problem||'';note.value=draft.problem_note||'';technical.open=Boolean(draft.technical_problem);
      technical.append(problem,element('label','Optional details',{for:'technical-note'}),note);container.append(technical);
      problem.addEventListener('change',()=>{draft.technical_problem=problem.value||null;if(problem.value)draft.choice=null;save();update();});
      note.addEventListener('input',()=>{draft.problem_note=note.value;saveSoon();});
      const actions=element('div',undefined,{class:'actions'});next=button(trial.phase==='volume_check'?'Continue':'Next',()=>advance(trial,draft),'primary');actions.append(next);container.append(actions);previewNote();update();
      if(state.responses.length>0)question.focus({preventScroll:true});
    }
    function renderPreparation(){
      resetPage();container.append(element('h1','Speech study'),element('p','You will hear or read short extracts from conversations. For each extract, choose which of two sentences it seems more likely to be part of.'),element('p','Please use headphones and a comfortable listening volume. You can pause and replay each recording.'));
      const label=element('label',undefined,{class:'headphone-check'}),headphones=element('input',undefined,{type:'checkbox'});label.append(headphones,document.createTextNode('I am using headphones.'));container.append(label);
      const start=button('Start',()=>{state.preparation={started_at:now(),headphones_confirmed:headphones.checked};save();render();},'primary');start.disabled=options.preparation.requireHeadphones!==false;headphones.addEventListener('change',()=>{start.disabled=options.preparation.requireHeadphones!==false&&!headphones.checked;});const actions=element('div',undefined,{class:'actions'});actions.append(start);container.append(actions);previewNote();
    }
    api.retryPending=()=>state.pending_response?deliver(state.pending_response):Promise.resolve();
    save();setTimeout(()=>{try{render();}catch(error){showError(error.message||'The study could not be displayed.');}},0);
    return api;
  }
  root.SentenceFitStudy={mount,readState,savedRecords};
})(globalThis);
