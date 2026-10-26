import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LocalState} from '../src/local-state.js';
import {kstInstant} from '../src/schedule.js';

function setup(t){
  const dir=mkdtempSync(join(tmpdir(),'doctor-glean-pc-test-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const file=join(dir,'state.json'); return {file,store:new LocalState(file)};
}
const now=kstInstant('2026-10-26','18:00');
const input={site:'hmp',kind:'entry',date:'2026-10-26',target:'a'.repeat(64),slot:0,dueAt:now,deadline:now+60_000};

test('automation starts paused and needs a durable opt-in',t=>{
  const {file,store}=setup(t);
  assert.equal(store.snapshot().paused,true);
  assert.equal(store.reserve(input,now),null);
  store.setPaused(false);
  assert.equal(JSON.parse(readFileSync(file,'utf8')).paused,false);
  assert.ok(store.reserve(input,now));
});

test('attempt is on disk before dispatch and survives restart as unknown',t=>{
  const {file,store}=setup(t);store.setPaused(false);
  const ticket=store.reserve(input,now);
  assert.equal(JSON.parse(readFileSync(file,'utf8')).jobs[ticket.key].state,'reserved');
  const restarted=new LocalState(file);
  assert.equal(restarted.snapshot().jobs[ticket.key].state,'unknown');
  assert.equal(restarted.reserve(input,now),null);
});

test('five Hanmi slots are distinct but repeating the same slot is denied',t=>{
  const {store}=setup(t);store.setPaused(false);
  const first=store.reserve(input,now);
  assert.ok(first);assert.equal(store.reserve(input,now),null);
  assert.ok(store.reserve({...input,slot:1,dueAt:now+600_000,deadline:now+660_000},now+600_000));
});

test('different lectures may share a time but correcting a time cannot repeat one attempt',t=>{
  const {store}=setup(t);store.setPaused(false);
  assert.ok(store.reserve(input,now));
  assert.ok(store.reserve({...input,target:'b'.repeat(64)},now));
  assert.equal(store.reserve({...input,dueAt:now+1000},now+1000),null);
});

test('a persisted pause prevents dispatch from a previously reserved callback',t=>{
  const {store}=setup(t);store.setPaused(false);
  const ticket=store.reserve(input,now);
  store.setPaused(true);
  assert.equal(store.beginDispatch(ticket,now),false);
  store.setPaused(false);
  assert.equal(store.beginDispatch(ticket,now),false);
  assert.equal(store.reserve(input,now),null);
});

test('a reserved dispatch may receive its verified result after pause',t=>{
  const {store}=setup(t);store.setPaused(false);
  const ticket=store.reserve(input,now);
  assert.equal(store.beginDispatch(ticket,now),true);
  store.setPaused(true);
  assert.equal(store.finish(ticket,'confirmed',now+1000),true);
  assert.equal(store.snapshot().jobs[ticket.key].state,'confirmed');
});

test('storage failure gives no execution ticket and leaves the gate closed',t=>{
  const {file}=setup(t);
  const store=new LocalState(file,{commit:()=>{throw Error('disk failure');}});
  assert.throws(()=>store.setPaused(false));
  assert.equal(store.snapshot().paused,true);
  assert.equal(store.reserve(input,now),null);
});

test('failed attempt persistence must not reach a website action',t=>{
  const {file,store}=setup(t);store.setPaused(false);
  const failing=new LocalState(file,{commit:()=>{throw Error('disk failure');}});
  assert.throws(()=>failing.reserve(input,now));
  assert.equal(failing.snapshot().paused,true);
  assert.deepEqual(failing.snapshot().jobs,{});
});

test('broken or unrecognised state never silently erases old attempts',t=>{
  const {file}=setup(t);
  for(const raw of ['{broken','{}','{"schemaVersion":2,"paused":false,"epoch":0,"jobs":{}}']){
    writeFileSync(file,raw);
    assert.throws(()=>new LocalState(file),/state_unavailable/);
    assert.equal(readFileSync(file,'utf8'),raw);
  }
});

test('untrusted metadata and expired actions are rejected',t=>{
  const {store}=setup(t);store.setPaused(false);
  for(const bad of [
    {...input,site:'evil'}, {...input,kind:'shell'}, {...input,slot:-1},
    {...input,url:'https://evil.test'}, {...input,date:'2026-10-25'},
  ]) assert.equal(store.reserve(bad,now),null);
  assert.equal(store.reserve(input,now+61_000),null);
  assert.deepEqual(store.snapshot().jobs,{});
});

test('ordinary state stores no account, URL, cookie or arbitrary page result',t=>{
  const {file,store}=setup(t);store.setPaused(false);
  const ticket=store.reserve(input,now);store.beginDispatch(ticket,now);
  assert.equal(store.finish(ticket,'<html>secret</html>',now+100),false);
  assert.equal(store.finish(ticket,'unknown',now+100),true);
  assert.doesNotMatch(readFileSync(file,'utf8'),/https?:|password|cookie|<html>/i);
});
