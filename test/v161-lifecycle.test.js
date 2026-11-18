import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {MorningSchedule} from '../src/morning-schedule.js';
import {kstInstant} from '../src/schedule.js';
import {UsageMeter} from '../src/resource-use.js';
import {CatalogStore} from '../src/catalog-store.js';
import {verifyHandoffInputs} from '../scripts/v161-inputs.mjs';
const temp=t=>{const root=mkdtempSync(join(tmpdir(),'dg161-'));t.after(()=>rmSync(root,{recursive:true,force:true}));return join(root,'state');};
test('morning slot survives restart, keeps earlier valid due and closes at 08:40 KST',t=>{
 const file=temp(t),date='2026-11-18',at=s=>kstInstant(date,s),s=new MorningSchedule(file),first=s.next(at('06:00'));
 assert.ok(first>=at('08:10')&&first<=at('08:12'));assert.equal(new MorningSchedule(file).next(at('08:25')),first);
 const saved=JSON.parse(readFileSync(file));saved.at=at('08:10');writeFileSync(file,JSON.stringify(saved));assert.equal(new MorningSchedule(file).next(at('07:00')),saved.at);
 assert.ok(s.next(at('08:40'))>=kstInstant('2026-11-19','08:10'));
});
test('usage requires opt in, expires across restart and only exports bounded counters',t=>{
 const file=temp(t);let now=10000;const m=new UsageMeter(file,()=>now);
 m.count('apiRequests',1);assert.equal(m.view().apiRequests,0);assert.equal(m.change('start'),true);
 m.count('apiRequests',1);m.count('SECRET_SYNTHETIC',10);m.count('domReads','SECRET_SYNTHETIC');m.save();
 now+=7*86400000;const restart=new UsageMeter(file,()=>now);restart.count('apiRequests',2);
 assert.equal(restart.view().enabled,false);assert.equal(restart.view().apiRequests,1);assert.ok(!JSON.stringify(restart.view()).includes('SECRET'));
 assert.equal(restart.change('delete'),true);assert.equal(new UsageMeter(file).view().apiRequests,0);
});
test('last Dtalks failure evidence survives a successful read and restart',t=>{
 const file=temp(t),date='2026-11-18',store=new CatalogStore(file);
 store.record('dtalks',date,{status:'review',reason:'network_error',events:[],diagnostics:{failure:'offline'}},1);
 store.record('dtalks',date,{status:'ok',coverage:true,events:[]},2);
 const [result]=new CatalogStore(file).diagnostics(date);assert.equal(result.status,'ok');assert.equal(result.lastFailure.reason,'network_error');assert.equal(result.lastFailure.inspection.failure,'offline');
});
test('candidate gate rejects a missing or changed handoff fixture',()=>{
 assert.equal(verifyHandoffInputs(),4);
 assert.throws(()=>verifyHandoffInputs(()=>{throw Error('missing_fixture');}));
 assert.throws(()=>verifyHandoffInputs(()=>Buffer.from('earlier candidate')));
});
