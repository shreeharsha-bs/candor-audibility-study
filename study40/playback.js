(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.Study40Playback=api;})(globalThis,function(){
  'use strict';
  // A completed pass starts at zero, stays at normal speed, and covers the file
  // without seeking. Transient progress is deliberately not restored on reload.
  function attach({media,draft,save=()=>{},onChange=()=>{},onError=()=>{},clock=()=>performance.now(),timestamp=()=>new Date().toISOString()}){
    let valid=false,activeSince=null,elapsed=0,lastPosition=0,lastClock=clock(),resetting=false,destroyed=false;
    const handlers={};
    draft.playback_events=draft.playback_events||[];draft.playback_errors=draft.playback_errors||[];
    draft.play_count=draft.play_count||0;draft.playback_start_count=draft.playback_start_count||0;draft.complete_listen_count=draft.complete_listen_count||0;
    media.controls=false;media.playbackRate=1;media.defaultPlaybackRate=1;
    const notify=()=>{save();onChange();};
    const event=name=>{draft.playback_events.push({event:name,at:timestamp(),audio_time_s:media.currentTime});};
    function invalidate(){valid=false;activeSince=null;elapsed=0;}
    function settle(){if(activeSince!==null){elapsed+=Math.max(0,clock()-activeSince);activeSince=null;}}
    function checkPosition(){
      const position=media.currentTime,at=clock();
      if(!Number.isFinite(position)||position<lastPosition-.05||position-lastPosition>(at-lastClock)/1000+.35||media.playbackRate!==1)valid=false;
      lastPosition=position;lastClock=at;
      draft.max_audio_time_s=Math.max(draft.max_audio_time_s||0,Number.isFinite(position)?position:0);
    }
    function listen(name,fn){handlers[name]=fn;media.addEventListener(name,fn);}
    listen('play',()=>{
      if(destroyed)return;
      const at=clock();
      if(media.currentTime<=.03){valid=true;elapsed=0;draft.playback_start_count++;lastPosition=0;}
      if(media.playbackRate!==1)valid=false;
      activeSince=at;lastClock=at;draft.audio_started=true;draft.play_count++;event('play');notify();
    });
    listen('pause',()=>{checkPosition();settle();event('pause');notify();});
    listen('timeupdate',()=>{checkPosition();notify();});
    listen('seeking',()=>{event('seeking');if(!(resetting&&media.currentTime<=.03))invalidate();notify();});
    listen('seeked',()=>{event('seeked');if(!(resetting&&media.currentTime<=.03))invalidate();resetting=false;lastPosition=media.currentTime;lastClock=clock();notify();});
    listen('ratechange',()=>{if(media.playbackRate!==1){invalidate();media.playbackRate=1;}event('ratechange');notify();});
    listen('waiting',()=>{settle();event('waiting');notify();});
    listen('playing',()=>{if(activeSince===null)activeSince=clock();lastClock=clock();event('playing');notify();});
    listen('stalled',()=>{event('stalled');notify();});
    listen('ended',()=>{
      checkPosition();settle();draft.audio_ended=true;
      const duration=media.duration;
      if(valid&&Number.isFinite(duration)&&duration>0&&lastPosition>=duration-.06&&elapsed/1000>=duration-.15){draft.first_play_completed=true;draft.complete_listen_count++;event('complete_listen');}
      else event('incomplete_listen');
      valid=false;event('ended');notify();
    });
    listen('error',()=>{invalidate();draft.playback_errors.push({at:timestamp(),code:media.error?.code||null});event('error');notify();onError('The audio could not play. Try Play again or report a technical problem.');});
    async function startPlayback(){
      if(destroyed)return;
      try{await media.play();}catch(error){if(destroyed)return;invalidate();draft.playback_errors.push({at:timestamp(),code:'play_rejected',message:String(error?.name||'Playback error')});event('play_rejected');notify();onError('Playback did not start. Try Play again or report a technical problem.');}
    }
    async function play(){if(media.ended)return replay();return startPlayback();}
    async function replay(){
      media.pause();invalidate();resetting=media.currentTime!==0;media.currentTime=0;lastPosition=0;lastClock=clock();event('replay');
      await startPlayback();
    }
    return {play,pause:()=>media.pause(),replay,destroy(){destroyed=true;for(const [name,fn]of Object.entries(handlers))media.removeEventListener(name,fn);}};
  }
  return {attach};
});
