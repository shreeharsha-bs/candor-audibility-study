(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else{root.CandorStudy=api;if(root.document)root.document.addEventListener('DOMContentLoaded',()=>api.mount().catch(error=>api.fatal(error)));}})(globalThis,function(){
  'use strict';
  const clone=v=>JSON.parse(JSON.stringify(v));
  const now=()=>new Date().toISOString();
  function acquireTabLock(name,locks=globalThis.navigator?.locks){
    if(!locks?.request)return Promise.reject(Error('This browser cannot safely resume the connected study. Please use a current version of Chrome, Firefox, Edge, or Safari.'));
    return new Promise((resolve,reject)=>{
      let unlock;const held=new Promise(done=>{unlock=done;});
      locks.request(name,{mode:'exclusive',ifAvailable:true},lock=>{
        if(!lock){reject(Error('This study is already open in another tab or window. Close that copy, then reload this page to resume.'));return;}
        resolve(()=>unlock());return held;
      }).catch(reject);
    });
  }
  function shuffle(rows,random=Math.random){const result=[...rows];for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;}
  function catalog(data){
    if(!['question','turn'].includes(data.study_id)||typeof data.build_id!=='string'||!Array.isArray(data.cells)||!data.cells.length||!Number.isInteger(data.trials_per_session))throw Error('The study materials could not be read.');
    const result=new Map();
    for(const cell of [...data.cells,...(data.practice||[])]){
      if(!cell.cell_id||result.has(cell.cell_id)||!cell.phrase_id||!['audio','text'].includes(cell.modality)||!Array.isArray(cell.options)||cell.options.length!==2||new Set(cell.options.map(o=>o.id)).size!==2||cell.options.some(o=>!o.id||typeof o.text!=='string')||typeof cell.question!=='string')throw Error('A study item is incomplete or repeated.');
      if(cell.modality==='audio'&&!cell.audio_url)throw Error('A study recording is missing.');
      if(cell.modality==='text'&&typeof cell.text!=='string')throw Error('A text item is missing.');
      result.set(cell.cell_id,cell);
    }
    if(new Set(data.cells.map(c=>c.phrase_id)).size<data.trials_per_session)throw Error('There are not enough separate phrases for this study.');
    return result;
  }
  function verifyAssignments(assignments,data,cells){
    if(!Array.isArray(assignments)||assignments.length!==data.trials_per_session)throw Error('The study assignment is incomplete. Please contact the researcher.');
    const allowed=new Set(data.cells.map(c=>c.cell_id)),phrases=new Set(),ids=new Set();
    return assignments.map(a=>{
      const cell=cells.get(a.cell_id);
      if(!allowed.has(a.cell_id)||ids.has(a.cell_id)||phrases.has(cell?.phrase_id))throw Error('The study assignment repeats a phrase. Please contact the researcher.');
      ids.add(a.cell_id);phrases.add(cell.phrase_id);
      const order=a.option_order||cell.options.map(o=>o.id);
      if(order.length!==2||new Set(order).size!==2||order.some(id=>!cell.options.some(o=>o.id===id)))throw Error('The answer order could not be read.');
      return {...a,option_order:[...order]};
    });
  }
  function previewAssignments(data,random=Math.random){
    const groups=new Map();for(const cell of data.cells){if(!groups.has(cell.phrase_id))groups.set(cell.phrase_id,[]);groups.get(cell.phrase_id).push(cell);}
    return shuffle([...groups.values()],random).slice(0,data.trials_per_session).map(group=>{const c=group[Math.floor(random()*group.length)];return {cell_id:c.cell_id,option_order:data.study_id==='turn'?shuffle(c.options.map(o=>o.id),random):c.options.map(o=>o.id)};});
  }
  function ready(cell,draft){return cell.modality==='text'||draft.first_play_completed===true;}
  function canAdvance(cell,draft){return Boolean(draft.technical_problem)||(ready(cell,draft)&&cell.options.some(o=>o.id===draft.choice));}
  function responseFor(cell,draft,assignment){
    if(!canAdvance(cell,draft))throw Error('Listen to the extract and choose an answer first.');
    return {cell_id:cell.cell_id,choice:draft.technical_problem?null:draft.choice,technical_problem:draft.technical_problem||null,technical_note:(draft.technical_note||'').slice(0,500),listen_completed:cell.modality==='audio'?draft.first_play_completed===true:false,response_ms:Math.max(0,Date.now()-Date.parse(draft.started_at)),option_order:[...assignment.option_order],responded_at:now(),play_count:draft.play_count||0,complete_listen_count:draft.complete_listen_count||0};
  }
  function acceptSaved(state,response,ack){
    if(ack?.ok!==true||!Array.isArray(ack.acknowledged)||!ack.acknowledged.includes(response.cell_id))throw Error('The response store has not confirmed this answer. Please try again.');
    const assigned=new Set(state.assignments.map(a=>a.cell_id));
    if(!assigned.has(response.cell_id))throw Error('This answer does not belong to your assignment.');
    const earlier=state.responses.find(r=>r.cell_id===response.cell_id);
    if(earlier&&!sameAnswer(earlier,response))throw Error('This item already has a different saved answer. Your earlier answer has been kept.');
    if(!earlier)state.responses.push(clone(response));
    state.pending=null;state.draft=null;return state;
  }
  function sameAnswer(a,b){return a.cell_id===b.cell_id&&a.choice===b.choice&&(a.technical_problem||null)===(b.technical_problem||null)&&JSON.stringify(a.option_order||[])===JSON.stringify(b.option_order||[]);}
  function prepareOutbox(state){
    state.outbox=state.outbox||[];state.pending_batch=state.pending_batch||null;
    if(state.pending?.response){
      const original=clone(state.pending.response),r=clone(original);r.local_created_at_ms=r.local_created_at_ms||Date.parse(r.responded_at)||Date.now();
      if(!state.outbox.some(x=>x.cell_id===r.cell_id))state.outbox.push(r);
      state.pending_batch=state.pending_batch||{request_id:state.pending.request_id,responses:[original]};state.pending=null;state.draft=null;
    }
    return state;
  }
  function transaction(state,write,change){
    const revised=clone(state),draft=state.draft;change(revised);write(JSON.stringify(revised));
    const keepDraft=draft&&JSON.stringify(draft)===JSON.stringify(revised.draft);Object.assign(state,revised);if(keepDraft)state.draft=draft;return state;
  }
  function queueResponse(state,response,time=Date.now()){
    prepareOutbox(state);
    if(!state.assignments.some(a=>a.cell_id===response.cell_id))throw Error('This answer does not belong to your assignment.');
    const old=[...state.responses,...state.outbox].find(r=>r.cell_id===response.cell_id);
    if(old&&!sameAnswer(old,response))throw Error('This item already has an answer. Your earlier answer has been kept.');
    if(!old)state.outbox.push({...clone(response),local_created_at_ms:time});
    state.draft=null;return state;
  }
  function acceptBatch(state,batch,ack){
    prepareOutbox(state);
    if(!state.pending_batch||state.pending_batch.request_id!==batch.request_id||JSON.stringify(state.pending_batch.responses)!==JSON.stringify(batch.responses))throw Error('The saved answer batch changed. Please contact the researcher.');
    const ids=new Set(batch.responses.map(r=>r.cell_id));
    if(ack?.ok!==true||!Array.isArray(ack.acknowledged)||ack.acknowledged.some(id=>!ids.has(id)))throw Error('The response store did not confirm this batch. Your answers have been kept.');
    const acknowledged=new Set(ack.acknowledged);
    for(const r of batch.responses){if(!acknowledged.has(r.cell_id))continue;const old=state.responses.find(x=>x.cell_id===r.cell_id);if(old&&!sameAnswer(old,r))throw Error('A saved answer conflicts with this batch. Your answers have been kept.');if(!old)state.responses.push(clone(r));}
    state.outbox=state.outbox.filter(r=>!acknowledged.has(r.cell_id));
    const saved=new Set(state.responses.map(r=>r.cell_id));if(batch.responses.every(r=>saved.has(r.cell_id)))state.pending_batch=null;
    return state;
  }
  function mergeSaved(state,server){
    prepareOutbox(state);
    const assigned=new Set(state.assignments.map(a=>a.cell_id));
    const merged=clone(state.responses);
    for(const r of server||[]){
      if(!assigned.has(r.cell_id))throw Error('A saved answer does not match this study.');
      const local=merged.find(x=>x.cell_id===r.cell_id),queued=state.outbox.find(x=>x.cell_id===r.cell_id),pending=state.pending_batch?.responses.find(x=>x.cell_id===r.cell_id);
      if((local&&!sameAnswer(local,r))||(queued&&!sameAnswer(queued,r))||(pending&&!sameAnswer(pending,r)))throw Error('The response store has a different saved answer for this item. Your local answer has been kept. Please contact the researcher.');
      if(!local)merged.push(clone(r));
    }
    state.responses=merged;
    const saved=new Set(merged.map(r=>r.cell_id));state.outbox=state.outbox.filter(r=>!saved.has(r.cell_id));
    if(state.pending_batch?.responses.every(r=>saved.has(r.cell_id)))state.pending_batch=null;
    if(state.draft&&saved.has(state.draft.cell_id))state.draft=null;
    return state;
  }
  function acceptSession(state,result,data,cells){
    const token=result.session_token||state.session_token;
    if(!result.session_id||!token||result.mode!==state.mode||result.build_id!==data.build_id)throw Error('The response store returned an unexpected study session. Please contact the researcher.');
    if(state.session_id&&state.session_id!==result.session_id)throw Error('Your saved session changed. Please contact the researcher; your answers have been kept.');
    const assignments=verifyAssignments(result.assignments,data,cells);
    const identity=rows=>JSON.stringify(rows.map(a=>[a.cell_id,a.option_order,a.analysis_role||null]));
    if(state.assignments.length&&identity(state.assignments)!==identity(assignments))throw Error('Your saved assignment changed. Please contact the researcher; your answers have been kept.');
    if(state.session_kind&&result.session_kind!==state.session_kind)throw Error('Your saved session type changed. Please contact the researcher; your answers have been kept.');
    const revised=clone(state);revised.assignments=assignments;revised.session_id=result.session_id;revised.session_token=token;revised.session_kind=result.session_kind||null;mergeSaved(revised,result.responses||[]);
    if(result.status==='complete'){if(revised.outbox.length||revised.pending_batch)throw Error('Some local answers are not confirmed by the response store. Please contact the researcher.');revised.completed=true;revised.completion_url=result.completion_url||revised.completion_url||null;}
    Object.assign(state,revised);return state;
  }
  const element=(tag,text,attrs={})=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;for(const[k,v]of Object.entries(attrs))el.setAttribute(k,v);return el;};
  function button(label,action,className=''){const el=element('button',label,{type:'button',class:className});el.addEventListener('click',action);return el;}
  function fatal(error){const app=document.querySelector('#study')||document.body;app.replaceChildren(element('h1','The study could not open'),element('p',error.message||'Please reload this page or contact the researcher.',{role:'alert',class:'error'}));}
  async function mount(){
    const app=document.querySelector('#study');if(!app)return;
    const T=globalThis.StudyTransport,config=globalThis.STUDY_CONFIG||{},params=new URLSearchParams(location.search);
    const response=await fetch('./data.json',{cache:'no-cache'});if(!response.ok)throw Error('The study materials could not be downloaded.');
    const data=await response.json(),cells=catalog(data),mode=params.get('preview')==='1'||!config.endpoint?'preview':config.mode==='live'?'live':'test';
    if(!config.endpoint&&params.get('preview')!=='1'&&(config.mode==='live'||params.has('PROLIFIC_PID')))throw Error('This study is not connected to its response store yet. Please contact the researcher before taking part.');
    if(mode==='live'&&!params.get('PROLIFIC_PID'))throw Error('Please open this study using your Prolific invitation.');
    const identityKey=`candor_sheets_identity_${data.study_id}_${mode}`;
    let participantId=mode==='live'?params.get('PROLIFIC_PID'):localStorage.getItem(identityKey);
    if(!participantId){participantId=`test_${T.requestId()}`;localStorage.setItem(identityKey,participantId);}
    const releaseTab=mode==='preview'?()=>{}:await acquireTabLock(`candor_sheets_${data.study_id}_${mode}_${participantId}`);
    const storageKey=`candor_sheets_v1_${data.study_id}_${data.build_id}_${mode}_${participantId}`;
    let state;try{state=JSON.parse(localStorage.getItem(storageKey)||'null');}catch(_){throw Error('Saved progress could not be read. Please contact the researcher; your earlier data have been kept.');}
    state=state||{schema_version:2,study_id:data.study_id,build_id:data.build_id,mode,participant_id:participantId,assignments:[],responses:[],outbox:[],pending_batch:null,practice_responses:[],preparation:null,pending:null,draft:null,completed:false};
    if(state.build_id!==data.build_id||state.mode!==mode)throw Error('The study version changed. Please contact the researcher.');
    if(state.assignments.length)state.assignments=verifyAssignments(state.assignments,data,cells);
    prepareOutbox(state);
    if(state.draft){state.draft.first_play_completed=false;state.draft.audio_started=false;state.draft.audio_ended=false;}
    let media=null,playback=null,busy=false,saveTimer=null,storageFailed=false,currentControls=()=>{},saver=null,lastAckAt=0,completionRunning=false,pageStopped=false;
    function write(encoded){
      if(pageStopped){const e=Error('This page is no longer active. Reload to resume your study.');e.code='PAGE_STOPPED';e.retryable=false;throw e;}
      try{localStorage.setItem(storageKey,encoded);storageFailed=false;currentControls();}
      catch(_){storageFailed=true;currentControls();const e=Error('This device could not keep your answer. Please keep this page open and retry saving on this device before continuing.');e.code='LOCAL_STORAGE';e.retryable=false;throw e;}
    }
    const save=()=>write(JSON.stringify(state)),commit=change=>transaction(state,write,change);
    function closeMedia(){if(playback){playback.destroy();playback=null;}if(media){media.pause();media.removeAttribute('src');media.load();media=null;}clearTimeout(saveTimer);}
    function clear(){closeMedia();currentControls=()=>{};app.replaceChildren();}
    function modeNote(){
      if(mode!=='preview'&&state.session_id){app.append(element('div',undefined,{id:'save-status',role:'status','aria-live':'polite'}));updateSaveStatus();}
      if(mode!=='live')app.append(element('p',mode==='preview'?'Local preview · Responses stay on this device and are not sent to Google Sheets.':'Test study · Responses are saved as test data, separately from participant results.',{class:'mode-note'}));
    }
    function error(message){let node=app.querySelector('[role="alert"]');if(!node){node=element('p','',{role:'alert',class:'error'});app.prepend(node);}node.textContent=message;}
    function showStorageError(e){error(e.message);const node=app.querySelector('[role="alert"]');node.append(button('Retry saving on this device',()=>{try{save();saver?.retry().catch(()=>{});render();}catch(err){showStorageError(err);}}));}
    function persistDraft(){try{save();return true;}catch(e){showStorageError(e);return false;}}
    function saveSoon(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{try{save();}catch(e){showStorageError(e);}},200);}
    function updateSaveStatus(){
      const node=app.querySelector('#save-status');if(!node||!saver)return;const s=saver.status();node.replaceChildren();
      const permanent=s.error?.retryable===false&&s.error?.code!=='LOCAL_STORAGE';
      const message=storageFailed?'Device save needs attention.':permanent?`${s.error.message} Please contact shbs@kth.se. Your queued answers have been kept.`:s.error?(s.paused?'Saving needs attention. Your queued answers are kept on this device.':'Connection problem. Your queued answers are kept on this device; saving will retry.'):
        s.queued?(s.saving?'Saving answers…':'Answers kept on this device; saving shortly.'):'Answers saved.';
      node.append(element('p',message,{class:'muted'}));
      if(s.error&&!permanent)node.append(button(s.paused?'Retry saving':'Save now',()=>{saver.retry().catch(()=>{});}));
    }
    function basePayload(action,request_id){return {action,study_id:data.study_id,build_id:data.build_id,mode,session_id:state.session_id,session_token:state.session_token,request_id};}
    saver=T.createBatchSaver({getState:()=>state,commit,accept:acceptBatch,makeRequestId:T.requestId,batchSize:Math.min(5,Math.max(1,Number(config.save_batch_size)||5)),flushAfterMs:Math.min(15000,Math.max(1000,Number(config.save_flush_ms)||15000)),
      send:batch=>mode==='preview'?Promise.resolve({ok:true,acknowledged:batch.responses.map(r=>r.cell_id)}):T.request(config.endpoint,{...basePayload('save',batch.request_id),responses:batch.responses}),
      onChange:()=>{updateSaveStatus();currentControls();},onAcknowledged:()=>{lastAckAt=Date.now();}});
    async function startSession(){
      if(mode==='preview'){
        if(!state.assignments.length)state.assignments=verifyAssignments(previewAssignments(data),data,cells);
        state.session_id=state.session_id||`preview_${T.requestId()}`;save();return;
      }
      state.start_request_id=state.start_request_id||T.requestId();save();
      const result=await T.request(config.endpoint,{...basePayload(state.session_id&&state.session_token?'resume':'start',state.start_request_id),participant_id:participantId,study_platform_id:params.get('STUDY_ID')||'',submission_id:params.get('SESSION_ID')||'',consent_version:config.consent_version||'github_sheets_test_v1',consented_at:state.preparation?.consented_at,headphones_confirmed:state.preparation?.headphones_confirmed===true});
      commit(s=>acceptSession(s,result,data,cells));lastAckAt=Date.now();
      if(state.completed&&mode==='live'&&!T.validCompletionUrl(state.completion_url)){
        state.complete_request_id=state.complete_request_id||T.requestId();save();
        const completion=await T.request(config.endpoint,{...basePayload('complete',state.complete_request_id),preparation:state.preparation,practice_responses:state.practice_responses});
        if(completion.status!=='complete')throw Error('The response store has not confirmed completion. Please try again.');
        state.completion_url=completion.completion_url||null;
      }
      save();
      saver.kick();
    }
    function intro(){
      clear();app.append(element('p',mode==='live'?'Listening study':'Study test',{class:'eyebrow'}),element('h1',data.title||'Speech study'));
      const instructions=Array.isArray(data.instructions)?data.instructions:[data.instructions||'Listen to each extract and choose the answer that fits best.'];
      instructions.forEach(p=>app.append(element('p',p)));
      app.append(element('p',`You will answer ${data.trials_per_session} items after a short sound check and practice. Please use headphones. You can pause or replay the audio.`));
      const details=element('details'),summary=element('summary','Study information');details.append(summary);
      const consent=config.consent_paragraphs||[
        'This research examines how people interpret short speech extracts. Participation is voluntary. You can stop at any time by closing this page.',
        'Your choices, response times, playback information, and study identifier are collected. Responses sent through this study are stored in a Google Sheet restricted to the research team. Test responses are kept separate from participant results.',
        'Individual responses are not published. Contact shbs@kth.se about the study or to request withdrawal using your study identifier.'
      ];
      consent.forEach(p=>details.append(element('p',p)));app.append(details);
      const check=(text,checked)=>{const label=element('label',undefined,{class:'check'}),input=element('input',undefined,{type:'checkbox'});input.checked=checked;label.append(input,document.createTextNode(text));app.append(label);return input;};
      const agree=check('I have read the study information and agree to take part.',Boolean(state.preparation?.consented_at));
      const headphones=check('I am using headphones.',state.preparation?.headphones_confirmed===true);
      const begin=button(state.session_id?'Resume study':'Continue',async()=>{
        if(busy)return;busy=true;begin.disabled=true;begin.textContent='Opening…';
        try{commit(s=>{s.preparation={...s.preparation,consented_at:s.preparation?.consented_at||now(),headphones_confirmed:true,consent_version:config.consent_version||'github_sheets_test_v1'};});await startSession();busy=false;render();}
        catch(e){error(e.message);begin.textContent=state.session_id?'Resume study':'Try again';}finally{busy=false;begin.disabled=!(agree.checked&&headphones.checked);}
      },'primary');
      const update=()=>{begin.disabled=!(agree.checked&&headphones.checked);};agree.addEventListener('change',update);headphones.addEventListener('change',update);update();app.append(element('div',undefined,{class:'actions'}));app.lastChild.append(begin);modeNote();
    }
    function volume(){
      clear();app.append(element('h1','Check your sound'),element('p','Play this practice recording and adjust your volume to a comfortable level.'));
      const sample=(data.practice||[]).find(c=>c.modality==='audio');
      if(!sample){error('The separate practice recording is missing. Please contact the researcher.');return;}
      media=element('audio',undefined,{controls:'',preload:'auto'});media.src=new URL(sample.audio_url,location.href).href;app.append(media);
      const label=element('label',undefined,{class:'check'}),heard=element('input',undefined,{type:'checkbox'});label.append(heard,document.createTextNode('I can hear the recording clearly at a comfortable volume.'));app.append(label);
      let played=false;media.addEventListener('ended',()=>{played=true;update();});
      const next=button('Continue',()=>{try{commit(s=>{s.preparation.volume_confirmed_at=now();s.preparation.volume_check_cell_id=sample.cell_id;});render();}catch(e){showStorageError(e);}},'primary');
      function update(){next.disabled=!(played&&heard.checked);}heard.addEventListener('change',update);update();const actions=element('div',undefined,{class:'actions'});actions.append(next);app.append(actions,element('p','If the recording will not play, check your sound settings or contact shbs@kth.se before continuing.',{class:'muted'}));modeNote();
    }
    async function complete(){
      if(completionRunning)return;completionRunning=true;
      clear();app.append(element('h1','Finishing…'),element('p',mode==='preview'?'Keeping your preview responses on this device.':'Please keep this page open while the response store confirms completion.',{role:'status'}));
      modeNote();
      try{
        await saver.flushAll();
        if(state.outbox.length||state.pending_batch||state.responses.length!==state.assignments.length)throw Error('Some answers have not yet been confirmed. Keep this page open and retry.');
        commit(s=>{s.complete_request_id=s.complete_request_id||T.requestId();});
        const result=mode==='preview'?{ok:true,status:'complete'}:await T.request(config.endpoint,{...basePayload('complete',state.complete_request_id),preparation:state.preparation,practice_responses:state.practice_responses});
        if(result.status!=='complete')throw Error('The response store has not confirmed completion. Please try again.');
        commit(s=>{s.completed=true;s.completed_at=now();s.completion_url=result.completion_url||null;});saver.stop();finished();
      }catch(e){if(e.code==='LOCAL_STORAGE')showStorageError(e);else error(e.message);app.append(button('Retry completion',()=>complete(),'primary'));}finally{completionRunning=false;}
    }
    function finished(){
      clear();app.append(element('h1',mode==='preview'?'Preview finished':'Thank you'),element('p',mode==='preview'?'You have completed the local preview. No responses were sent to Google Sheets.':mode==='test'?'Your test responses have been saved to the response store.':'Your responses have been saved.'));
      if(mode==='live'&&T.validCompletionUrl(state.completion_url)){const link=element('a','Return to Prolific',{href:state.completion_url,class:'button-link primary'});app.append(link);}
      else if(mode==='live')app.append(element('p','Please return to Prolific and contact the researcher if a completion code is required.'));
      if(mode!=='live'){
        const actions=element('div',undefined,{class:'actions'});
        actions.append(button('Download test responses',()=>{const output=clone(state);delete output.session_token;const url=URL.createObjectURL(new Blob([JSON.stringify(output,null,2)],{type:'application/json'}));const link=element('a',undefined,{href:url,download:`${data.study_id}-${mode}-responses.json`});link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}),button('Start another test',()=>{localStorage.removeItem(identityKey);location.reload();}));app.append(actions);
      }
      modeNote();
    }
    function render(){
      if(state.completed){finished();return;}if(!state.preparation?.volume_confirmed_at){volume();return;}
      const practices=data.practice||[],practiceIndex=state.practice_responses.length;
      if(practiceIndex<practices.length){const cell=practices[practiceIndex];trial(cell,{cell_id:cell.cell_id,option_order:cell.options.map(o=>o.id)},true,practiceIndex,practices.length);return;}
      const seen=new Set([...state.responses,...state.outbox].map(r=>r.cell_id)),assignment=state.assignments.find(a=>!seen.has(a.cell_id));
      if(!assignment){complete();return;}trial(cells.get(assignment.cell_id),assignment,false,seen.size,state.assignments.length);
    }
    function trial(cell,assignment,practice,index,total){
      clear();
      if(state.draft?.cell_id!==cell.cell_id)state.draft={cell_id:cell.cell_id,started_at:now(),choice:null,technical_problem:null,first_play_completed:false};
      const draft=state.draft;save();
      const header=element('header',undefined,{class:'study-heading'});header.append(element('h1',practice?'Practice':'Speech study'),element('p',`${index+1} of ${total}`,{class:'progress'}));app.append(header);
      if(practice)app.append(element('p','Try the controls and choose the answer that fits best. This practice answer will not be marked right or wrong.',{class:'muted'}));
      let play,pause,status;
      if(cell.modality==='audio'){
        media=element('audio',undefined,{preload:'auto',hidden:'','aria-label':'Speech extract'});media.src=new URL(cell.audio_url,location.href).href;app.append(media);
        const controls=element('div',undefined,{class:'audio-controls',role:'group','aria-label':'Audio playback'});
        play=button('Play',()=>playback.play());pause=button('Pause',()=>playback.pause());controls.append(play,pause);status=element('p','Listen to the whole extract before answering.',{class:'playback-status',role:'status'});app.append(controls,status);
      }else app.append(element('p',cell.text,{class:'words'}));
      const question=element('h2',cell.question,{id:'trial-question',tabindex:'-1'});app.append(question);
      const choices=element('div',undefined,{class:'answers',role:'group','aria-labelledby':'trial-question'}),selection=element('p','',{class:'choice-status','aria-live':'polite'});
      for(const[id,position]of assignment.option_order.map((id,i)=>[id,i])){
        const option=cell.options.find(o=>o.id===id),choice=button('',()=>{if(!ready(cell,draft)||busy||storageFailed)return;draft.choice=id;draft.technical_problem=null;problem.value='';technical.open=false;persistDraft();update();},'answer');choice.dataset.choice=id;
        if(data.study_id==='turn')choice.append(element('span',position===0?'A':'B',{class:'letter','aria-hidden':'true'}));choice.append(element('span',option.text,{class:'answer-text'}));choices.append(choice);
      }
      app.append(choices,selection);
      const technical=element('details'),problem=element('select',undefined,{id:'technical-problem'}),note=element('textarea',undefined,{id:'technical-note',rows:'2',maxlength:'500'});
      technical.append(element('summary','Report a technical problem'),element('label','What went wrong?',{for:'technical-problem'}));
      const issues=[['','Choose a problem'],['audio_load','The audio did not load'],['audio_playback','The audio would not play'],['display','The words or choices did not display'],['other','Another technical problem']];
      for(const[value,label]of issues){if(cell.modality==='text'&&value.startsWith('audio_'))continue;problem.append(element('option',label,{value}));}
      problem.value=draft.technical_problem||'';note.value=draft.technical_note||'';technical.open=Boolean(draft.technical_problem);technical.append(problem,element('label','Optional details',{for:'technical-note'}),note);app.append(technical);
      problem.addEventListener('change',()=>{draft.technical_problem=problem.value||null;if(problem.value)draft.choice=null;persistDraft();update();});note.addEventListener('input',()=>{draft.technical_note=note.value;saveSoon();});
      const next=button('Next',async()=>{
        if(busy||storageFailed||!canAdvance(cell,draft))return;busy=true;next.textContent='Continuing…';update();if(media)media.pause();
        try{
          const answer=responseFor(cell,draft,assignment);
          if(practice)commit(s=>{s.practice_responses.push(answer);s.draft=null;});
          else commit(s=>queueResponse(s,answer));
          busy=false;render();
          if(!practice)saver.kick();
        }catch(e){busy=false;next.textContent='Next';update();if(e.code==='LOCAL_STORAGE')showStorageError(e);else error(e.message);}finally{busy=false;}
      },'primary');
      const actions=element('div',undefined,{class:'actions'});actions.append(next);app.append(actions);
      function update(){
        const permanent=saver?.status().error?.retryable===false&&saver?.status().error?.code!=='LOCAL_STORAGE',blocked=busy||storageFailed||permanent;
        for(const choice of choices.children){choice.disabled=blocked||!ready(cell,draft);choice.setAttribute('aria-pressed',String(choice.dataset.choice===draft.choice));}
        next.disabled=blocked||!canAdvance(cell,draft);
        selection.textContent=draft.technical_problem?'Technical problem selected. No answer will be recorded for this item.':draft.choice?'Answer selected.':'';
        if(media){play.disabled=busy||!media.paused;pause.disabled=busy||media.paused;status.textContent=draft.first_play_completed?'You have listened to the whole extract. Press Play to listen again.':!media.paused?'Listening…':'Listen to the whole extract before answering.';}
      }
      if(media)playback=globalThis.SentenceFitPlayback.attach({media,draft,save:saveSoon,onChange:update,onError:error});
      currentControls=update;update();modeNote();question.focus({preventScroll:true});
    }
    const heartbeat=mode!=='preview'?setInterval(()=>{
      if(state.session_id&&state.session_token&&!state.completed&&document.visibilityState==='visible'&&Date.now()-lastAckAt>=90000&&!saver.status().saving)T.request(config.endpoint,basePayload('heartbeat',T.requestId()),{timeoutMs:20000}).then(()=>{lastAckAt=Date.now();}).catch(()=>{});
    },120000):null;
    const tryFlush=()=>{if(state.session_id&&!state.completed)saver.flush().catch(()=>{});};
    document.addEventListener?.('visibilitychange',()=>{if(document.visibilityState==='hidden')tryFlush();});
    globalThis.addEventListener?.('online',tryFlush);
    intro();
    return {getState:()=>clone(state),storageKey,mode,flush:()=>saver.flushAll(),stop(){pageStopped=true;saver.stop();if(heartbeat!==null)clearInterval(heartbeat);closeMedia();releaseTab();}};
  }
  return {catalog,verifyAssignments,previewAssignments,ready,canAdvance,responseFor,acceptSaved,prepareOutbox,transaction,queueResponse,acceptBatch,mergeSaved,acceptSession,acquireTabLock,mount,fatal};
});
