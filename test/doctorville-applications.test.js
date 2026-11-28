import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DoctorvilleApplicationNotices,DoctorvilleApplicationRefresh,doctorvilleApplicationPageSignature,doctorvilleApplicationTargets} from '../src/doctorville-applications.js';
import {sanitiseResult} from '../src/catalog-store.js';
import {EntryRunner} from '../src/entry-runner.js';
import {LocalState} from '../src/local-state.js';
import {WorkflowStore} from '../src/workflow-store.js';
import {kstInstant} from '../src/schedule.js';

const date='2026-11-28',now=kstInstant(date,'13:20');
const lecture=(id,registrationStatus='not_registered')=>({site:'doctorville',date,time:'18:00',title:'합성 강의',url:'https://www.doctorville.co.kr/seminar/seminarDetail?seminarId='+id,registrationStatus});
const collection=(events,extra={})=>sanitiseResult('doctorville',date,{status:'ok',events,...extra},now);
function directory(t){
 const path=mkdtempSync(join(tmpdir(),'pc-application-test-'));
 t.after(()=>rmSync(path,{recursive:true,force:true}));
 return path;
}

test('registration notices are durable per official ID and ignore same-day, registered and conflicting rows',t=>{
 const file=join(directory(t),'notices.json'),notices=new DoctorvilleApplicationNotices(file);
 const future=(id,status)=>({...lecture(id,status),date:'2026-12-15'});
 const eligible=doctorvilleApplicationTargets([future('1'),lecture('2'),future('3','registered'),future('4'),future('4','closed')],now);
 assert.deepEqual(notices.accept(eligible,now).map(event=>event.id),['1']);
 const repeat=doctorvilleApplicationTargets([{...future('1'),title:'제목 변경',time:'18:10'},future('5')],now);
 assert.deepEqual(new DoctorvilleApplicationNotices(file).accept(repeat,now).map(event=>event.id),['5']);
});

test('a recent complete scan permits reuse only after enough unchanged pages to cross the selected date',()=>{
 const refresh=new DoctorvilleApplicationRefresh();
 const first=[lecture('1'),{...lecture('2'),date:'2026-11-29'}],second=[{...lecture('3'),date:'2026-12-02'}];
 const continuation='next 2';
 const sign=doctorvilleApplicationPageSignature;
 const front=sign(first,continuation),next=sign(second,'next 3');
 const input={owner:'account:0',now,date,signatures:[front]};
 const pages=[first,second,[{...lecture('4'),date:'2026-12-03'}]];
 const saved={...input,signatures:[front,next],pages,complete:true};
 assert.ok(front&&next);
 assert.ok(!refresh.reuse(input));
 refresh.finish(saved);
 assert.equal(refresh.reuse({...input,now:now+1000}),'after_target_date');
 for(const change of [
  {date:'2026-11-29'}, {forced:true}, {owner:'account:1'}, {now:now+3*60*60*1000}, {now:now-1},
  {now:kstInstant('2026-11-29','00:00')},
  {signatures:[sign([{...first[0],registrationStatus:'registered'},first[1]],continuation)]},
  {signatures:[sign(first,'next 3')]},
 ])assert.ok(!refresh.reuse({...input,...change}));
 assert.ok(refresh.reuse({...input,date:'2026-11-29',signatures:[front,next]}));
 assert.ok(!refresh.reuse({...input,date:'2026-11-29',signatures:[front,'changed']}));
 refresh.finish({...saved,pages:[first,[{...second[0],date}]]});
 assert.ok(!refresh.reuse(input),'an older date on the next page disables reuse');
 refresh.finish({...saved,pages:[first,[...first,...second]]});
 assert.ok(refresh.reuse(input),'load more can repeat earlier unchanged rows');
 const descending=[second,[...first].reverse()];
 const descendingSignatures=[sign(second,continuation)];
 refresh.finish({...saved,pages:descending,signatures:descendingSignatures});
 assert.equal(refresh.reuse({...input,date:'2026-12-04',signatures:descendingSignatures}),'past_target_date');
 refresh.finish({...saved,complete:false});
 assert.ok(!refresh.reuse(input));
});

test('Doctorville waits for confirmed registration on a known unregistered lecture without opening a page',async t=>{
 const path=directory(t),ledger=new LocalState(join(path,'ledger.json')),store=new WorkflowStore(join(path,'workflow.json'),{now:()=>now});
 ledger.setPaused(false);store.setFeature('entry',true);
 const runner=new EntryRunner({ledger,store,now:()=>now,createPage:async()=>assert.fail('unregistered page created')});
 runner.reserveCatalog(date,{doctorville:collection([lecture('1')])});
 const job=store.entries()[0];
 assert.equal(job.status,'not_registered');
 assert.equal(runner.revisionDue(),null);
 assert.equal(runner.due(),null);
 assert.equal(await runner.run(job),false);
 assert.deepEqual(ledger.snapshot().jobs,{});
 runner.reserveCatalog(date,{doctorville:collection([lecture('1','registered')])});
 assert.equal(store.entries()[0].key,job.key);
 assert.equal(store.entries()[0].status,'reserved');
});
