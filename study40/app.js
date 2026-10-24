(function(root){
  'use strict';
  const C=root.Study40Core,now=()=>new Date().toISOString();
  const safeErrors=new Set([
    'Please open the study using the Cognition invitation.',
    'Please open the study using your original participant invitation.',
    'Please open the study using your participant invitation.',
    'Please use the original participant invitation link.',
    'The study list has not been assigned. Please reopen your invitation.',
    'A study list has not been assigned. Please reopen your invitation.',
    'This study is not open yet. Please return to the study invitation.',
    'A study session has already been started for this participant. Please return to that session.',
    'The study changed after this session began. Your saved responses have been kept. Please contact the researcher.',
    'Saved progress could not be read. Your responses have been kept. Please contact the researcher.',
    'Your browser could not save progress. Please keep this page open and contact the researcher.',
    'Your response could not be saved. Please try again.',
    'Please choose an answer about your hearing.',
    'Please use headphones and confirm the checkbox before continuing.',
    'Listen to the recording and confirm the volume first.',
    'Listen to the whole extract and choose an answer, or report a technical problem.',
    'Please choose an answer, or report a technical problem.',
    'Please listen to the complete excerpt before continuing.',
    'Response timing could not be recorded. Please try again.',
    'The return link is unavailable. Please contact the researcher.',
    'The audio could not play. Try Play again or report a technical problem.',
    'Playback did not start. Try Play again or report a technical problem.'
  ]);
  function errorMessage(error){const message=typeof error==='string'?error:error?.message;return safeErrors.has(message)?message:'The study could not continue. Please keep this page open and contact shbs@kth.se.';}
  const el=(tag,text,attrs={})=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;for(const [k,v]of Object.entries(attrs))node.setAttribute(k,v);return node;};
  function button(text,action,primary=false){const b=el('button',text,{type:'button'});if(primary)b.className='primary';b.onclick=action;return b;}
  async function mount({container,data,config,adapter=null,storage=localStorage,serverCondition=root.CONDITION}){
    const params=new URLSearchParams(location.search),c=C.catalog(data),native=config.mode==='participant',live=config.mode==='live'||native;
    if(native&&(!Number.isInteger(Number(serverCondition))||Number(serverCondition)<1||Number(serverCondition)>42))throw Error('The study list has not been assigned. Please reopen your invitation.');
    const qa=!native&&params.get('qa')==='1';
    if(qa){const base=storage;storage={getItem:key=>base.getItem(key+'_qa'),setItem:(key,value)=>base.setItem(key+'_qa',value),removeItem:key=>base.removeItem(key+'_qa')};}
    const preview=params.get('preview_id')||'local';
    if(!live&&config.host!=='cognition'&&!['cohort','condition','list'].some(k=>params.has(k))){
      const choiceKey=C.STORAGE_PREFIX+':preview_assignment:'+preview;
      let choice=JSON.parse(storage.getItem(choiceKey)||'null');
      if(!choice||!c.lists.has(choice.list_id)){const lists=[...c.lists.values()],list=lists[Math.floor(Math.random()*lists.length)];choice={list_id:list.list_id,cohort_id:list.cohort_id,condition_number:list.condition_number};storage.setItem(choiceKey,JSON.stringify(choice));}
      config={...config,preview_assignment:choice};
    }
    const ids=Object.fromEntries(['PROLIFIC_PID','STUDY_ID','SESSION_ID'].map(k=>[k,params.get(k)||(live?'':('preview_'+preview+'_'+k))]));
    if(native&&Object.values(ids).every(value=>!value)){
      const directKey=C.STORAGE_PREFIX+':direct_session:'+data.build_id+':'+config.cohort_id;
      let directId=storage.getItem(directKey);if(!directId){directId=root.crypto.randomUUID();storage.setItem(directKey,directId);}for(const name of Object.keys(ids))ids[name]=null;ids.direct_session_id=directId;
    }
    const previousNative=native?JSON.parse(storage.getItem(C.stateKey({mode:ids.direct_session_id?'preview':'live',ids}))||'null'):null;
    const assignmentCondition=previousNative?.assignment?.condition_number??serverCondition;
    const a=C.chooseAssignment(c,config,ids,assignmentCondition,params);
    if(native){a.host_condition_number=Number(serverCondition);if(previousNative)a.assignment_method='cognition_server_condition_local_resume_v1';}
    if(!live&&!params.has('PROLIFIC_PID')){for(const name of Object.keys(ids)){ids[name]+='_'+a.list_id;a.ids[name]=ids[name];}}
    const key=C.stateKey(a),registryKey=C.STORAGE_PREFIX+':registry:'+(native?'participant':a.mode);
    const oldRegistry=JSON.parse(storage.getItem(registryKey)||'{}'),oldState=JSON.parse(storage.getItem(key)||'null');
    if(!live&&!oldState&&oldRegistry[ids.PROLIFIC_PID]?.build_id!==a.build_id)delete oldRegistry[ids.PROLIFIC_PID];
    if(!live&&config.host!=='cognition'&&oldState&&oldState.assignment.build_id!==a.build_id){
      container.replaceChildren(el('h1','This study has been updated'),el('p','Your earlier responses are still saved. Download them before starting the updated study.'));
      container.append(button('Download earlier responses',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({kind:'candor_study40_preview',preview_only:true,engineering_qa:qa,...oldState},null,2)],{type:'application/json'}));const link=el('a',undefined,{href:url,download:'candor-study40-earlier-preview.json'});link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}));
      container.append(button('Start updated study',()=>{storage.setItem(key+':archive:'+oldState.assignment.build_id,JSON.stringify(oldState));storage.removeItem(key);delete oldRegistry[ids.PROLIFIC_PID];storage.setItem(registryKey,JSON.stringify(oldRegistry));root.location.reload();},true));
      return {migration:true};
    }
    const registry=C.claim(oldRegistry,a,now());
    let state=C.prepareState(JSON.parse(storage.getItem(key)||'null'),a,now()),busy=false,player=null,playerController=null,dirtyTimer=null,previewEntered=live||config.host==='cognition';
    if(native)Object.assign(state.assignment,C.deploymentMetadata(a));
    state.practice_responses=state.practice_responses||[];
    if(data.playback_policy==='complete_first_listen_v1'&&(!data.practice?.volume_check||data.practice.items?.length!==5))throw Error('The practice materials could not load. Please contact the researcher.');
    const observeMaterials=stage=>{
      if(live)return;
      const observation=C.materialExposure(storage.getItem('candor_study40_materials_exposure_v1'),now());
      state.material_exposure_observations=state.material_exposure_observations||{};
      state.material_exposure_observations[stage]=observation;
      if(stage==='before_start')state.prior_material_exposure=observation;
    };
    if(!live){observeMaterials('latest_resume');if(!state.preview_started&&!state.responses.length)observeMaterials('before_start');}
    if(config.mode==='live'){
      if(!adapter?.validateSession)throw Error('This study is not open yet. Please return to your invitation.');
      const validation=await adapter.validateSession({assignment:a,completed:state.status==='completed'});
      if(!validation||validation.accepted!==true)throw Error('This session could not be confirmed. Please contact the researcher.');
    }
    storage.setItem(registryKey,JSON.stringify(registry));
    const save=()=>{storage.setItem(key,JSON.stringify(state));};
    const saveSoon=()=>{if(dirtyTimer)clearTimeout(dirtyTimer);dirtyTimer=setTimeout(()=>{try{save();}catch(e){showError('Your browser could not save progress. Please keep this page open and contact the researcher.');}},250);};
    const stop=()=>{if(playerController){playerController.destroy();playerController=null;}if(player){player.pause();player.removeAttribute('src');player.load();player=null;}if(dirtyTimer)clearTimeout(dirtyTimer);};
    function showError(message){const old=container.querySelector('[role="alert"]');if(old)old.remove();container.prepend(el('p',config.host==='cognition'?errorMessage(message):message,{role:'alert',class:'error'}));}
    function page(title){stop();container.replaceChildren();container.append(el('p','Speech study',{class:'eyebrow'}),el('h1',title));}
    function continueButton(label,fn){const control=button(label,async()=>{if(busy)return;busy=true;try{await fn();}catch(e){showError(e.message);}finally{busy=false;}},true);container.append(control);return control;}
    function materialsLink(){if(live||config.host==='cognition')return;const footer=el('footer'),url=new URL(location.href);url.searchParams.set('view','materials');footer.append(el('a','View all phrases and versions',{href:url.href}));container.append(footer);}
    async function record(value){
      state.pending_record=value;save();
      try{if(adapter?.record)await adapter.record(value);}catch(e){render();throw e;}
      state.pending_record=null;save();
      if(adapter?.advance)adapter.advance(value);else render();
    }
    function consent(){
      page('Welcome');
      const paragraphs=config.consent_paragraphs?.length?config.consent_paragraphs:(live?[]:['This is a researcher run of the study. Responses from this run are kept separate from participant data.']);
      for(const p of paragraphs)container.append(el('p',p));
      continueButton(live?'I agree to take part':'Continue',()=>{state.consent={accepted:true,at:now(),version:config.consent_version||'preview_placeholder'};save();render();});
      container.append(button(live?'I do not agree':'Leave study',async()=>{state.consent={accepted:false,at:now()};state.status='declined';save();if(adapter?.decline)await adapter.decline({record_type:'consent_declined',...a.ids,...C.deploymentMetadata(a),build_id:a.build_id,schedule_id:a.schedule_id,cohort_id:a.cohort_id,list_id:a.list_id,condition_number:a.condition_number,run_mode:a.mode,declined_at:state.consent.at});else render();}));
    }
    function hearing(){
      page('Before you begin');
      container.append(el('p','Please use headphones and a comfortable listening volume.'));
      const label=el('label','How would you describe your hearing?',{for:'hearing'}),select=el('select',undefined,{id:'hearing','aria-label':'How would you describe your hearing?'});
      for(const [value,text]of [['','Choose one'],['no_difficulty','No hearing difficulties'],['some_difficulty','Some hearing difficulties'],['prefer_not_to_say','Prefer not to say']]){const op=el('option',text,{value});select.append(op);}label.append(select);container.append(label);
      const headlabel=el('label',undefined,{class:'checkbox'}),head=el('input',undefined,{type:'checkbox'});headlabel.append(head,document.createTextNode('I am using headphones.'));container.append(headlabel);
      select.value=state.hearing||'';head.checked=state.headphones===true;
      select.onchange=()=>{state.hearing=select.value||null;save();};head.onchange=()=>{state.headphones=head.checked;save();};
      continueButton('Continue',()=>{if(!select.value)throw Error('Please choose an answer about your hearing.');state.hearing=select.value;state.headphones=head.checked;save();if(live&&!head.checked)throw Error('Please use headphones and confirm the checkbox before continuing.');render();});
    }
    function practiceDraft(row){
      if(state.practice_draft?.practice_id!==row.practice_id)state.practice_draft={practice_id:row.practice_id,started_at:now(),answer:null,technical_problem:null,play_count:0,audio_started:false,audio_ended:false,first_play_completed:false,playback_errors:[],playback_events:[],max_audio_time_s:0};
      return state.practice_draft;
    }
    function preparationRecord(row,draft,type){
      const responded=now();
      return {schema_version:1,record_type:type,...a.ids,...C.deploymentMetadata(a),build_id:a.build_id,schedule_id:a.schedule_id,cohort_id:a.cohort_id,list_id:a.list_id,condition_number:a.condition_number,run_mode:a.mode,response_id:C.identity(a.ids)+'::practice::'+row.practice_id,practice_id:row.practice_id,modality:row.modality,input_fingerprint:row.input_fingerprint,...(row.task?{task:row.task,response_protocol:C.protocol(row),assessment_context:C.context(row)}:{}),...draft,...(native?{consent_at:state.consent?.at,consent_version:state.consent?.version}:{}),responded_at:responded,response_time_ms:Date.parse(responded)-Date.parse(draft.started_at)};
    }
    function audioControls(row,draft,changed=()=>{}){
      player=el('audio',undefined,{preload:'auto',hidden:'','aria-label':'Conversation excerpt'});player.src=row.audio_url;container.append(player);
      const media=player,controls=el('div',undefined,{class:'audio-controls',role:'group','aria-label':'Audio playback'}),status=el('p',undefined,{class:'playback-status','aria-live':'polite'});
      const play=button('Play',()=>playerController.play()),pause=button('Pause',()=>playerController.pause()),replay=button('Replay',()=>playerController.replay());
      const update=()=>{play.disabled=!media.paused;pause.disabled=media.paused;replay.disabled=!draft.audio_started;status.textContent=draft.first_play_completed?'You have listened to the whole extract. You can replay it.':(!media.paused?'Listening…':'Listen to the whole extract before answering.');changed();};
      controls.append(play,pause,replay);container.append(controls,status);
      playerController=root.Study40Playback.attach({media,draft,save:saveSoon,onChange:update,onError:showError});update();
    }
    function audioSetup(){
      page('Check your listening volume');
      container.append(el('p','Play the recording and adjust your device volume until the speech is comfortable to hear. Keep your headphones on throughout the study.'));
      const row=data.practice.volume_check,draft=practiceDraft(row);let next;
      const label=el('label',undefined,{class:'checkbox'}),confirmed=el('input',undefined,{type:'checkbox'});confirmed.checked=draft.audible_confirmed===true;
      const update=()=>{confirmed.disabled=!draft.first_play_completed;if(next)next.disabled=!draft.technical_problem&&!(draft.first_play_completed&&confirmed.checked);};
      audioControls(row,draft,update);label.append(confirmed,document.createTextNode('I can hear the recording at a comfortable volume.'));container.append(label);
      confirmed.onchange=()=>{draft.audible_confirmed=confirmed.checked;update();save();};
      const details=el('details'),problem=el('select',undefined,{'aria-label':'Audio setup problem'});for(const [value,text]of [['','Choose a problem'],['audio_load','Audio did not load'],['audio_playback','Audio would not play']])problem.append(el('option',text,{value}));
      problem.value=draft.technical_problem||'';details.append(el('summary','Report a technical problem'),problem);container.append(details);
      problem.onchange=()=>{draft.technical_problem=problem.value||null;update();save();};
      next=continueButton('Continue',async()=>{
        if(!draft.technical_problem&&(!draft.first_play_completed||!confirmed.checked))throw Error('Listen to the recording and confirm the volume first.');
        draft.answer=null;draft.audible_confirmed=!draft.technical_problem&&confirmed.checked;
        const value=preparationRecord(row,draft,'audio_setup');state.audio_setup=value;state.practice_draft=null;if(draft.technical_problem)state.status='setup_failed';await record(value);
      });update();save();
    }
    function instructions(row){
      page(row.task==='question_projection'?'Questions':'How the speaker will continue');
      container.append(el('p','You will hear or read short excerpts from conversations. An excerpt may contain only part of what someone said. Answer from what you hear or read.'));
      if(row.task==='question_projection')container.append(el('p','Decide whether the speaker seems to be asking a question, or starting to ask one.'));
      else{
        container.append(el('p','A turn is a stretch of speaking by one person. Some questions ask whether the speaker seems close to finishing their turn or likely to keep speaking for a while. You do not need to estimate a number of seconds or count sentences.'));
        container.append(el('p','Some questions ask whether the speaker could naturally finish their turn at that point. For these, judge whether stopping would feel possible, not whether the speaker actually stops.'));
      }
      container.append(el('p','The recording ending does not necessarily mean the speaker intended to stop. Listen to the whole extract before answering. You can pause and replay it.'));
      if(data.practice)container.append(el('p','You will first try a few practice examples. They teach the controls and questions; your interpretations will not be marked right or wrong.'));
      continueButton('Begin',()=>{state.instructions_seen.push(row.task);save();render();});
    }
    function trial(row,isPractice=false){
      page('');container.querySelector('h1').remove();
      const draft=isPractice?practiceDraft(row):C.startTrial(state,now());save();
      container.append(el('p',isPractice?'Practice':`Item ${state.responses.length+1} of ${a.trials.length}`,{class:'progress'}));
      if(isPractice)container.append(el('p',row.instruction||'Try the controls and choose the answer that best matches your interpretation. Practice responses are separate from the study.',{class:'practice-guidance'}));
      let updateChoice=()=>{},next;
      if(row.modality==='audio'){
        audioControls(row,draft,()=>updateChoice());
      }else container.append(el('p',row.text,{class:'words'}));
      container.append(el('h2',C.questionFor(row)));
      const choices=el('div',undefined,{class:'answers',role:'group','aria-label':'Your answer'});
      const technical=el('details'),summary=el('summary','Report a technical problem'),problem=el('select',undefined,{'aria-label':'Technical problem'});
      for(const [value,text]of [['','Choose a problem'],['audio_load','Audio did not load'],['audio_playback','Audio would not play'],['display','The excerpt did not display'],['other','Another technical problem']]){if(row.modality==='text'&&value.startsWith('audio_'))continue;problem.append(el('option',text,{value}));}
      technical.append(summary,problem);technical.open=Boolean(draft.technical_problem);problem.value=draft.technical_problem||'';
      updateChoice=()=>{const ready=C.audioReady(a,row,draft);for(const child of choices.children){child.setAttribute('aria-pressed',String(child.dataset.value===draft.answer));child.disabled=!ready;}if(next)next.disabled=!draft.technical_problem&&(!ready||!draft.answer);};
      for(const [value,label]of C.options(row)){const b=button(label,()=>{draft.answer=value;draft.technical_problem=null;problem.value='';technical.open=false;updateChoice();save();});b.dataset.value=value;choices.append(b);}updateChoice();
      problem.onchange=()=>{draft.technical_problem=problem.value||null;if(problem.value)draft.answer=null;updateChoice();save();};
      container.append(choices,technical);
      next=continueButton(isPractice?'Continue practice':'Next',async()=>{
        if(player)player.pause();
        if(isPractice){
          if(draft.technical_problem){draft.answer=null;}
          else if(!C.audioReady(a,row,draft)||!C.options(row).some(([value])=>value===draft.answer))throw Error('Listen to the whole extract and choose an answer, or report a technical problem.');
          const response=preparationRecord(row,draft,'practice');state.practice_responses.push(response);state.practice_draft=null;await record(response);
        }else await record(C.commit(state,draft,now()));
      });updateChoice();
    }
    function unavailable(row){
      page('This excerpt is still being prepared');
      container.append(el('p',`Item ${state.responses.length+1} of ${a.trials.length}`,{class:'progress'}));
      container.append(el('p','You can continue to the next item.'));
      continueButton('Continue',()=>record(C.skipUnavailable(state,now())));
    }
    function end(){
      page('One last thing');container.append(el('p','Was anything unclear, too short to judge, or difficult to use? Your comments are optional.'));
      const textarea=el('textarea',undefined,{rows:'4','aria-label':'Final feedback'});textarea.value=state.feedback||'';textarea.oninput=()=>{state.feedback=textarea.value;save();};container.append(textarea);
      continueButton('Finish',async()=>{observeMaterials('at_completion');const value=C.finish(state,textarea.value,now());if(!live)value.material_exposure_observations=state.material_exposure_observations;save();if(adapter?.complete)await adapter.complete(value);else{C.acknowledge(state,{acknowledged:true,storage:'local_preview'},now());save();render();}});
    }
    function render(){
      if(native){
        const missing=C.participantSettings(config,a.source);
        if(missing.length){page('This study is not available yet');container.append(el('p','Please return to your study invitation or contact shbs@kth.se.'));return;}
      }
      if(state.pending_record){page('Save your response');container.append(el('p','Your response is kept on this device. Please try saving it again to continue.'));continueButton('Try again',()=>record(state.pending_record));return;}
      if(state.status==='declined'){page('Thank you');container.append(el('p','You have chosen not to take part. You can close this page.'));return;}
      if(state.status==='setup_failed'){page('The audio check could not be completed');container.append(el('p','Your technical-problem report has been saved. This study needs working audio. Please return to the study invitation and report the problem.'));return;}
      if(state.status==='completed'){page('Thank you');container.append(el('p','Your responses have been saved.'));if(!live&&config.host!=='cognition')container.append(button('Download responses',()=>{const blob=new Blob([JSON.stringify({kind:'candor_study40_preview',preview_only:true,engineering_qa:qa,...state},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=el('a',undefined,{href:url,download:'candor-study40-preview.json'});link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}));materialsLink();return;}
      if(state.status==='awaiting_save'){page('Saving your responses');container.append(el('p','Please keep this page open while your responses are saved.'));return;}
      if(!live&&!previewEntered){
        page('Speech study');container.querySelector('.eyebrow').hidden=true;
        if(a.trials.some(r=>!r.ready))container.append(el('p',`This study has ${a.trials.length} excerpts. ${a.trials.filter(r=>r.ready).length} are ready; the others are still being prepared.`));
        continueButton(state.preview_started?'Resume study':'Start study',()=>{previewEntered=true;observeMaterials(state.preview_started?'latest_resume':'before_start');state.preview_started=true;state.consent=state.consent||{accepted:true,at:now(),version:'preview_only_no_participant_consent'};save();render();});materialsLink();return;
      }
      if(!state.consent?.accepted){consent();return;}if(!state.hearing||(live&&state.headphones!==true)){hearing();return;}
      if(data.practice&&!state.audio_setup?.audible_confirmed){audioSetup();return;}
      const row=C.current(state);if(!row){end();return;}
      if(!state.instructions_seen.includes(row.task)){instructions(row);return;}
      const practice=data.practice?.items.find(item=>item.task===row.task&&!state.practice_responses.some(response=>response.practice_id===item.practice_id));
      if(practice){trial(practice,true);return;}if(!row.ready){unavailable(row);return;}trial(row);
    }
    save();render();
    return {state,assignment:a,key,save,stop,render,acknowledge(receipt){C.acknowledge(state,receipt,now());save();registry[C.participantKey(a)].completed=true;storage.setItem(registryKey,JSON.stringify(registry));render();return C.completionUrl(state,config);}};
  }
  async function bootstrap(){
    const container=document.getElementById('study');
    try{const [data,config]=await Promise.all(['manifest.json','config.json'].map(async path=>{const r=await fetch(path);if(!r.ok)throw Error('The study could not load. Please try again.');return r.json();}));
      if(['live','participant'].includes(config.mode))throw Error('Please open the study using your participant invitation.');
      if(new URLSearchParams(location.search).get('view')==='materials'){
        const response=await fetch('materials.json');if(!response.ok)throw Error('The phrase collection could not load. Please try again.');
        C.catalog(data);await root.Study40Materials.mount({container,data,materials:await response.json()});return;
      }
      await mount({container,data,config});
    }catch(e){container.replaceChildren(el('h1','Study unavailable'),el('p',e.message,{role:'alert'}));}
  }
  root.Study40={mount,bootstrap,errorMessage};
})(globalThis);
