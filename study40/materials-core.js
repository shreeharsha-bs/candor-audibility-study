(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.Study40MaterialsCore=api;})(globalThis,function(){
  'use strict';
  const STORAGE_KEY='candor_study40_materials_v1',EXPOSURE_KEY='candor_study40_materials_exposure_v1';
  const GATES=['early','late','full'];
  function catalog(materials,data){
    if(materials.schema_version!==1||materials.build_id!==data.build_id||!Array.isArray(materials.phrases)||materials.phrases.length!==40)throw Error('The phrase collection could not be read.');
    const seen=new Set(),numbers=new Set();
    for(const phrase of materials.phrases){
      if(!Number.isInteger(phrase.phrase_number)||phrase.phrase_number<1||phrase.phrase_number>40||numbers.has(phrase.phrase_number))throw Error('A phrase has an invalid identity.');
      numbers.add(phrase.phrase_number);
      if(phrase.versions.length!==(phrase.task==='question_projection'?14:6))throw Error('A phrase is missing a version.');
      for(const version of phrase.versions){
        if(typeof version.label!=='string'||!version.label||GATES.some(g=>!version.cuts[g]))throw Error('A phrase is missing a cut.');
        for(const gate of GATES){const id=version.cuts[gate],row=data.presentations[id];if(seen.has(id)||!row||row.task!==phrase.task||row.modality!==version.modality)throw Error('A phrase has an incorrect presentation.');seen.add(id);}
      }
    }
    if(seen.size!==1392||Object.keys(data.presentations).length!==1392)throw Error('The collection needs all 1,392 presentations.');
    for(const [id,note]of Object.entries(materials.preparation_notes||{}))if(!seen.has(id)||typeof note!=='string'||!note.trim()||note.length>240)throw Error('A listening note could not be matched to its excerpt.');
    return [...materials.phrases].sort((a,b)=>a.phrase_number-b.phrase_number);
  }
  function sequence(phrases){return phrases.flatMap(p=>GATES.flatMap(g=>p.versions.map(v=>({phrase_number:p.phrase_number,version_index:v.version_index,gate:g,presentation_id:v.cuts[g]}))));}
  function prepare(saved){
    if(!saved)return {schema_version:1,reviews:{},history:[],cursor:null};
    if(saved.schema_version!==1||!saved.reviews||!Array.isArray(saved.history))throw Error('Saved material notes could not be read. Your existing notes have been kept.');
    return JSON.parse(JSON.stringify(saved));
  }
  function currentReview(state,row){const review=state.reviews[row.presentation_id];return review?.input_fingerprint===row.input_fingerprint?review:null;}
  function saveReview(state,row,values,at,build,preparationNote=null){
    if(!row.ready)throw Error('This excerpt is not ready to review.');
    const valid=row.task==='question_projection'?['question','non_question','unsure']:['could_finish_here','more_speech_expected','unsure'];
    if(values.answer!==null&&!valid.includes(values.answer))throw Error('The answer does not match this question.');
    const old=state.reviews[row.presentation_id];
    if(old&&old.input_fingerprint!==row.input_fingerprint)state.history.push(old);
    state.reviews[row.presentation_id]={record_type:'colleague_material_judgment',presentation_id:row.presentation_id,input_fingerprint:row.input_fingerprint,task:row.task,modality:row.modality,answer:values.answer,note:String(values.note||''),shown_preparation_note:preparationNote,updated_at:at,build_id:build};
    return state.reviews[row.presentation_id];
  }
  function exportReviews(state,data,qa){return {kind:'candor_study40_materials_reviews',schema_version:1,preview_only:true,engineering_qa:Boolean(qa),build_id:data.build_id,schedule_id:data.schedule_id,...JSON.parse(JSON.stringify(state))};}
  return {STORAGE_KEY,EXPOSURE_KEY,GATES,catalog,sequence,prepare,currentReview,saveReview,exportReviews};
});
