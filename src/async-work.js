export function waitFor(ms,signal){return new Promise(resolve=>{
 if(signal?.aborted){resolve();return;}const done=()=>{clearTimeout(timer);signal?.removeEventListener('abort',done);resolve();};const timer=setTimeout(done,ms);signal?.addEventListener('abort',done,{once:true});
});}
