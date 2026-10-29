import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DeveloperJournal} from '../editions/developer/developer-journal.js';
import {entryEvidence,focusReport,entryRecords,entryMeta} from '../editions/developer/entry-report.js';
import {createDeveloperTools} from '../editions/developer/developer-tools.js';
const now=Date.parse('2026-10-28T18:00:00+09:00'),job={key:'a'.repeat(64),site:'medigate',date:'2026-10-28',time:'18:00',slot:0,due:now-1000,deadline:now+90000};
function fixture(t,options){const dir=mkdtempSync(join(tmpdir(),'pc-entry-journal-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));return {dir,journal:new DeveloperJournal(join(dir,'journal.json'),options)};}
test('a reservation observation cannot backfill a work start or historical build',t=>{
 const {journal}=fixture(t);journal.setEnabled(true,now);journal.entry(job,'entry','reservation_observed',{status:'reserved'},now+1);
 const record=journal.export(now+2).entryJournal.records[0];assert.equal(record.events.length,1);assert.equal(record.events[0].stage,'reservation_observed');assert.equal(record.events[0].appVersion,undefined);assert.equal(entryEvidence(record).attemptRecorded,false);
});
test('strict entry output omits raw strings, internal references and coerced values',t=>{
 assert.equal(entryMeta({...job,date:[job.date]}),null);assert.equal(entryMeta({...job,time:[job.time]}),null);
 const {journal}=fixture(t);journal.setEnabled(true,now);journal.entry(job,'entry','inspect',{status:'PRIVATE',reason:'https://PRIVATE',attempted:'false',entryControls:'2',candidateCards:4,password:'PRIVATE',html:'<PRIVATE>',url:'https://PRIVATE',owner:'b'.repeat(32)},now+1);
 const output=JSON.stringify(journal.export(now+2)),row=journal.export(now+2).entryJournal.records[0].events[0];assert.equal(row.status,'unknown');assert.equal(row.reason,'unknown');assert.equal(row.attempted,undefined);assert.equal(row.entryControls,undefined);assert.equal(row.candidateCards,4);assert.doesNotMatch(output,/PRIVATE|reference|owner|password|html|https:/);assert.ok(!output.includes(job.key));
});
test('repeated unchanged inspections do not update timestamps or consume the limit',t=>{
 const {journal}=fixture(t);journal.setEnabled(true,now);for(let i=1;i<80;i++)journal.entry(job,'entry','inspect',{status:'ambiguous',reason:'multiple_entry_controls',entryControls:2,elapsedMs:i},now+i);
 const row=journal.export(now+100).entryJournal.records[0];assert.equal(row.events.length,1);assert.equal(row.updatedAt,now+1);
});
test('click request, local response, navigation and manual report never prove arrival or credit',t=>{
 const {journal}=fixture(t);journal.setEnabled(true,now);for(const [i,phase] of ['work_started','click_requested','click_response','navigation_observed','work_finished','state_observed'].entries())journal.entry(job,'entry',phase,{status:phase==='state_observed'?'manual_clicked':'clicked',attempted:true,navigationObserved:true},now+i+1);
 const row=journal.export(now+20).entryJournal.records[0],report=JSON.parse(focusReport(journal.export(now+20).entryJournal,row.executionId));assert.equal(report.evidence.attemptRecorded,true);assert.equal(report.evidence.manualReported,true);assert.equal(report.limits.arrivalVerified,false);assert.equal(report.limits.attendanceVerified,false);
});
test('new retry work owns its result; missing terminal has unknown cause',t=>{
 const {journal}=fixture(t);journal.setEnabled(true,now);journal.entry(job,'entry','work_started',{status:'running'},now+1);journal.entry(job,'entry','work_finished',{status:'ambiguous',reason:'duplicate_target'},now+2);journal.entry(job,'entry','work_started',{status:'running'},now+3);
 const row=journal.export(now+4).entryJournal.records[0],e=entryEvidence(row);assert.equal(e.status,'running');assert.equal(e.reason,'unknown');assert.equal(e.terminalRecorded,false);assert.equal(row.events.at(-1).attemptIndex,2);
});
test('bounded focus reports keep at most 64 slots and 48 events with explicit omissions',t=>{
 const {journal}=fixture(t);journal.setEnabled(true,now);
 for(let i=0;i<68;i++)journal.entry({...job,key:i.toString(16).padStart(64,'0')},'entry','reservation_observed',{status:'reserved'},now+i+1);
 for(let i=0;i<60;i++)journal.entry(job,'entry','inspect',{status:i%2?'ready':'ambiguous'},now+100+i);
 const output=journal.export(now+200).entryJournal,row=output.records.at(-1);assert.equal(output.recordCount,64);assert.equal(row.events.length,48);assert.equal(row.droppedEvents,12);assert.ok(Buffer.byteLength(JSON.stringify(output))<270000);
});
test('diagnostic writes and deletion cannot create execution permission',t=>{
 const {journal}=fixture(t,{commit(){throw Error('disk full');}});assert.equal(journal.setEnabled(true,now),false);assert.doesNotThrow(()=>journal.entry(job,'entry','click_requested',{attempted:true},now+1));assert.equal(journal.export(now+2).entryJournal.recordCount,0);
});
test('selected preview is frozen; revoke blocks old callbacks and all focus export',async t=>{
 const {dir}=fixture(t),handlers=new Map(),saved=[],copied=[];const tools=createDeveloperTools({directory:dir,register:(name,fn)=>handlers.set(name,fn),save:async(_name,text,valid)=>{if(valid&&!valid())return {ok:false};saved.push(text);return {ok:true};},copy:text=>copied.push(text),notify(){},policy:{},edition:{appId:'synthetic',id:'developer'},version:'0.1.0-preview.21',snapshot:()=>({})});tools.register();
 const call=(name,...args)=>handlers.get('pc-dev:'+name)(...args);assert.equal((await call('entry-copy')).ok,false);assert.equal((await call('entry-save')).ok,false);assert.equal(call('enabled',true).ok,true);
 const old=tools.traceEntry(job,'entry');old.event('inspect',{status:'ready'});
 const records=call('entry-list').records;const preview=call('entry-preview',records[0].executionId);assert.equal(preview.ok,true);old.event('click_requested',{attempted:true});assert.equal((await call('entry-save',preview.token)).ok,true);await call('entry-copy',preview.token);assert.equal(saved[0],preview.text);assert.equal(copied[0],preview.text);assert.equal(JSON.parse(saved[0]).records.length,1);
 assert.equal(call('enabled',false).ok,true);assert.equal((await call('entry-copy',preview.token)).ok,false);assert.equal(call('entry-preview',records[0].executionId).ok,false);call('enabled',true);old.event('click_response',{status:'clicked'});old.finish({status:'clicked'});assert.equal(call('entry-list').records.length,0);
 const fresh=tools.traceEntry(job,'entry');fresh.event('inspect',{status:'ready'});call('clear');assert.equal(call('entry-list').records.length,0);assert.doesNotMatch(readFileSync(join(dir,'developer-diagnostics-v1.json'),'utf8'),/executionId/);
});
test('an untrusted stored UUID cannot merge another reservation into selected output',()=>{
 const base={area:'entry',reference:job.key,site:job.site,date:job.date,time:job.time,slot:0,entryKind:'entry',executionId:'00000000-0000-4000-8000-000000000001',phase:'inspect',at:now,status:'ready'};
 const output=entryRecords([base,{...base,reference:'b'.repeat(64),status:'clicked',at:now+1},{...base,site:'doctorville',status:'clicked',at:now+2}]);assert.equal(output.recordCount,1);assert.equal(output.records[0].events.length,1);assert.equal(output.records[0].events[0].status,'ready');
});
