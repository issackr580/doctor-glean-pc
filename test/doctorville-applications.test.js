import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DoctorvilleApplicationNotices} from '../src/doctorville-applications.js';
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

test('registration notices are durable per official ID and ignore past, stale and conflicting rows',t=>{
 const file=join(directory(t),'notices.json'),notices=new DoctorvilleApplicationNotices(file);
 const old={...lecture('2'),time:'12:00'};
 const eligible=collection([lecture('1'),old,lecture('3','registered'),lecture('4'),{...lecture('4','closed'),time:'19:00'}]);
 assert.deepEqual(notices.accept({...eligible,stale:true},now),[]);
 assert.deepEqual(notices.accept({...eligible,reason:'site_wait'},now),[]);
 assert.deepEqual(notices.accept(eligible,now).map(event=>event.lectureIdentity.id),['1']);
 const repeat=collection([{...lecture('1'),title:'제목 변경',time:'18:10'},lecture('5')]);
 assert.deepEqual(new DoctorvilleApplicationNotices(file).accept(repeat,now).map(event=>event.lectureIdentity.id),['5']);
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
