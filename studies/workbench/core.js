/* CANDOR browser-local import core. No network access or DOM writes. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WBData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const RECORD_TYPES = new Set(['study_start','study_consent','volume_check','study_practice','study_response','study_complete','study_setup_failed']);
  const ID_FIELDS = ['study_id','build_id','session_id','participant_id','batch_id','schedule_id','slot_id','list_id','response_id','record_type','phase','cell_id','phrase_id','version','gate','analysis_role','protocol_id','PROLIFIC_PID','STUDY_ID','SESSION_ID','session_kind','run_id','source_code_version'];
  const NUMBER_FIELDS = ['schema_version','assigned_condition_number','current_host_condition','condition','list_index','trial_index','position','response_ms','response_time_ms','play_count','complete_listen_count','time_elapsed','response_count','main_response_count','practice_response_count'];
  const BOOL_FIELDS = ['engineering_qa','analysis_excluded','participant_data','listen_completed','first_play_completed','headphones_confirmed','volume_confirmed','resume_recovered'];
  const ARRAY_FIELDS = ['option_order','displayed_options','playback_errors','playback_events'];
  const TEXT_FIELDS = ['started_at','responded_at','completed_at','consented_at','recorded_at','consent_version','technical_note','problem_note','chosen_sentence','question','audio_sha256','input_sha256','trial_id','presentation_id','source','host','collection_purpose','browser','browser_version','device','platform','platform_version'];
  const own = (o,k) => Object.prototype.hasOwnProperty.call(o,k);
  const obj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
  const nil = x => x === null || x === undefined || x === '' || x === 'null';
  const text = x => nil(x) ? null : String(x);
  const bool = x => x === true || x === 'true' ? true : x === false || x === 'false' ? false : null;
  const number = x => nil(x) ? null : (typeof x === 'number' || typeof x === 'string') && Number.isFinite(Number(x)) ? Number(x) : null;
  function decoded(x) {
    if (typeof x !== 'string') return x;
    const s=x.trim();
    if (!s) return null;
    if (s==='null') return null;
    if (s==='true') return true;
    if (s==='false') return false;
    if (s[0]==='[' || s[0]==='{') { try { return JSON.parse(s); } catch (_) { return x; } }
    return x;
  }
  function canonical(value) {
    if (value === null || value === undefined) return 'null';
    if (Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
    if (obj(value)) return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
    return JSON.stringify(value);
  }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }

  function parseCSV(input, delimiter) {
    delimiter = delimiter || ',';
    if (delimiter!==',' && delimiter!=='\t') throw Error('Unsupported delimiter.');
    let s=String(input).replace(/^\uFEFF/,''), rows=[], row=[], field='', quoted=false, closed=false;
    function fieldEnd() { row.push(field); field=''; closed=false; }
    function rowEnd() { fieldEnd(); if (row.some(v=>v!=='')) rows.push(row); row=[]; }
    for (let i=0;i<s.length;i++) {
      const ch=s[i];
      if (quoted) {
        if (ch==='"') {
          if (s[i+1]==='"') { field+='"'; i++; }
          else { quoted=false; closed=true; }
        } else field+=ch;
      } else if (closed) {
        if (ch===delimiter) fieldEnd();
        else if (ch==='\r'||ch==='\n') { if(ch==='\r'&&s[i+1]==='\n')i++; rowEnd(); }
        else if(ch===' ' && delimiter!== '\t') { /* tolerate trailing spaces after quoted field */ }
        else throw Error('Unexpected text after a quoted field near character '+(i+1)+'.');
      } else if (ch==='"') {
        if(field!=='') throw Error('A quote appears inside an unquoted field near character '+(i+1)+'.');
        quoted=true;
      } else if(ch===delimiter) fieldEnd();
      else if(ch==='\r'||ch==='\n') { if(ch==='\r'&&s[i+1]==='\n')i++; rowEnd(); }
      else field+=ch;
    }
    if(quoted) throw Error('The CSV ends inside a quoted field. Re-download the full export.');
    if(field!==''||row.length||closed)rowEnd();
    if(!rows.length)return [];
    const headers=rows.shift().map(h=>h.trim());
    if(headers.some(h=>!h)||new Set(headers).size!==headers.length)throw Error('The export has empty or repeated column names.');
    if(headers.some(h=>['__proto__','prototype','constructor'].includes(h)))throw Error('The export contains an unsupported column name.');
    // Cognition unions columns across runs but leaves earlier rows at their
    // original width when a resumed run introduces this final optional flag.
    // Fill only that absent suffix; never shift fields or pad required data.
    const omittedResumeSuffix=headers.at(-1)==='resume_recovered'&&headers.at(-2)==='completed_at'&&
      ['schema_version','study_id','record_type','response_id'].every(h=>headers.includes(h));
    return rows.map((values,index)=>{
      if(omittedResumeSuffix&&values.length===headers.length-1)values=values.concat('');
      if(values.length!==headers.length)throw Error('Row '+(index+2)+' has '+values.length+' fields; expected '+headers.length+'.');
      const result={}; headers.forEach((key,i)=>result[key]=values[i]); return result;
    });
  }
  function rowsFromJSON(value) {
    if(typeof value==='string') { try{return rowsFromJSON(JSON.parse(value));}catch(_){throw Error('The JSON export does not contain readable trial records.');} }
    if(Array.isArray(value)) {
      if(!value.length)return [];
      if(Array.isArray(value[0])) {
        const headers=value[0];
        if(!headers.every(h=>typeof h==='string') || new Set(headers).size!==headers.length || headers.some(h=>['__proto__','constructor','prototype'].includes(h)))throw Error('The JSON table has invalid column names.');
        return value.slice(1).map((row,index)=>{if(!Array.isArray(row)||row.length!==headers.length)throw Error('JSON table row '+(index+2)+' has the wrong number of fields.');return Object.fromEntries(headers.map((h,i)=>[h,row[i]]));});
      }
      if(!value.every(obj))throw Error('Expected an array of trial objects.');
      return value.map(row=>obj(row.data)&&!own(row,'record_type')?row.data:row);
    }
    if(obj(value)) {
      if(value.truncated===true || value.truncated==='true')throw Error('This is a truncated preview, not a complete export. Upload the dashboard export.');
      if(Array.isArray(value.conditions))throw Error('This is a frozen assignment schedule, not a response export.');
      for(const key of ['data','trials','records','responses'])if(own(value,key))return rowsFromJSON(value[key]);
      if(own(value,'record_type'))return [value];
    }
    throw Error('Unsupported JSON export. Use CSV or JSON trial data from Cognition.');
  }
  function parseDocument(input, filename) {
    const name=String(filename||'').toLowerCase();
    if(name.endsWith('.tsv'))return parseCSV(input,'\t');
    if(name.endsWith('.jsonl')||name.endsWith('.ndjson'))return String(input).replace(/^\uFEFF/,'').split(/\r?\n/).filter(x=>x.trim()).flatMap((line,i)=>{try{return rowsFromJSON(JSON.parse(line));}catch(e){throw Error('JSON line '+(i+1)+': '+e.message);}});
    if(name.endsWith('.json'))return rowsFromJSON(JSON.parse(String(input).replace(/^\uFEFF/,'')));
    if(name.endsWith('.csv')||!name)return parseCSV(input,',');
    throw Error('Unsupported file type. Use CSV, TSV, JSON, or a ZIP containing those exports.');
  }
  function studyMap(catalog) {
    const source=catalog?.studies||catalog||{};
    return Array.isArray(source)?Object.fromEntries(source.map(s=>[s.study_id,s])):source;
  }
  function schedulesOf(catalog) { const s=catalog?.schedules||[];return Array.isArray(s)?s:Object.values(s); }
  function isSchedule(value) {return obj(value)&&Array.isArray(value.conditions)&&typeof value.batch_id==='string'&&typeof value.schedule_id==='string';}
  function allowedRole(cell,study,role) {
    if(study==='question')return role==='primary';
    return cell.comparison_role==='secondary'?role==='secondary':role==='primary'||(role==='end_support'&&cell.allocation_group==='g1'&&cell.primary_version!=='original');
  }
  function validateSchedule(schedule,catalog) {
    const errors=[];const studies=studyMap(catalog),m=studies[schedule?.study_id];
    if(!isSchedule(schedule))return {valid:false,errors:['Not a frozen assignment schedule.']};
    if(schedule.schema_version!==1)errors.push('Unknown schedule schema.');
    if(!m||m.build_id!==schedule.build_id)errors.push('Schedule study or build is unknown.');
    if(!['test','live'].includes(schedule.mode))errors.push('Schedule mode must be test or live.');
    if(![10,12].includes(schedule.target_per_cell))errors.push('Schedule target must be 10 or 12 usable ratings per required cell.');
    if(!schedule.conditions.length||schedule.conditions.length>(schedule.mode==='live'?48:50))errors.push('Schedule has an invalid number of conditions.');
    const slots=new Set(),numbers=new Set();const cells=new Map((m?.cells||[]).map(c=>[c.cell_id,c]));
    for(let i=0;i<schedule.conditions.length;i++) {
      const slot=schedule.conditions[i];
      if(!obj(slot)){errors.push('Schedule contains an invalid condition.');continue;}
      if(!slot.slot_id||slots.has(slot.slot_id)||slot.condition_number!==i+1||numbers.has(slot.condition_number)||typeof slot.list_id!=='string')errors.push('Schedule conditions are not unique and contiguous.');
      slots.add(slot.slot_id);numbers.add(slot.condition_number);
      if(!Array.isArray(slot.assignments)||slot.assignments.length!==m?.trials_per_session){errors.push('A condition has the wrong number of assignments.');continue;}
      const phrases=new Set();
      for(const a of slot.assignments){if(!obj(a)){errors.push('Schedule contains an invalid assignment.');continue;}const c=cells.get(a.cell_id);if(!c){errors.push('Schedule references an unknown cell.');continue;}
        if(phrases.has(c.phrase_id))errors.push('A condition repeats a phrase.');phrases.add(c.phrase_id);
        if(!allowedRole(c,schedule.study_id,a.analysis_role))errors.push('Schedule assigns an invalid analysis role.');
        if(!Array.isArray(a.option_order)||a.option_order.length!==c.options.length||new Set(a.option_order).size!==c.options.length||a.option_order.some(id=>!c.options.some(o=>o.id===id)))errors.push('Schedule answer order is invalid.');
      }
    }
    return {valid:errors.length===0,errors:[...new Set(errors)]};
  }
  async function validateScheduleIntegrity(schedule,catalog) {
    const structural=catalog?validateSchedule(schedule,catalog):{valid:isSchedule(schedule),errors:isSchedule(schedule)?[]:['Not a frozen assignment schedule.']};
    if(!structural.valid)return structural;
    const keys=['schema_version','study_id','build_id','mode','target_per_cell','batch_id','manifest_sha256','allocation_core_sha256','coverage_snapshot_sha256','conditions'];
    if(keys.some(k=>!own(schedule,k)))return {valid:false,errors:['Schedule is missing a frozen generation field.']};
    const body=Object.fromEntries(keys.map(k=>[k,schedule[k]]));
    const bytes=new TextEncoder().encode(JSON.stringify(body));
    let subtle=typeof globalThis!=='undefined'?globalThis.crypto?.subtle:null;
    if(!subtle&&typeof require==='function')subtle=require('node:crypto').webcrypto.subtle;
    if(!subtle)return {valid:false,errors:['This browser cannot verify schedule integrity. Open the HTTPS workbench in a current browser.']};
    const digest=Array.from(new Uint8Array(await subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
    const expected='cg_'+digest.slice(0,24);
    return {valid:schedule.schedule_id===expected,errors:schedule.schedule_id===expected?[]:['The schedule contents do not match its frozen identifier.'],expected_schedule_id:expected};
  }
  function normalizeRows(rawRows,catalog,options) {
    if(!Array.isArray(rawRows))throw Error('Expected trial records.');
    options=options||{};const studies=studyMap(catalog);
    const maps={};for(const [id,m] of Object.entries(studies))if(obj(m)&&Array.isArray(m.cells))maps[id]=new Map(m.cells.map(c=>[c.cell_id,c]));
    const waves=new Map(),badWaves=new Set();
    for(const wave of schedulesOf(catalog)) { if(validateSchedule(wave,catalog).valid)waves.set(wave.schedule_id,wave);else if(wave?.schedule_id)badWaves.add(wave.schedule_id); }
    const issues=[],records=[];
    rawRows.forEach((input,index)=>{
      if(!obj(input)){issues.push({row:index+1,errors:['not_an_object']});return;}
      const raw=clone(input),r={};
      for(const k of ID_FIELDS)r[k]=text(raw[k]);
      for(const k of NUMBER_FIELDS)r[k]=number(raw[k]);
      for(const k of BOOL_FIELDS)r[k]=bool(raw[k]);
      for(const k of TEXT_FIELDS)r[k]=text(raw[k]);
      for(const k of ARRAY_FIELDS){const d=decoded(raw[k]);r[k]=Array.isArray(d)?clone(d):[];}
      r.choice=text(decoded(raw.choice));r.technical_problem=text(decoded(raw.technical_problem));
      r.modality=text(raw.modality);r.source_file=text(options.source_file||raw.source_file)||'';r.source_row=index+1;r.raw=raw;
      r.errors=[];r.warnings=[];r.conflict=false;
      const fail=x=>{if(!r.errors.includes(x))r.errors.push(x);},warn=x=>{if(!r.warnings.includes(x))r.warnings.push(x);};
      const declared=text(raw.mode);
      const testSignal=declared==='test'||declared==='preview'||r.engineering_qa===true||r.analysis_excluded===true||r.participant_data===false;
      r.mode=testSignal?'test':['live','participant'].includes(declared)?'live':'unknown';
      if(r.mode==='test') {
        if(!['test','preview'].includes(declared)||r.engineering_qa!==true||r.analysis_excluded!==true||r.participant_data!==false)fail('inconsistent_test_classification');
      } else if(r.mode==='live') {
        if(r.engineering_qa!==false||r.analysis_excluded!==false||r.participant_data!==true)fail('missing_or_inconsistent_live_flags');
      } else fail('unknown_record_mode');
      const m=studies[r.study_id];const cells=maps[r.study_id];const cell=cells?.get(r.cell_id);
      if(!m||!cells)fail('unknown_study');
      if(m&&r.build_id!==m.build_id)fail('unknown_build');
      if(r.schema_version!==1)fail('unknown_schema');
      if(!r.session_id||!r.participant_id)fail('missing_session_identity');
      if(!r.response_id)fail('missing_response_id');
      else if(r.session_id&&!r.response_id.startsWith(r.session_id+'::'))fail('response_id_session_mismatch');
      if(!RECORD_TYPES.has(r.record_type))fail('unknown_record_type');
      if(r.mode==='live') {
        for(const id of ['PROLIFIC_PID','STUDY_ID','SESSION_ID'])if(!r[id]||!/^[A-Za-z0-9_-]{5,128}$/.test(r[id]))fail('missing_or_invalid_prolific_id');
        if(r.PROLIFIC_PID&&r.PROLIFIC_PID!==r.participant_id)fail('participant_id_mismatch');
      }
      const wave=waves.get(r.schedule_id);let slot=null,assignment=null;
      if(!wave)fail(badWaves.has(r.schedule_id)?'invalid_schedule':'unknown_schedule');
      else {
        if(wave.study_id!==r.study_id||wave.build_id!==r.build_id||wave.batch_id!==r.batch_id||wave.mode!==r.mode)fail('schedule_identity_mismatch');
        slot=wave.conditions.find(s=>s.slot_id===r.slot_id);
        if(!slot)fail('unknown_assignment_slot');
        else if(slot.list_id!==r.list_id||slot.condition_number!==r.assigned_condition_number)fail('assignment_identity_mismatch');
      }
      const main=r.phase==='main'||r.record_type==='study_response';
      if(main){
        if(r.phase!=='main'||r.record_type!=='study_response')fail('inconsistent_main_record_type');
        if(!cell)fail('unknown_cell');
        else {
          for(const k of ['phrase_id','version','gate'])if(r[k]!==cell[k])fail(k+'_mismatch');
          if(r.modality&&r.modality!==cell.modality)fail('modality_mismatch');
          r.modality=cell.modality;
          r.allocation_group=cell.allocation_group||null;r.comparison_role=cell.comparison_role||'primary';r.primary_version=cell.primary_version||cell.version;
          if(!allowedRole(cell,r.study_id,r.analysis_role))fail('invalid_analysis_role');
          if(r.response_id!==r.session_id+'::'+r.cell_id)fail('response_id_cell_mismatch');
          const choiceIds=cell.options.map(o=>o.id);
          if(r.technical_problem){if(typeof decoded(raw.technical_problem)!=='string')fail('invalid_technical_problem');if(r.choice!==null)fail('technical_row_has_choice');}
          else if(!choiceIds.includes(r.choice))fail('invalid_choice');
          if(cell.modality==='audio'&&r.listen_completed!==true&&!r.technical_problem)fail('audio_not_fully_listened');
          const displayed=decoded(raw.displayed_options);
          if(!Array.isArray(displayed)||displayed.length!==cell.options.length||displayed.some((o,i)=>!obj(o)||o.id!==r.option_order[i]||!cell.options.some(expected=>expected.id===o.id&&expected.text===o.text)))fail('displayed_options_mismatch');
          if(cell.audio_sha256&&r.audio_sha256!==cell.audio_sha256)fail('audio_fingerprint_mismatch');
        }
        if(slot){assignment=slot.assignments.find(a=>a.cell_id===r.cell_id);if(!assignment)fail('unassigned_cell');else{if(assignment.analysis_role!==r.analysis_role)fail('assigned_role_mismatch');if(canonical(assignment.option_order)!==canonical(r.option_order))fail('assigned_option_order_mismatch');}}
        if(r.response_ms===null||r.response_ms<0||r.response_ms>86400000)fail('invalid_response_time');
        if(r.response_time_ms!==null&&r.response_ms!==r.response_time_ms)fail('response_time_mismatch');
        if(r.playback_errors.length)warn('playback_error_reported');
        if(r.technical_problem)warn('technical_problem_reported');
      }
      if(r.record_type==='study_complete') {
        if(r.main_response_count!==m?.trials_per_session)fail('completion_count_mismatch');
        if(r.practice_response_count!==m?.practice?.length)fail('practice_count_mismatch');
        if(!r.completed_at)warn('completion_timestamp_missing');
      }
      if(r.record_type==='study_consent'&&(!r.consented_at||!r.consent_version))fail('consent_record_incomplete');
      for(const k of ['started_at','responded_at','completed_at'])if(r[k]&&!Number.isFinite(Date.parse(r[k])))warn('invalid_'+k);
      r.valid=r.errors.length===0;r.invalidReasons=r.errors;
      r.eligible=r.valid&&r.mode==='live'&&r.phase==='main'&&!r.technical_problem;
      r.key=[r.study_id||'unknown',r.session_id||'unknown',r.response_id||('invalid-row-'+index+':'+r.source_file)].join('::');
      r.sources=[{file:r.source_file,row:r.source_row}];
      if(r.errors.length||r.warnings.length)issues.push({key:r.key,row:index+1,file:r.source_file,errors:r.errors.slice(),warnings:r.warnings.slice()});
      records.push(r);
    });
    const counts={rows:records.length,main:records.filter(r=>r.phase==='main').length,live:records.filter(r=>r.mode==='live').length,test:records.filter(r=>r.mode==='test').length,unknown:records.filter(r=>r.mode==='unknown').length,valid:records.filter(r=>r.valid).length,eligible:records.filter(r=>r.eligible).length,invalid:records.filter(r=>!r.valid).length,technical:records.filter(r=>r.phase==='main'&&r.technical_problem).length};
    return {records,issues,counts};
  }
  const SIGNIFICANT = ['study_id','build_id','mode','schema_version','session_id','participant_id','PROLIFIC_PID','STUDY_ID','SESSION_ID','batch_id','schedule_id','slot_id','list_id','assigned_condition_number','response_id','record_type','phase','cell_id','phrase_id','version','gate','modality','analysis_role','choice','technical_problem','listen_completed','first_play_completed','response_ms','option_order','displayed_options','audio_sha256','input_sha256','response_count','main_response_count','practice_response_count','started_at','responded_at','completed_at','consented_at','consent_version','engineering_qa','analysis_excluded','participant_data','headphones_confirmed','volume_confirmed','play_count','complete_listen_count','playback_errors','playback_events'];
  function fingerprint(r) {return canonical(Object.fromEntries(SIGNIFICANT.map(k=>[k,r[k]??null])));}
  function mergeRecords(existing,incoming) {
    const records=[],map=new Map();let duplicates=0;const conflicts=[];
    for(const source of [...(existing||[]),...(incoming||[])]) {
      const r=clone(source),key=r.key||[r.study_id,r.session_id,r.response_id].join('::');r.key=key;
      if(!map.has(key)){map.set(key,r);records.push(r);continue;}
      const prior=map.get(key);const sources=[...(prior.sources||[]),...(r.sources||[])];prior.sources=[...new Map(sources.map(s=>[canonical(s),s])).values()];
      if(fingerprint(prior)===fingerprint(r)&&!r.conflict){duplicates++;continue;}
      prior.conflict=true;prior.valid=false;prior.eligible=false;
      prior.errors=[...new Set([...(prior.errors||[]),'conflicting_duplicate'])];prior.invalidReasons=prior.errors;
      prior.conflict_versions=prior.conflict_versions||[];
      for(const version of [r,...(r.conflict_versions||[])]) {
        if(!prior.conflict_versions.some(v=>fingerprint(v)===fingerprint(version))&&fingerprint(prior)!==fingerprint(version)){
          const copy=clone(version);delete copy.conflict_versions;delete copy.sources;prior.conflict_versions.push(copy);
        }
      }
      if(!conflicts.some(c=>c.key===key))conflicts.push({key,study_id:prior.study_id,session_id:prior.session_id,response_id:prior.response_id,versions:1+prior.conflict_versions.length});
    }
    // Conflicts already present in a saved workspace remain excluded after further imports.
    for(const r of records)if(r.conflict&&!conflicts.some(c=>c.key===r.key))conflicts.push({key:r.key,study_id:r.study_id,session_id:r.session_id,response_id:r.response_id,versions:1+(r.conflict_versions||[]).length});
    return {records,duplicates,conflicts};
  }
  function csvCell(value) {
    let s=value===null||value===undefined?'':typeof value==='object'?JSON.stringify(value):String(value);
    if(/^[=+@\-\t\r]/.test(s))s="'"+s;
    return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;
  }
  function toCSV(rows,headers) {headers=headers||Object.keys(rows[0]||{});return [headers,...rows.map(row=>headers.map(k=>row[k]))].map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';}
  return {parseCSV,parseDocument,rowsFromJSON,normalizeRows,mergeRecords,validateSchedule,validateScheduleIntegrity,isSchedule,canonical,fingerprint,toCSV};
});
