(function(root){
  'use strict';
  const C=root.Study40Core,now=()=>new Date().toISOString();
  const el=(tag,text,attrs={})=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;for(const [k,v]of Object.entries(attrs))node.setAttribute(k,v);return node;};
  function button(text,action,primary=false){const b=el('button',text,{type:'button'});if(primary)b.className='primary';b.onclick=action;return b;}
  async function mount({container,data,config,adapter=null,storage=localStorage,serverCondition=root.CONDITION}){
    const params=new URLSearchParams(location.search),c=C.catalog(data),live=config.mode==='live';
    const qa=params.get('qa')==='1';
    if(qa){const base=storage;storage={getItem:key=>base.getItem(key+'_qa'),setItem:(key,value)=>base.setItem(key+'_qa',value),removeItem:key=>base.removeItem(key+'_qa')};}
    const preview=params.get('preview_id')||'local';
    if(!live&&config.host!=='cognition'&&!['cohort','condition','list'].some(k=>params.has(k))){
      const choiceKey=C.STORAGE_PREFIX+':preview_assignment:'+preview;
      let choice=JSON.parse(storage.getItem(choiceKey)||'null');
      if(!choice||!c.lists.has(choice.list_id)){const lists=[...c.lists.values()],list=lists[Math.floor(Math.random()*lists.length)];choice={list_id:list.list_id,cohort_id:list.cohort_id,condition_number:list.condition_number};storage.setItem(choiceKey,JSON.stringify(choice));}
      config={...config,preview_assignment:choice};
    }
    const ids=Object.fromEntries(['PROLIFIC_PID','STUDY_ID','SESSION_ID'].map(k=>[k,params.get(k)||(live?'':('preview_'+preview+'_'+k))]));
    const a=C.chooseAssignment(c,config,ids,serverCondition,params);
    if(!live&&!params.has('PROLIFIC_PID')){for(const name of Object.keys(ids)){ids[name]+='_'+a.list_id;a.ids[name]=ids[name];}}
    const key=C.stateKey(a),registryKey=C.STORAGE_PREFIX+':registry:'+a.mode;
    const oldRegistry=JSON.parse(storage.getItem(registryKey)||'{}'),oldState=JSON.parse(storage.getItem(key)||'null');
    if(!live&&!oldState&&oldRegistry[ids.PROLIFIC_PID]?.build_id!==a.build_id)delete oldRegistry[ids.PROLIFIC_PID];
    if(!live&&oldState&&oldState.assignment.build_id!==a.build_id){
      container.replaceChildren(el('h1','This preview has been updated'),el('p','Your earlier responses are still saved. Download them before starting the updated preview.'));
      container.append(button('Download earlier responses',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({kind:'candor_study40_preview',preview_only:true,engineering_qa:qa,...oldState},null,2)],{type:'application/json'}));const link=el('a',undefined,{href:url,download:'candor-study40-earlier-preview.json'});link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}));
      container.append(button('Start updated preview',()=>{storage.setItem(key+':archive:'+oldState.assignment.build_id,JSON.stringify(oldState));storage.removeItem(key);delete oldRegistry[ids.PROLIFIC_PID];storage.setItem(registryKey,JSON.stringify(oldRegistry));root.location.reload();},true));
      return {migration:true};
    }
    const registry=C.claim(oldRegistry,a,now());
    let state=C.prepareState(JSON.parse(storage.getItem(key)||'null'),a,now()),busy=false,player=null,dirtyTimer=null,previewEntered=live||config.host==='cognition';
    if(live){
      if(!adapter?.validateSession)throw Error('This study is not open yet. Please return to your invitation.');
      const validation=await adapter.validateSession({assignment:a,completed:state.status==='completed'});
      if(!validation||validation.accepted!==true)throw Error('This session could not be confirmed. Please contact the researcher.');
    }
    storage.setItem(registryKey,JSON.stringify(registry));
    const save=()=>{storage.setItem(key,JSON.stringify(state));};
    const saveSoon=()=>{if(dirtyTimer)clearTimeout(dirtyTimer);dirtyTimer=setTimeout(()=>{try{save();}catch(e){showError('Your browser could not save progress. Please keep this page open and contact the researcher.');}},250);};
    const stop=()=>{if(player){player.pause();player.removeAttribute('src');player.load();player=null;}if(dirtyTimer)clearTimeout(dirtyTimer);};
    function showError(message){const old=container.querySelector('[role="alert"]');if(old)old.remove();container.prepend(el('p',message,{role:'alert',class:'error'}));}
    function page(title){stop();container.replaceChildren();container.append(el('p',live?'Speech continuation study':'Speech continuation user study preview',{class:'eyebrow'}),el('h1',title));}
    function continueButton(label,fn){container.append(button(label,async()=>{if(busy)return;busy=true;try{await fn();}catch(e){showError(e.message);}finally{busy=false;}},true));}
    async function record(value){
      state.pending_record=value;save();
      try{if(adapter?.record)await adapter.record(value);}catch(e){render();throw e;}
      state.pending_record=null;save();
      if(adapter?.advance)adapter.advance(value);else render();
    }
    function consent(){
      page('Welcome');
      const paragraphs=config.consent_paragraphs?.length?config.consent_paragraphs:['The consent form will be added before the study opens. You can try the task in this preview.'];
      for(const p of paragraphs)container.append(el('p',p));
      continueButton(live?'I agree to take part':'Continue preview',()=>{state.consent={accepted:true,at:now(),version:config.consent_version||'preview_placeholder'};save();render();});
      container.append(button(live?'I do not agree':'Leave preview',async()=>{state.consent={accepted:false,at:now()};state.status='declined';save();if(adapter?.decline)await adapter.decline({record_type:'consent_declined',...a.ids,build_id:a.build_id,schedule_id:a.schedule_id,cohort_id:a.cohort_id,list_id:a.list_id,condition_number:a.condition_number,run_mode:a.mode,declined_at:state.consent.at});else render();}));
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
    function instructions(row){
      page(row.task==='question_projection'?'Questions':'Finishing a phrase');
      container.append(el('p','You will hear or read short excerpts from conversations. An excerpt may contain only part of what someone said. Answer from what you hear or read.'));
      container.append(el('p',row.task==='question_projection'?'Decide whether the speaker seems to be asking a question, or starting to ask one.':'Decide whether the speaker could reasonably finish at that point, or whether more speech seems expected.'));
      container.append(el('p','Choose Unsure if you cannot tell. You can replay the audio.'));
      continueButton('Begin',()=>{state.instructions_seen.push(row.task);save();render();});
    }
    function breakPage(row){
      page('Take a break if you like');container.append(el('p','The next section asks a different question. Continue whenever you are ready.'));
      continueButton('Continue',()=>{state.breaks_taken.push(row.block_index);save();render();});
    }
    function trial(row){
      page('');container.querySelector('h1').remove();
      const draft=C.startTrial(state,now());save();
      container.append(el('p',`Item ${state.responses.length+1} of ${a.trials.length}`,{class:'progress'}));
      if(row.modality==='audio'){
        player=el('audio',undefined,{controls:'',preload:'auto','aria-label':'Conversation excerpt'});player.src=row.audio_url;container.append(player);
        const media=player;
        draft.playback_events=draft.playback_events||[];
        const playbackEvent=event=>{draft.playback_events.push({event,at:now(),audio_time_s:media.currentTime});save();};
        media.onplay=()=>{draft.audio_started=true;draft.play_count++;playbackEvent('play');};
        media.onpause=()=>playbackEvent('pause');
        media.onseeking=()=>playbackEvent('seeking');media.onseeked=()=>playbackEvent('seeked');
        media.onended=()=>{draft.audio_ended=true;playbackEvent('ended');};
        media.ontimeupdate=()=>{draft.max_audio_time_s=Math.max(draft.max_audio_time_s,media.currentTime);saveSoon();};
        media.onerror=()=>{draft.playback_errors.push({at:now(),code:media.error?.code||null});playbackEvent('error');showError('The audio could not play. You can try again or choose Report a technical problem.');};
        const replay=button('Replay',()=>{media.currentTime=0;const p=media.play();if(p?.catch)p.catch(()=>showError('Use the audio player to try playing the excerpt.'));});replay.className='secondary';container.append(replay);
      }else container.append(el('p',row.text,{class:'words'}));
      container.append(el('h2',C.question(row.task,row.modality)));
      const choices=el('div',undefined,{class:'answers',role:'group','aria-label':'Your answer'});
      const technical=el('details'),summary=el('summary','Report a technical problem'),problem=el('select',undefined,{'aria-label':'Technical problem'});
      for(const [value,text]of [['','Choose a problem'],['audio_load','Audio did not load'],['audio_playback','Audio would not play'],['display','The excerpt did not display'],['other','Another technical problem']])problem.append(el('option',text,{value}));
      technical.append(summary,problem);technical.open=Boolean(draft.technical_problem);problem.value=draft.technical_problem||'';
      const updateChoice=()=>{for(const child of choices.children)child.setAttribute('aria-pressed',String(child.dataset.value===draft.answer));};
      for(const [value,label]of C.OPTIONS[row.task]){const b=button(label,()=>{draft.answer=value;draft.technical_problem=null;problem.value='';technical.open=false;updateChoice();save();});b.dataset.value=value;choices.append(b);}updateChoice();
      problem.onchange=()=>{draft.technical_problem=problem.value||null;if(problem.value)draft.answer=null;updateChoice();save();};
      container.append(choices,technical);
      const noteLabel=el('label','Note (optional)',{for:'note'}),note=el('textarea',undefined,{id:'note',rows:'2'});note.value=draft.note;note.oninput=()=>{draft.note=note.value;save();};noteLabel.append(note);container.append(noteLabel);
      continueButton('Next',async()=>{if(player)player.pause();const response=C.commit(state,draft,now());await record(response);});
    }
    function unavailable(row){
      page('This excerpt is still being prepared');
      container.append(el('p',`Item ${state.responses.length+1} of ${a.trials.length}`,{class:'progress'}));
      container.append(el('p','You can continue to the next item in this preview.'));
      continueButton('Continue preview',()=>record(C.skipUnavailable(state,now())));
    }
    function end(){
      page('One last thing');container.append(el('p','Was anything unclear, too short to judge, or difficult to use? Your comments are optional.'));
      const textarea=el('textarea',undefined,{rows:'4','aria-label':'Final feedback'});textarea.value=state.feedback||'';textarea.oninput=()=>{state.feedback=textarea.value;save();};container.append(textarea);
      continueButton('Finish',async()=>{const value=C.finish(state,textarea.value,now());save();if(adapter?.complete)await adapter.complete(value);else{C.acknowledge(state,{acknowledged:true,storage:'local_preview'},now());save();render();}});
    }
    function render(){
      if(state.pending_record){page('Save your response');container.append(el('p','Your response is kept on this device. Please try saving it again to continue.'));continueButton('Try again',()=>record(state.pending_record));return;}
      if(state.status==='declined'){page('Thank you');container.append(el('p','You have chosen not to take part. You can close this page.'));return;}
      if(state.status==='completed'){page('Thank you');container.append(el('p',live?'Your responses have been saved.':'Your preview responses have been saved on this device.'));if(!live)container.append(button('Download preview responses',()=>{const blob=new Blob([JSON.stringify({kind:'candor_study40_preview',preview_only:true,engineering_qa:qa,...state},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=el('a',undefined,{href:url,download:'candor-study40-preview.json'});link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}));return;}
      if(state.status==='awaiting_save'){page('Saving your responses');container.append(el('p','Please keep this page open while your responses are saved.'));return;}
      if(!live&&!previewEntered){
        page('Speech continuation user study preview');container.querySelector('.eyebrow').hidden=true;
        container.append(el('p',`This preview has 40 excerpts. ${a.trials.filter(r=>r.ready).length} are ready to try; the others are still being prepared.`));
        continueButton(state.preview_started?'Resume preview':'Start preview',()=>{previewEntered=true;state.preview_started=true;state.consent=state.consent||{accepted:true,at:now(),version:'preview_only_no_participant_consent'};save();render();});return;
      }
      if(!state.consent?.accepted){consent();return;}if(!state.hearing||(live&&state.headphones!==true)){hearing();return;}
      const row=C.current(state);if(!row){end();return;}
      const previous=state.responses.at(-1);
      if(previous&&row.block_index!==previous.block_index&&!state.breaks_taken.includes(row.block_index)){breakPage(row);return;}
      if(!state.instructions_seen.includes(row.task)){instructions(row);return;}if(!row.ready){unavailable(row);return;}trial(row);
    }
    save();render();
    return {state,assignment:a,key,save,stop,render,acknowledge(receipt){C.acknowledge(state,receipt,now());save();registry[ids.PROLIFIC_PID].completed=true;storage.setItem(registryKey,JSON.stringify(registry));render();return C.completionUrl(state,config);}};
  }
  async function bootstrap(){
    const container=document.getElementById('study');
    try{const [data,config]=await Promise.all(['manifest.json','config.json'].map(async path=>{const r=await fetch(path);if(!r.ok)throw Error('The study could not load. Please try again.');return r.json();}));
      if(config.mode==='live')throw Error('Please open the study using your participant invitation.');
      await mount({container,data,config});
    }catch(e){container.replaceChildren(el('h1','Study unavailable'),el('p',e.message,{role:'alert'}));}
  }
  root.Study40={mount,bootstrap};
})(globalThis);
