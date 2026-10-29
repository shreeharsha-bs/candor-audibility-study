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
      if(result?.ok!==true){const error=new Error(result?.message||result?.error||'The response store did not confirm this request. Please try again.');error.code=result?.code||null;throw error;}
      return result;
    }catch(error){if(error.name==='AbortError')throw Error('Saving took too long. Your answer is kept on this device. Please try again.');throw error;}finally{clearTimeout(timer);}
  }
  return {request,requestId,validEndpoint,validCompletionUrl};
});
