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
