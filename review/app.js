/* Public collaborator preview. No response network requests or participant IDs. */
(async () => {
  'use strict';
  const $ = id => document.getElementById(id);
  const panels = ['home', 'materials', 'trial', 'feedback', 'complete', 'results'];
  const names = {original:'Original speech',omnivoice:'OmniVoice',f5:'F5-TTS',cosyvoice2:'CosyVoice2',qwen3_base:'Qwen3-TTS Base',text:'Gated text'};
  const labels = {question_projection:[['question','Question'],['non_question','Non-question'],['unsure','Unsure']],possible_completion:[['could_finish','Could finish here'],['expects_more','More speech expected'],['unsure','Unsure']]};
  let manifest, metadata, listData, catalog, trials, meta, tracks, key, store, current, sequence, chosen, began, started, ended, requested, previewListId, storageFailed=false;
  const reportError = message => { $('error').textContent=message; $('error').hidden=false; };
  function storageWarning(){reportError('This browser could not save your review. Keep this page open and download it when finished. Responses currently remain only in this open page.');}
  function panel(id){$('audio').pause(); panels.forEach(p=>$(p).hidden=p!==id);$('footer').hidden=id==='trial'||id==='feedback'; $('error').hidden=true;if(storageFailed)storageWarning();window.scrollTo(0,0);}
  function persist(){try{localStorage.setItem(key,JSON.stringify(store));storageFailed=false;$('save-state').textContent='Saved on this device';return true;}catch(e){storageFailed=true;storageWarning();$('save-state').textContent='Browser saving unavailable';return false;}}
  function option(parent,value,text){const e=document.createElement('option');e.value=value;e.textContent=text;parent.append(e);}
  function route(view){
    const params=new URLSearchParams(location.search);params.delete('view');
    if(view==='home')params.delete('set');else params.set('view',view);
    history.replaceState(null,'',location.pathname+(params.size?'?'+params.toString():''));
    const materialsParams=new URLSearchParams();if(requested)materialsParams.set('list',requested);materialsParams.set('view','materials');
    $('materials-link').href='?'+materialsParams.toString();
    $('home-link').href=requested?'?list='+encodeURIComponent(requested):'./';
  }
  function unfinished(mode,selection){return store.sessions.filter(s=>s.mode===mode&&!s.completed_at&&(!selection||s.selection_id===selection)).sort((a,b)=>(Date.parse(b.started_at)||0)-(Date.parse(a.started_at)||0)||store.sessions.indexOf(b)-store.sessions.indexOf(a))[0];}
  function selectPreviewList(){
    const valid=id=>listData.lists.some(l=>l.list_id===id);
    const latest=unfinished('assigned_list');
    previewListId=requested||(latest&&latest.selection_id)||(valid(store.previewListId)&&store.previewListId)||listData.lists[Math.floor(Math.random()*listData.lists.length)].list_id;
    if(store.previewListId!==previewListId){store.previewListId=previewListId;persist();}
  }
  function idsFor(mode,selection){if(mode==='assigned_list'){const x=listData.lists.find(l=>l.list_id===selection);if(!x)throw Error('Unknown list');return x.stimulus_ids;} const x=tracks.find(t=>t.id===selection);if(!x)throw Error('Unknown review set');return x.ids;}
  function newSession(mode,selection){return {schema_version:1,build_id:manifest.build_id,review_context:'collaborator_preview',session_id:crypto.randomUUID(),mode,selection_id:selection,started_at:new Date().toISOString(),prior_results_viewed:!!store.resultsViewed,prior_stimulus_exposure:store.seenStimuli.length>0||store.sessions.some(s=>s.responses.length>0),responses:[]};}
  function recordExposure(){const id=sequence[current.responses.length];store.sessionExposure[current.session_id]=store.sessionExposure[current.session_id]||[];if(!store.sessionExposure[current.session_id].includes(id)){store.sessionExposure[current.session_id].push(id);if(!store.seenStimuli.includes(id))store.seenStimuli.push(id);persist();}}
  function start(mode,selection){
    current=unfinished(mode,selection);
    if(!current){current=newSession(mode,selection);store.sessions.push(current);}else{current.prior_results_viewed=!!current.prior_results_viewed||!!store.resultsViewed;current.prior_stimulus_exposure=!!current.prior_stimulus_exposure||!!store.materialsViewed||Object.entries(store.sessionExposure).some(([id,seen])=>id!==current.session_id&&seen.length>0)||store.sessions.some(s=>s.session_id!==current.session_id&&s.responses.length>0);}
    sequence=idsFor(mode,selection);persist();showTrial();
  }
  function showHome(){selectPreviewList();route('home');panel('home');$('start-assigned').textContent=unfinished('assigned_list',previewListId)?'Resume preview':'Start preview';$('saved-results').hidden=!store.sessions.some(s=>s.completed_at)&&!store.imports.length;}
  function showMaterials(){route('materials');panel('materials');details();}
  function showTrial(){
    if(current.responses.length===sequence.length){showFeedback();return;}
    panel('trial');const t=trials.get(sequence[current.responses.length]);chosen=null;began=performance.now();started=false;ended=false;
    $('progress').textContent=`Item ${current.responses.length+1} of ${sequence.length}`;
    $('progress-bar').max=sequence.length;$('progress-bar').value=current.responses.length;
    const audio=$('audio');audio.removeAttribute('src');audio.load();audio.hidden=t.modality!=='audio';$('words').hidden=t.modality!=='text';$('words').textContent='';
    if(t.modality==='audio'){audio.src=t.audio_url;audio.load();}else{$('words').textContent=t.text;recordExposure();}
    $('task-question').textContent=t.task==='question_projection'?(t.modality==='audio'?'Does this sound like a question, or the beginning of one?':'Do these words suggest a question, or the beginning of one?'):(t.modality==='audio'?'Could the speaker reasonably finish here, or does more speech sound expected?':'Could the speaker reasonably finish after these words, or is more expected?');
    $('choices').replaceChildren();for(const [value,label] of labels[t.task]){const b=document.createElement('button');b.type='button';b.textContent=label;b.setAttribute('aria-pressed','false');b.onclick=()=>{chosen=value;for(const x of $('choices').children)x.setAttribute('aria-pressed',String(x===b));updateSave();};$('choices').append(b);}
    $('clip-note').value=store.drafts[current.session_id]?.note||'';$('save-state').textContent=t.modality==='audio'?'Listen once before continuing.':'';updateSave();
  }
  function updateSave(){const t=trials.get(sequence[current.responses.length]);$('save-next').disabled=!chosen||(t.modality==='audio'&&!ended);}
  function saveNext(){
    const t=trials.get(sequence[current.responses.length]);if(!chosen||(t.modality==='audio'&&!ended))return;
    current.responses.push({trial_id:t.trial_id,choice:chosen,order_index:current.responses.length,submitted_at:new Date().toISOString(),elapsed_ms:Math.round(performance.now()-began),audio_started:started,audio_ended:ended,note:$('clip-note').value.trim().slice(0,5000)});
    delete store.drafts[current.session_id];persist();showTrial();
  }
  function showFeedback(){panel('feedback');const f=store.drafts[current.session_id]?.feedback||current.feedback||{};$('feedback-instructions').value=f.instructions||'';$('feedback-short').value=f.short_clips||'';$('feedback-technical').value=f.technical||'';}
  function feedback(){return {instructions:$('feedback-instructions').value.trim().slice(0,5000),short_clips:$('feedback-short').value.trim().slice(0,5000),technical:$('feedback-technical').value.trim().slice(0,5000)};}
  function finish(){current.feedback=feedback();current.completed_at=new Date().toISOString();try{CandorResults.validateSession(current,catalog);}catch(e){delete current.completed_at;reportError('The review did not pass its save check: '+e.message);return;}delete store.drafts[current.session_id];persist();$('complete-status').textContent=storageFailed?'Download now to keep your review':'Saved on this device';panel('complete');}
  function download(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function completed(){return store.sessions.filter(s=>s.completed_at);}
  function loaded(){return CandorResults.mergeSessions(completed(),store.imports,catalog);}
  function details(){
    const wrap=$('stimulus-details');wrap.replaceChildren();const table=document.createElement('table');const head=document.createElement('tr');for(const title of ['Phrase / cut','Version','Words','Endpoint review']){const cell=document.createElement('th');cell.textContent=title;head.append(cell);}table.append(head);
    for(const t of [...manifest.stimuli].sort((a,b)=>a.phrase_number-b.phrase_number||(a.gate==='earlier'?0:1)-(b.gate==='earlier'?0:1))){const m=meta.get(t.trial_id),row=document.createElement('tr');for(const value of [t.phrase_number+' / '+(t.gate==='earlier'?'shorter':'longer'),(names[m.system]||m.system)+' · '+m.condition,m.exposed_text,m.pending_endpoint?'Needs checking':t.modality==='text'?'Matching words':'Accepted endpoint']){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}table.append(row);}const scroller=document.createElement('div');scroller.className='table-wrap';scroller.append(table);wrap.append(scroller);
  }
  function showResults(allowEmpty=false){try{const sessions=loaded();if(!sessions.length&&allowEmpty!==true){reportError('Complete a review first, or open results from Study materials to import review files.');return;}route('results');panel('results');store.resultsViewed=true;persist();CandorResults.render($('result-content'),CandorResults.aggregate(sessions,catalog));}catch(e){reportError(e.message);}}
  async function importFiles(){
    try{let joined=loaded();for(const file of $('imports').files){if(file.size>10*1024*1024)throw Error('A review file is larger than 10 MB.');joined=CandorResults.importJSON(await file.text(),catalog,joined);}
      store.imports=joined.filter(s=>!completed().some(own=>own.session_id===s.session_id));persist();CandorResults.render($('result-content'),CandorResults.aggregate(joined,catalog));$('import-state').textContent=`Loaded ${joined.length} unique completed review sessions. Files were processed in this browser only.`;
    }catch(e){$('import-state').textContent='File not imported: '+e.message;}finally{$('imports').value='';}
  }
  try{
    [manifest,metadata,listData]=await Promise.all(['stimuli','metadata','lists'].map(async name=>{const response=await fetch('data/'+name+'.json');if(!response.ok)throw Error('Could not load '+name);return response.json();}));
    catalog=CandorResults.createCatalog(manifest,metadata,listData);trials=new Map(manifest.stimuli.map(t=>[t.trial_id,t]));meta=new Map(metadata.stimuli.map(t=>[t.stimulus_id,t]));key='candor_shared_review_v1_'+manifest.build_id;
    const raw=localStorage.getItem(key);store=raw?JSON.parse(raw):{sessions:[],imports:[],drafts:{},resultsViewed:false,seenStimuli:[],sessionExposure:{}};store.seenStimuli=store.seenStimuli||[];store.sessionExposure=store.sessionExposure||{};
    if(!Array.isArray(store.sessions)||!Array.isArray(store.imports)||!store.drafts)throw Error('Saved review data has an unexpected format. It has been left untouched.');
    for(const s of [...store.sessions,...store.imports]){CandorResults.validateSession(s,catalog);}
    tracks=[];for(const system of ['original','omnivoice','f5','cosyvoice2','qwen3_base','text'])addTrack('main',system,system==='text'?'text':system==='original'?'original':'neutral');
    for(const system of ['omnivoice','f5','cosyvoice2','qwen3_base'])for(const condition of ['period','question'])addTrack('punctuation',system,condition);
    function addTrack(family,system,condition){const rows=manifest.stimuli.filter(t=>{const m=meta.get(t.trial_id);return m.analysis_family===family&&m.system===system&&(family==='main'||m.condition===condition);}).sort((a,b)=>(a.gate==='earlier'?0:1)-(b.gate==='earlier'?0:1)||a.phrase_number-b.phrase_number);if(rows.length)tracks.push({id:[family,system,condition].join('_'),label:(family==='punctuation'?'Punctuation pilot · ':'')+names[system]+(family==='punctuation'?' · '+(condition==='period'?'period input':'question-mark input'):'')+` (${rows.length} items)`,ids:rows.map(t=>t.trial_id)});}
    for(const t of tracks)option($('track'),t.id,t.label);
    const params=new URLSearchParams(location.search);requested=listData.lists.some(x=>x.list_id===params.get('list'))?params.get('list'):null;
    if(params.get('set')&&tracks.some(x=>x.id===params.get('set')))$('track').value=params.get('set');
    $('start-assigned').onclick=()=>start('assigned_list',previewListId);$('start-track').onclick=()=>start('cut_walkthrough',$('track').value);$('save-next').onclick=saveNext;$('pause').onclick=()=>current.mode==='cut_walkthrough'?showMaterials():showHome();$('materials-home').onclick=showHome;
    $('audio').onplay=()=>{started=true;recordExposure();};$('audio').onended=()=>{ended=true;$('save-state').textContent='Ready to save your judgment.';updateSave();};$('audio').onerror=()=>{if(!$('trial').hidden&&$('audio').getAttribute('src'))reportError('This clip could not play. Check your connection and reload to resume. Your earlier answers are saved.');};
    $('clip-note').oninput=()=>{store.drafts[current.session_id]={note:$('clip-note').value};persist();};
    for(const id of ['feedback-instructions','feedback-short','feedback-technical'])$(id).oninput=()=>{store.drafts[current.session_id]={feedback:feedback()};persist();};
    $('finish').onclick=finish;$('download-current').onclick=()=>download(current,'candor-review-'+current.session_id+'.json');$('show-results').onclick=showResults;$('saved-results').onclick=showResults;$('home-button').onclick=showHome;$('results-home').onclick=showHome;$('imports').onchange=importFiles;$('download-all').onclick=()=>download({schema_version:1,build_id:manifest.build_id,review_context:'collaborator_preview',sessions:loaded()},'candor-loaded-reviews.json');
    $('analyse-files').onclick=()=>showResults(true);
    $('material-details').ontoggle=()=>{if($('material-details').open){store.materialsViewed=true;store.seenStimuli=[...new Set([...store.seenStimuli,...manifest.stimuli.map(t=>t.trial_id)])];persist();}};
    if(params.get('view')==='results')showResults(true);else if(params.get('view')==='materials'||(!requested&&params.has('set')))showMaterials();else showHome();
  }catch(e){reportError('The preview could not start: '+e.message+' Please reload or let Harsha know.');}
})();
