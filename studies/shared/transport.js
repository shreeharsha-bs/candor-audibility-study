(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StudyTransport=api;})(globalThis,function(){
  'use strict';
  function requestId(){
    if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
    if(globalThis.crypto?.getRandomValues){const bytes=new Uint8Array(24);globalThis.crypto.getRandomValues(bytes);return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');}
    throw Error('This browser cannot create a secure study session. Please use a current browser and the HTTPS study link.');
  }
  function validEndpoint(value){try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='script.google.com'&&/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(u.pathname);}catch(_){return false;}}
  function validCompletionUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='app.prolific.com'&&u.pathname==='/submissions/complete'&&Boolean(u.searchParams.get('cc')?.trim())&&!/[{}]/.test(u.searchParams.get('cc'));}catch(_){return false;}}
  async function request(endpoint,payload,{fetcher=globalThis.fetch,timeoutMs=45000}={}){
    if(!validEndpoint(endpoint))throw Error('The response store is not configured correctly. Please contact the researcher.');
    const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),timeoutMs);
    try{
      // text/plain is a CORS-safelisted request. Never use no-cors: an opaque
      // response cannot establish that an answer reached the spreadsheet.
      const response=await fetcher(endpoint,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload),redirect:'follow',credentials:'omit',cache:'no-store',signal:abort.signal});
      if(!response.ok)throw Error('The response store could not be reached. Please try again.');
      let result;try{result=await response.json();}catch(_){throw Error('The response store did not confirm a save. Please try again.');}
      if(result?.ok!==true){const error=new Error(result?.message||result?.error?.message||'The response store did not confirm this request. Please try again.');error.code=result?.code||null;error.retryable=result?.retryable!==false;throw error;}
      return result;
    }catch(error){if(error.name==='AbortError')throw Error('Saving took too long. Your answer is kept on this device. Please try again.');throw error;}finally{clearTimeout(timer);}
  }
  function createBatchSaver({getState,commit,send,makeRequestId=requestId,accept,clock=Date.now,random=Math.random,setTimer=setTimeout,clearTimer=clearTimeout,onChange=()=>{},batchSize=5,flushAfterMs=15000,retryDelaysMs=[2000,5000,10000,20000,40000],onAcknowledged=()=>{}}){
    let flight=null,timer=null,forceDrain=false,failures=0,lastError=null,paused=false,stopped=false;
    const count=()=>getState().outbox?.length||0;
    function status(){return {queued:count(),saved:getState().responses.length,saving:!!flight,error:lastError,paused};}
    function notify(){onChange(status());}
    function cancelTimer(){if(timer!==null){clearTimer(timer);timer=null;}}
    function schedule(){
      cancelTimer();if(stopped||flight||paused||!count())return;
      const first=getState().outbox[0],queuedAt=Number(first.local_created_at_ms)||clock(),delay=Math.max(0,flushAfterMs-(clock()-queuedAt));
      timer=setTimer(()=>{timer=null;launch().catch(()=>{});},delay);
    }
    function launch({all=false,manual=false}={}){
      if(all)forceDrain=true;
      if(manual){failures=0;paused=false;lastError=null;}
      if(flight)return flight;
      if(stopped)return Promise.reject(Error('Saving has stopped. Please reload to resume.'));
      if(paused)return Promise.reject(lastError||Error('Please retry saving.'));
      if(!count()&&!getState().pending_batch){forceDrain=false;notify();return Promise.resolve();}
      cancelTimer();
      flight=Promise.resolve().then(async()=>{
        do{
          if(!getState().pending_batch){
            if(!count())break;
            const batch={request_id:makeRequestId(),responses:JSON.parse(JSON.stringify(getState().outbox.slice(0,batchSize)))};
            commit(s=>{s.pending_batch=batch;});
          }
          const batch=JSON.parse(JSON.stringify(getState().pending_batch));
          const ack=await send(batch);
          commit(s=>accept(s,batch,ack));
          onAcknowledged();notify();
          if(getState().pending_batch){const e=Error('Some answers have not yet been confirmed. They are kept on this device and will be retried.');e.code='PARTIAL_ACK';e.retryable=true;throw e;}
          failures=0;lastError=null;
        }while(forceDrain||count()>=batchSize);
        forceDrain=false;
      }).catch(e=>{lastError=e;failures++;paused=e.retryable===false||failures>retryDelaysMs.length;throw e;}).finally(()=>{
        flight=null;notify();
        if(stopped)return;
        if(lastError&&!paused){cancelTimer();const delay=retryDelaysMs[Math.min(failures-1,retryDelaysMs.length-1)]*(.75+.5*random());timer=setTimer(()=>{timer=null;launch().catch(()=>{});},delay);}
        else if(!lastError)schedule();
      });
      notify();return flight;
    }
    function kick(){notify();if(stopped||paused||lastError)return;if(flight)return;if(getState().pending_batch||count()>=batchSize)launch().catch(()=>{});else schedule();}
    return {kick,flush:()=>launch({all:true}),flushAll:()=>launch({all:true,manual:true}),retry:()=>launch({all:true,manual:true}),status,stop(){stopped=true;cancelTimer();}};
  }
  return {request,requestId,validEndpoint,validCompletionUrl,createBatchSaver};
});
