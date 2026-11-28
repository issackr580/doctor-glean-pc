import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DoctorvilleApplicationNotices,doctorvilleApplicationTargets} from '../src/doctorville-applications.js';
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
