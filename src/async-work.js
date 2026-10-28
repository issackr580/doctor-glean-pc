export function waitFor(ms,signal){return new Promise(resolve=>{
 if(signal?.aborted){resolve();return;}const done=()=>{clearTimeout(timer);signal?.removeEventListener('abort',done);resolve();};const timer=setTimeout(done,ms);signal?.addEventListener('abort',done,{once:true});
});}

// Observe the underlying operation even when cancellation has already won.
// Destroying an Electron window may reject its load/evaluation afterwards.
export function boundedWork(promise,signal,ms,mapError=code=>Object.assign(Error(code),{code})){
 return new Promise((resolve,reject)=>{
  let finished=false;
  const finish=(fn,value)=>{if(finished)return;finished=true;clearTimeout(timer);signal.removeEventListener('abort',abort);fn(value);};
  const abort=()=>finish(reject,mapError('cancelled'));
  const timer=setTimeout(()=>finish(reject,mapError('time_limit')),ms);
  Promise.resolve(promise).then(value=>finish(resolve,value),error=>finish(reject,mapError('network_error',error)));
  signal.addEventListener('abort',abort,{once:true});
  if(signal.aborted)abort();
 });
}
