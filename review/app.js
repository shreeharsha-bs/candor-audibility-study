/* Public collaborator preview. No response network requests or participant IDs. */
(async () => {
  'use strict';
  const $ = id => document.getElementById(id);
  const panels = ['home', 'materials', 'trial', 'phrase-trial', 'feedback', 'complete', 'results'];
  const phraseMode='phrase_walkthrough', phraseSelection='all_phrases_v1';
  const names = {original:'Original speech',omnivoice:'OmniVoice',f5:'F5-TTS',cosyvoice2:'CosyVoice2',qwen3_base:'Qwen3-TTS Base',text:'Gated text'};
  const labels = {question_projection:[['question','Question'],['non_question','Non-question'],['unsure','Unsure']],possible_completion:[['could_finish','Could finish here'],['expects_more','More speech expected'],['unsure','Unsure']]};
  let manifest, metadata, listData, catalog, trials, meta, tracks, key, store, current, sequence, chosen, began, started, ended, requested, phraseRows=[], phraseUIs=new Map(), storageFailed=false;
  const reportError = message => { $('error').textContent=message; $('error').hidden=false; };
  function storageWarning(){reportError('This browser could not save your review. Keep this page open and download it when finished. Responses currently remain only in this open page.');}
  function panel(id){$('audio').pause();for(const ui of phraseUIs.values())if(ui.audio)ui.audio.pause(); panels.forEach(p=>$(p).hidden=p!==id);$('footer').hidden=id==='trial'||id==='phrase-trial'||id==='feedback'; $('error').hidden=true;if(storageFailed)storageWarning();window.scrollTo(0,0);}
  function persist(){try{localStorage.setItem(key,JSON.stringify(store));storageFailed=false;$('save-state').textContent='Saved on this device';return true;}catch(e){storageFailed=true;storageWarning();$('save-state').textContent='Browser saving unavailable';return false;}}
  function option(parent,value,text){const e=document.createElement('option');e.value=value;e.textContent=text;parent.append(e);}
  function route(view){
    const params=new URLSearchParams(location.search);params.delete('view');
    if(requested)params.set('list',requested);
    if(view==='home')params.delete('set');else params.set('view',view);
    history.replaceState(null,'',location.pathname+(params.size?'?'+params.toString():''));
    const materialsParams=new URLSearchParams();if(requested)materialsParams.set('list',requested);materialsParams.set('view','materials');
    $('materials-link').href='?'+materialsParams.toString();
    $('home-link').href=requested?'?list='+encodeURIComponent(requested):'./';
  }
  function unfinished(mode,selection){return store.sessions.filter(s=>s.mode===mode&&!s.completed_at&&(!selection||s.selection_id===selection)).sort((a,b)=>(Date.parse(b.started_at)||0)-(Date.parse(a.started_at)||0)||store.sessions.indexOf(b)-store.sessions.indexOf(a))[0];}
  function idsFor(mode,selection){if(mode===phraseMode)return catalog.phraseReviewIds;if(mode==='assigned_list'){const x=listData.lists.find(l=>l.list_id===selection);if(!x)throw Error('Unknown list');return x.stimulus_ids;} const x=tracks.find(t=>t.id===selection);if(!x)throw Error('Unknown review set');return x.ids;}
  function hasResponseExposure(session){return session.responses.some(r=>r.choice!=='skipped'||r.audio_started===true);}
  function newSession(mode,selection){return {schema_version:1,build_id:manifest.build_id,review_context:'collaborator_preview',session_id:crypto.randomUUID(),mode,selection_id:selection,started_at:new Date().toISOString(),prior_results_viewed:!!store.resultsViewed,prior_stimulus_exposure:store.seenStimuli.length>0||store.sessions.some(hasResponseExposure),responses:[]};}
  function recordStimulusExposure(id){store.sessionExposure[current.session_id]=store.sessionExposure[current.session_id]||[];if(!store.sessionExposure[current.session_id].includes(id)){store.sessionExposure[current.session_id].push(id);if(!store.seenStimuli.includes(id))store.seenStimuli.push(id);persist();}}
  function recordExposure(){recordStimulusExposure(sequence[current.responses.length]);}
  function start(mode,selection){
    current=unfinished(mode,selection);
    if(!current){current=newSession(mode,selection);store.sessions.push(current);}else{current.prior_results_viewed=!!current.prior_results_viewed||!!store.resultsViewed;current.prior_stimulus_exposure=!!current.prior_stimulus_exposure||!!store.materialsViewed||Object.entries(store.sessionExposure).some(([id,seen])=>id!==current.session_id&&seen.length>0)||store.sessions.some(s=>s.session_id!==current.session_id&&hasResponseExposure(s));}
    sequence=idsFor(mode,selection);persist();showTrial();
  }
  function showHome(){route('home');panel('home');$('start-assigned').textContent=unfinished(requested?'assigned_list':phraseMode,requested||phraseSelection)?'Resume preview':'Start preview';$('saved-results').hidden=!store.sessions.some(s=>s.completed_at)&&!store.imports.length;}
  function showMaterials(){route('materials');panel('materials');details();}
  function showTrial(){
    if(current.responses.length===sequence.length){showFeedback();return;}
    if(current.mode===phraseMode){showPhrase();return;}
    panel('trial');const t=trials.get(sequence[current.responses.length]),draft=store.drafts[current.session_id]||{};chosen=draft.choice||null;began=performance.now();started=!!draft.audio_started;ended=!!draft.audio_ended;
    $('progress').textContent=`Item ${current.responses.length+1} of ${sequence.length}`;
    $('progress-bar').max=sequence.length;$('progress-bar').value=current.responses.length;
    const audio=$('audio');audio.removeAttribute('src');audio.load();audio.hidden=t.modality!=='audio';$('words').hidden=t.modality!=='text';$('words').textContent='';
    if(t.modality==='audio'){audio.src=t.audio_url;audio.load();}else{$('words').textContent=t.text;recordExposure();}
    $('task-question').textContent=t.task==='question_projection'?(t.modality==='audio'?'Does this sound like a question, or the beginning of one?':'Do these words suggest a question, or the beginning of one?'):(t.modality==='audio'?'Could the speaker reasonably finish here, or does more speech sound expected?':'Could the speaker reasonably finish after these words, or is more expected?');
    $('choices').replaceChildren();for(const [value,label] of labels[t.task]){const b=document.createElement('button');b.type='button';b.textContent=label;b.setAttribute('aria-pressed',String(chosen===value));b.onclick=()=>{chosen=value;for(const x of $('choices').children)x.setAttribute('aria-pressed',String(x===b));rememberTrial();};$('choices').append(b);}
    $('clip-note').value=draft.note||'';$('save-state').textContent='Answers are optional.';updateSave();
  }
  function updateSave(){$('save-next').disabled=false;}
  function rememberTrial(){store.drafts[current.session_id]={choice:chosen,audio_started:started,audio_ended:ended,note:$('clip-note').value.slice(0,5000)};persist();updateSave();}
  function saveNext(){
    const t=trials.get(sequence[current.responses.length]);
    current.responses.push({trial_id:t.trial_id,choice:chosen||'skipped',order_index:current.responses.length,submitted_at:new Date().toISOString(),elapsed_ms:Math.round(performance.now()-began),audio_started:started,audio_ended:ended,note:$('clip-note').value.trim().slice(0,5000)});
    delete store.drafts[current.session_id];persist();showTrial();
  }
  function phraseDraft(id){
    const draft=store.drafts[current.session_id]||(store.drafts[current.session_id]={});
    draft.versions=draft.versions||{};
    return draft.versions[id]||(draft.versions[id]={});
  }
  function rememberPhrase(){
    const saved=persist();$('phrase-save-state').textContent=saved?'Saved on this device':'Browser saving unavailable';updatePhrase();
  }
  function phraseRated(t){return !!phraseDraft(t.trial_id).choice;}
  function updatePhrase(){
    const ready=phraseRows.filter(phraseRated).length;
    $('phrase-rated').textContent=`${ready} of ${phraseRows.length} versions rated`;
    $('phrase-progress-bar').value=current.responses.length+ready;
    $('phrase-next').disabled=false;
    for(const t of phraseRows){const ui=phraseUIs.get(t.trial_id);if(ui)ui.status.textContent=phraseRated(t)?'Rated':'Answer optional';}
  }
  function showPhrase(){
    panel('phrase-trial');phraseUIs=new Map();
    const first=trials.get(sequence[current.responses.length]);
    phraseRows=sequence.slice(current.responses.length).map(id=>trials.get(id)).filter(t=>t.phrase_id===first.phrase_id&&t.gate===first.gate);
    const phraseCount=new Set(manifest.stimuli.map(t=>t.phrase_id)).size;
    $('phrase-progress').textContent=`Phrase ${first.phrase_number} of ${phraseCount} · ${first.gate==='earlier'?'Shorter cut':'Longer cut'}`;
    $('phrase-progress-bar').max=sequence.length;
    $('phrase-question').textContent=first.task==='question_projection'?'Does this seem like a question, or the beginning of one?':'Could the speaker reasonably finish here, or is more speech expected?';
    $('phrase-next').textContent=first.gate==='earlier'?'Continue to the longer cut':current.responses.length+phraseRows.length===sequence.length?'Finish review':'Continue to the next phrase';
    $('phrase-content').replaceChildren();$('phrase-save-state').textContent=storageFailed?'Browser saving unavailable':'';
    function element(tag,text,parent){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;parent.append(el);return el;}
    for(const family of ['main','punctuation']){
      const rows=phraseRows.filter(t=>meta.get(t.trial_id).analysis_family===family);if(!rows.length)continue;
      const section=element('section',undefined,$('phrase-content'));
      if(family==='punctuation')element('h3','Punctuation versions',section);
      const grid=element('div',undefined,section);grid.className='version-grid';
      for(const t of rows){
        const m=meta.get(t.trial_id),draft=phraseDraft(t.trial_id),rowBegan=performance.now();
        const card=element('article',undefined,grid);card.className='card version-card';card.setAttribute('data-trial-id',t.trial_id);
        element('h3',(names[m.system]||m.system)+(family==='punctuation'?' · '+(m.condition==='period'?'period input':'question-mark input'):''),card);
        const ui={};phraseUIs.set(t.trial_id,ui);
        if(t.modality==='audio'){
          const audio=element('audio',undefined,card);audio.controls=true;audio.preload='metadata';audio.src=t.audio_url;ui.audio=audio;
          audio.onplay=()=>{if(audio.paused)return;for(const other of phraseUIs.values())if(other.audio&&other.audio!==audio)other.audio.pause();draft.audio_started=true;recordStimulusExposure(t.trial_id);rememberPhrase();};
          audio.onended=()=>{draft.audio_started=true;draft.audio_ended=true;rememberPhrase();};
          audio.onerror=()=>{if(!$('phrase-trial').hidden&&phraseUIs.get(t.trial_id)===ui)reportError('A recording could not play. You can continue without it, or reload to retry. Your saved answers will remain.');};
        }else{const words=element('p',t.text,card);words.className='words';recordStimulusExposure(t.trial_id);}
        const choices=element('div',undefined,card);choices.className='choices';
        for(const [value,label] of labels[t.task]){const b=element('button',label,choices);b.type='button';b.setAttribute('aria-pressed',String(draft.choice===value));b.onclick=()=>{draft.choice=value;draft.submitted_at=new Date().toISOString();draft.elapsed_ms=Math.round(performance.now()-rowBegan);for(const x of choices.children)x.setAttribute('aria-pressed',String(x===b));rememberPhrase();};}
        ui.status=element('p',undefined,card);ui.status.className='muted';ui.status.setAttribute('role','status');
        const noteBox=element('details',undefined,card);element('summary','Add a note',noteBox);
        const note=element('textarea',undefined,noteBox);note.rows=2;note.value=draft.note||'';note.setAttribute('aria-label','Note for '+names[m.system]+(family==='punctuation'?' '+m.condition:''));
        if(note.value)noteBox.open=true;note.oninput=()=>{draft.note=note.value.slice(0,5000);rememberPhrase();};
      }
    }
    updatePhrase();
  }
  function savePhrase(){
    for(const t of phraseRows){const draft=phraseDraft(t.trial_id);current.responses.push({trial_id:t.trial_id,choice:draft.choice||'skipped',order_index:current.responses.length,submitted_at:draft.submitted_at||new Date().toISOString(),elapsed_ms:draft.elapsed_ms||0,audio_started:t.modality==='audio'&&!!draft.audio_started,audio_ended:t.modality==='audio'&&!!draft.audio_ended,note:(draft.note||'').trim()});}
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
    for(const l of listData.lists)option($('legacy-list'),l.list_id,l.list_id+(unfinished('assigned_list',l.list_id)?' · In progress':''));
    $('legacy-list').value=requested||unfinished('assigned_list')?.selection_id||listData.lists[0].list_id;
    if(params.get('set')&&tracks.some(x=>x.id===params.get('set')))$('track').value=params.get('set');
    $('start-assigned').onclick=()=>start(requested?'assigned_list':phraseMode,requested||phraseSelection);$('start-track').onclick=()=>start('cut_walkthrough',$('track').value);$('save-next').onclick=saveNext;$('pause').onclick=()=>current.mode==='cut_walkthrough'?showMaterials():showHome();$('materials-home').onclick=showHome;
    $('resume-list').onclick=()=>{requested=$('legacy-list').value;route('home');start('assigned_list',requested);};
    $('phrase-next').onclick=savePhrase;$('phrase-pause').onclick=showHome;
    $('audio').onplay=()=>{started=true;recordExposure();rememberTrial();};$('audio').onended=()=>{started=true;ended=true;rememberTrial();};$('audio').onerror=()=>{if(!$('trial').hidden&&$('audio').getAttribute('src'))reportError('This clip could not play. You can continue without it, or reload to retry. Your earlier answers are saved.');};
    $('clip-note').oninput=rememberTrial;
    for(const id of ['feedback-instructions','feedback-short','feedback-technical'])$(id).oninput=()=>{store.drafts[current.session_id]={feedback:feedback()};persist();};
    $('finish').onclick=finish;$('download-current').onclick=()=>download(current,'candor-review-'+current.session_id+'.json');$('show-results').onclick=showResults;$('saved-results').onclick=showResults;$('home-button').onclick=showHome;$('results-home').onclick=showHome;$('imports').onchange=importFiles;$('download-all').onclick=()=>download({schema_version:1,build_id:manifest.build_id,review_context:'collaborator_preview',sessions:loaded()},'candor-loaded-reviews.json');
    $('analyse-files').onclick=()=>showResults(true);
    $('material-details').ontoggle=()=>{if($('material-details').open){store.materialsViewed=true;store.seenStimuli=[...new Set([...store.seenStimuli,...manifest.stimuli.map(t=>t.trial_id)])];persist();}};
    if(params.get('view')==='results')showResults(true);else if(params.get('view')==='materials'||(!requested&&params.has('set')))showMaterials();else showHome();
  }catch(e){reportError('The preview could not start: '+e.message+' Please reload or let Harsha know.');}
})();
