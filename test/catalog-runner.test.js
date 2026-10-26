import test from 'node:test';
import assert from 'node:assert/strict';
import {CatalogRunner} from '../src/catalog-runner.js';
import {kstInstant} from '../src/schedule.js';
const date='2026-10-26',now=kstInstant(date,'12:00');
function setup(replies,{manual=()=>false}={}){
 const saved=[],calls=[],changes=[],states=[];
 const store={record:(site,day,row)=>{saved.push({site,day,...row});return row;}};
 const runner=new CatalogRunner({store,now:()=>now,isManualOpen:manual,onChange:v=>changes.push(v),sleep:async()=>{},createPage:async profile=>({
  open:async()=>calls.push('open:'+profile.id),
  read:async(_date,previous)=>{states.push(previous);const next=replies.shift();return typeof next==='function'?await next():next;},
  act:async action=>{calls.push(action.kind);return true;},close:()=>calls.push('close:'+profile.id),
 })});
 return {runner,saved,calls,changes,states};
}
test('catalog runs selected sites sequentially and closes every owned reader',async()=>{
 const s=setup([{status:'ok',done:true,coverage:true,events:[]},{status:'login',done:true,events:[]}]);
 await s.runner.start(date,['doctorville','keymedi']);
 assert.deepEqual(s.calls,['open:doctorville','close:doctorville','open:keymedi','close:keymedi']);assert.equal(s.saved.length,2);
 assert.equal(s.runner.snapshot().running,false);
});
test('manual login window is left untouched and its site is skipped',async()=>{
 const s=setup([],{manual:()=>true});await s.runner.start(date,['doctorville']);
 assert.deepEqual(s.calls,[]);assert.equal(s.saved[0].reason,'manual_view_open');
});
test('cancelling a slow read ignores its late reply and never executes its action',async()=>{
 let deliver;const late=new Promise(resolve=>{deliver=resolve;});
 const s=setup([()=>late]);const finished=s.runner.start(date,['doctorville']);
 await new Promise(resolve=>setImmediate(resolve));s.runner.cancel();
 deliver({status:'loading',events:[],state:{},action:{kind:'click'}});await finished;
 assert.ok(!s.calls.includes('click'));assert.equal(s.saved.at(-1).reason,'cancelled');
});
test('crawler state survives a planned navigation before the next read',async()=>{
 const s=setup([{status:'loading',events:[],state:{pages:1},action:{kind:'navigate',url:'https://www.doctorville.co.kr/seminar/main?page=2'}},{status:'ok',done:true,coverage:true,events:[]}]);
 await s.runner.start(date,['doctorville']);assert.ok(s.calls.includes('navigate'));assert.equal(s.saved.length,1);assert.deepEqual(s.states[1],{pages:1});
});
test('failed action terminates as incomplete without another action',async()=>{
 const s=setup([{status:'loading',events:[],state:{},action:{kind:'click'}}]);
 s.runner.createPage=async()=>({open:async()=>{},read:async()=>({status:'loading',events:[],state:{},action:{kind:'click'}}),act:async()=>false,close(){}});
 await s.runner.start(date,['doctorville']);assert.equal(s.saved.at(-1).reason,'action_rejected');
});
test('query date and selected IDs are validated before creating a browser',async()=>{
 const s=setup([]);await assert.rejects(()=>s.runner.start('2026-02-30',['doctorville']));
 await assert.rejects(()=>s.runner.start('2026-10-25',['doctorville']));
 await assert.rejects(()=>s.runner.start(date,['__proto__']));assert.deepEqual(s.calls,[]);
});

test('a newer collection cannot be overwritten by a cancelled older reply',async()=>{
 let deliver;const late=new Promise(resolve=>{deliver=resolve;});
 const s=setup([()=>late,{status:'ok',done:true,coverage:true,events:[]}]);
 const old=s.runner.start(date,['doctorville']);await new Promise(resolve=>setImmediate(resolve));s.runner.cancel();
 await s.runner.start(date,['doctorville']);const before=s.saved.length;
 deliver({status:'error',done:true,events:[]});await old;
 assert.equal(s.saved.length,before);assert.equal(s.saved.at(-1).status,'ok');assert.equal(s.runner.snapshot().reason,'finished');
});

test('the Korean day changing during a read prevents accepting its late result',async()=>{
 const s=setup([()=>{s.runner.now=()=>now+86_400_000;return {status:'ok',done:true,coverage:true,events:[]};}]);
 await s.runner.start(date,['doctorville','keymedi']);
 assert.ok(!s.calls.includes('open:keymedi'));assert.equal(s.saved[0].reason,'date_mismatch');
});

test('partial rows survive a loading transition followed by an execution error',async()=>{
 const event={site:'doctorville',date,time:'13:00',title:'새로 읽은 강의'};
 const s=setup([{status:'loading',events:[event],state:{}},{status:'loading',events:[],state:{},action:{kind:'click'}}]);
 let reads=0;s.runner.createPage=async()=>({open:async()=>{},read:async()=>++reads===1?{status:'loading',events:[event],state:{}}:{status:'loading',events:[],state:{},action:{kind:'click'}},act:async()=>false,close(){}});
 await s.runner.start(date,['doctorville']);assert.equal(s.saved.at(-1).events[0].title,event.title);assert.equal(s.saved.at(-1).reason,'action_rejected');
});

test('login recovery closes the expired page and restarts its query once',async()=>{const s=setup([{status:'login',done:true,events:[]},{status:'ok',done:true,coverage:true,events:[]}]);let recovery=0;s.runner.recoverLogin=async()=>{recovery++;return true;};await s.runner.start(date,['doctorville']);assert.equal(recovery,1);assert.deepEqual(s.calls,['open:doctorville','close:doctorville','open:doctorville','close:doctorville']);assert.equal(s.saved.at(-1).status,'ok');});
test('a second login failure does not request another automatic recovery',async()=>{const s=setup([{status:'login',done:true,events:[]},{status:'login',done:true,events:[]}]);let recovery=0;s.runner.recoverLogin=async()=>{recovery++;return true;};await s.runner.start(date,['doctorville']);assert.equal(recovery,1);assert.equal(s.saved.at(-1).status,'login');});
test('native network failures retain only a fixed failure code',async()=>{const s=setup([]);s.runner.createPage=async()=>({open:async()=>{throw Object.assign(Error('private error text'),{code:'network_error',failure:'dns_error'});},close(){}});await s.runner.start(date,['doctorville']);assert.equal(s.saved[0].diagnostics.failure,'dns_error');assert.doesNotMatch(JSON.stringify(s.saved),/private error/);});
