import test from 'node:test';import assert from 'node:assert/strict';import {CatalogQueue} from '../src/catalog-queue.js';
test('finishing another login cannot interrupt an active site query',async()=>{
 let busy=true;const calls=[];const q=new CatalogQueue({busy:()=>busy,start:async(day,ids)=>{calls.push(ids);},validDate:()=>true});
 q.request('2026-10-26',['doctorville']);q.request('2026-10-26',['whodadoc']);q.request('2026-10-26',['whodadoc']);
 assert.equal(calls.length,0);assert.equal(q.snapshot().length,2);busy=false;q.pump();await new Promise(r=>setImmediate(r));
 assert.deepEqual(calls,[['doctorville','whodadoc']]);assert.equal(q.snapshot().length,0);
});
test('stop and date invalidation remove queued work before it runs',()=>{
 let busy=true;let valid=true;let calls=0;const q=new CatalogQueue({busy:()=>busy,start:()=>{calls++;},validDate:()=>valid});
 q.request('2026-10-26',['doctorville']);valid=false;busy=false;q.pump();assert.equal(calls,0);
 valid=true;busy=true;q.request('2026-10-26',['doctorville']);q.clear();busy=false;q.pump();assert.equal(calls,0);
});
test('a rejected catalog launch resumes only the read batch unless ownership changed',async()=>{
 for(const cancelled of [false,true]){
  let reject;const calls=[];
  const q=new CatalogQueue({validDate:()=>true,busy:()=>false,start:async(day,ids)=>{calls.push([day,...ids]);if(calls.length===1)await new Promise((_,r)=>reject=r);}});
  q.request('2026-11-18',['docple']);if(cancelled)q.clear();reject(Error('collection_busy'));
  await new Promise(r=>setImmediate(r));q.pump();q.close();
  assert.equal(calls.length,cancelled?1:2);if(!cancelled)assert.deepEqual(calls[1],calls[0]);
 }
});
test('revoking automatic selection preserves queued manual reads and drops late automatic retries',async()=>{
 let busy=true,reject;const calls=[];
 const q=new CatalogQueue({validDate:()=>true,busy:()=>busy,start:async(_day,ids)=>{calls.push(ids);if(calls.length===1)await new Promise((_,r)=>reject=r);}});
 q.request('2026-11-18',['hmp'],{automatic:true});q.request('2026-11-18',['docple']);busy=false;q.pump();q.invalidateAutomatic();reject(Error('collection_busy'));
 await new Promise(r=>setImmediate(r));q.pump();q.close();assert.deepEqual(calls,[['hmp','docple'],['docple']]);
});
test('automatic duplicates share a running or fresh scoped result, manual refresh and changed profiles proceed',async()=>{
 let now=0,scope=0,complete,result=true;const calls=[];
 const q=new CatalogQueue({context:()=>scope,resultValid:()=>result,now:()=>now,validDate:()=>true,busy:()=>false,start:async(date,ids)=>{calls.push([date,ids]);await new Promise(r=>complete=r);}});
 const ask=(automatic=true)=>q.request('2026-11-20',['docple'],{automatic});
 const settle=async()=>{complete();await new Promise(r=>setImmediate(r));};
 ask();ask();assert.equal(q.snapshot().length,0);await settle();ask();assert.equal(calls.length,1);
 ask(false);await settle();scope++;ask();await settle();result=false;ask();await settle();
 result=true;now+=60000;ask();await settle();assert.equal(calls.length,5);q.close();
});
