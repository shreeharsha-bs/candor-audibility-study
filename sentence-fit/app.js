(function(root){
  'use strict';
  const container=document.getElementById('study');
  fetch('participant-data.json',{cache:'no-store'}).then(response=>{if(!response.ok)throw Error('The study materials could not be loaded. Please try again.');return response.json();}).then(data=>{
    if(!Array.isArray(data.lists)||!data.lists.length)throw Error('The study list is unavailable.');
    const query=new URLSearchParams(location.search),requested=query.get('list'),condition=query.get('condition');
    const list=requested?data.lists.find(row=>row.list_id===requested):condition?data.lists.find(row=>row.condition_number===Number(condition)):data.lists[0];
    if(!list)throw Error('This preview list could not be found.');
    const fullFlow=query.get('practice')==='1',sessionKey='sentence_fit_simple_preview_session_v1__'+data.build_id+'__'+list.list_id+(fullFlow?'__practice':'');
    let sessionId=root.localStorage.getItem(sessionKey);if(!sessionId){sessionId=root.crypto?.randomUUID?.()||`preview_${Date.now()}`;root.localStorage.setItem(sessionKey,sessionId);}
    root.sentenceFitPreview=root.SentenceFitStudy.mount({container,trials:list.trials,preparation:fullFlow?{volumeCheck:data.volume_check,practice:data.practice,requireHeadphones:true}:null,context:{mode:'preview',protocol_id:data.protocol_id,build_id:data.build_id,schedule_id:data.schedule_id||null,list_id:list.list_id,session_id:sessionId}});
  }).catch(error=>{container.replaceChildren();const title=document.createElement('h1'),message=document.createElement('p');title.textContent='Speech study';message.textContent=error.message||'The study could not be loaded.';message.setAttribute('role','alert');container.append(title,message);});
})(globalThis);
