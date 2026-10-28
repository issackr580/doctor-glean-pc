import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {setTimeout as later} from 'node:timers/promises';
import {boundedWork} from '../src/async-work.js';

test('already-cancelled work still observes immediate and delayed operation failures',()=>{
 const result=spawnSync(process.execPath,['--unhandled-rejections=strict','--input-type=module','-e',`
  import {boundedWork} from ${JSON.stringify(new URL('../src/async-work.js',import.meta.url).href)};
  import {setTimeout as later} from 'node:timers/promises';
  for(const delayed of [false,true]){
   const controller=new AbortController();controller.abort();
   const work=delayed?later(5).then(()=>{throw Error('synthetic late load failure');}):Promise.reject(Error('synthetic failed load'));
   const result=await boundedWork(work,controller.signal,100).catch(error=>error.code);
   if(result!=='cancelled')throw Error('wrong_result');
  }
  await later(20);console.log('NO_UNHANDLED_REJECTION');
 `],{encoding:'utf8'});
 assert.ifError(result.error);assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/NO_UNHANDLED_REJECTION/);
});
test('cancellation wins while a late rejected load is consumed',async()=>{
 const controller=new AbortController();let reject;
 const result=boundedWork(new Promise((_,fail)=>{reject=fail;}),controller.signal,100);
 controller.abort();await assert.rejects(result,{code:'cancelled'});reject(Error('synthetic destroyed window'));await later(5);
});
test('a deadline also observes the later operation failure',async()=>{
 let reject;const result=boundedWork(new Promise((_,fail)=>{reject=fail;}),new AbortController().signal,5);
 await assert.rejects(result,{code:'time_limit'});reject(Error('synthetic late network failure'));await later(5);
});
test('normal completion and mapped network errors retain their result',async()=>{
 const signal=new AbortController().signal;
 assert.equal(await boundedWork(Promise.resolve('ready'),signal,100),'ready');
 const error=Object.assign(Error('synthetic private path'),{errno:-105});
 await assert.rejects(boundedWork(Promise.reject(error),signal,100,(code,cause)=>Object.assign(Error(),{code,number:cause?.errno})),{code:'network_error',number:-105});
});
