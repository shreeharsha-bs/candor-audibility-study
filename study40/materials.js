(function(root){
  'use strict';
  const M=root.Study40MaterialsCore,C=root.Study40Core,now=()=>new Date().toISOString();
  const el=(tag,text,attrs={})=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);return n;};
  function button(text,action){const b=el('button',text,{type:'button'});b.onclick=action;return b;}
  async function mount({container,data,materials,storage=localStorage}){
    const params=new URLSearchParams(location.search),qa=params.get('qa')==='1',suffix=qa?'_qa':'',key=M.STORAGE_KEY+suffix;
    const phrases=M.catalog(materials,data),sequence=M.sequence(phrases),state=M.prepare(JSON.parse(storage.getItem(key)||'null'));
    let cursor=sequence.findIndex(r=>r.presentation_id===state.cursor),player=null;
    if(cursor<0)cursor=0;
    const requested=Number(params.get('phrase'));
    const requestedIndex=sequence.findIndex(r=>r.phrase_number===requested);
    if(requestedIndex>=0)cursor=requestedIndex;
    const save=()=>storage.setItem(key,JSON.stringify(state));
    const stop=()=>{if(player){player.onplay=null;player.pause();player.removeAttribute('src');player.load();player=null;}};
    function exposure(id){const k=M.EXPOSURE_KEY+suffix,record=JSON.parse(storage.getItem(k)||'{"presentations":{}}');record.presentations[id]=record.presentations[id]||now();record.last_at=now();storage.setItem(k,JSON.stringify(record));}
    function navigate(index){cursor=Math.max(0,Math.min(sequence.length-1,index));render();}
    function select(phrase,version,gate){const index=sequence.findIndex(r=>r.phrase_number===phrase&&r.version_index===version&&r.gate===gate);navigate(index<0?sequence.findIndex(r=>r.phrase_number===phrase):index);}
    function render(){
      stop();container.replaceChildren();
      const selected=sequence[cursor],phrase=phrases.find(p=>p.phrase_number===selected.phrase_number),version=phrase.versions.find(v=>v.version_index===selected.version_index),row=data.presentations[selected.presentation_id];
      state.cursor=row.presentation_id;save();
      container.append(el('h1','Speech continuation user study preview'));
      const top=el('div',undefined,{class:'materials-top'}),phraseSelect=el('select',undefined,{'aria-label':'Phrase'});
      for(const p of phrases)phraseSelect.append(el('option',`Phrase ${p.phrase_number}`,{value:p.phrase_number}));
      phraseSelect.value=phrase.phrase_number;phraseSelect.onchange=()=>select(Number(phraseSelect.value),0,'early');top.append(phraseSelect,el('span',`${phrases.indexOf(phrase)+1} of ${phrases.length} phrases`,{class:'progress'}));container.append(top);
      const gates=el('div',undefined,{class:'answers cuts',role:'group','aria-label':'Partial cuts'});
      for(const [gate,label]of [['early','Shorter cut'],['late','Longer cut']]){const b=button(label,()=>select(phrase.phrase_number,version.version_index,gate));b.setAttribute('aria-pressed',String(gate===selected.gate));gates.append(b);}container.append(gates);
      const fullCheck=button('Full phrase check',()=>select(phrase.phrase_number,version.version_index,'full'));fullCheck.className='full-check';fullCheck.setAttribute('aria-pressed',String(selected.gate==='full'));container.append(fullCheck);
      const versionLabel=el('label','Version',{for:'version'}),versionSelect=el('select',undefined,{id:'version','aria-label':'Version'});
      for(const v of phrase.versions)versionSelect.append(el('option',v.label,{value:v.version_index}));versionSelect.value=version.version_index;
      versionSelect.onchange=()=>select(phrase.phrase_number,Number(versionSelect.value),selected.gate);versionLabel.append(versionSelect);container.append(versionLabel);
      if(!row.ready){container.append(el('p','This excerpt is still being prepared.'));}
      else{
        if(row.modality==='audio'){
          player=el('audio',undefined,{controls:'',preload:'metadata','aria-label':'Conversation excerpt'});player.src=row.audio_url;player.onplay=()=>exposure(row.presentation_id);container.append(player);
          player.onerror=()=>{const error=el('p','The audio could not load. Please reload the page and try again.',{role:'alert'});container.append(error);};
        }else{container.append(el('p',row.text,{class:'words'}));exposure(row.presentation_id);}
        if(materials.preparation_notes?.[row.presentation_id])container.append(el('p',materials.preparation_notes[row.presentation_id],{class:'listening-note'}));
        container.append(el('h2',C.questionFor(row)));
        const current=M.currentReview(state,row),earlier=state.reviews[row.presentation_id];
        let review=current||{answer:null,note:earlier?.note||''};
        if(earlier&&!current)container.append(el('p','Your earlier response is preserved. You can answer the updated question below.',{class:'saved'}));
        const saved=el('span',review.updated_at?'Saved on this device':'',{class:'saved','aria-live':'polite'}),choices=el('div',undefined,{class:'answers',role:'group','aria-label':'Your answer'});
        const persist=()=>{review=M.saveReview(state,row,review,now(),data.build_id,materials.preparation_notes?.[row.presentation_id]||null);save();saved.textContent='Saved on this device';};
        const mark=()=>{for(const b of choices.children)b.setAttribute('aria-pressed',String(b.dataset.value===review.answer));};
        for(const [value,label]of C.options(row)){const b=button(label,()=>{review.answer=review.answer===value?null:value;persist();mark();});b.dataset.value=value;choices.append(b);}mark();container.append(choices);
        const label=el('label','Note (optional)',{for:'material-note'}),note=el('textarea',undefined,{id:'material-note',rows:'2'});note.value=review.note;note.oninput=()=>{review.note=note.value;persist();};label.append(note);container.append(label,saved);
      }
      const nav=el('div',undefined,{class:'materials-nav'}),previous=button('Previous excerpt',()=>navigate(cursor-1)),next=button('Next excerpt',()=>navigate(cursor+1));previous.disabled=cursor===0;next.disabled=cursor===sequence.length-1;next.className='primary';nav.append(previous,next);container.append(nav);
      const footer=el('footer'),home=new URL(location.href);home.searchParams.delete('view');home.searchParams.delete('phrase');footer.append(el('a','Back to participant preview',{href:home.href}));
      footer.append(button('Download notes and answers',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(M.exportReviews(state,data,qa),null,2)],{type:'application/json'})),link=el('a',undefined,{href:url,download:'candor-study40-materials-reviews.json'});link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}));container.append(footer);
    }
    render();return {state,render,stop};
  }
  root.Study40Materials={mount};
})(globalThis);
