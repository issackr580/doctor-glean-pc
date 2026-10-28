import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,existsSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DeveloperJournal} from '../editions/developer/developer-journal.js';
const now=Date.parse('2026-10-26T12:00:00+09:00'),DAY=86_400_000;
function setup(t){const dir=mkdtempSync(join(tmpdir(),'pc-developer-journal-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));return join(dir,'journal.json');}
test('developer recorder is off by default and creates no file for ignored events',t=>{
 const file=setup(t),journal=new DeveloperJournal(file);journal.event({area:'collection',phase:'start'},now);
 assert.equal(journal.status(now).enabled,false);assert.equal(existsSync(file),false);
});
test('explicit seven-day opt-in survives restart and automatically expires',t=>{
 const file=setup(t),journal=new DeveloperJournal(file);assert.equal(journal.setEnabled(true,now),true);
 journal.event({area:'collection',phase:'start',site:'keymedi'},now+1000);
 const restored=new DeveloperJournal(file);assert.equal(restored.status(now+2000).enabled,true);assert.equal(restored.export(now+2000).events.length,1);
 assert.equal(restored.status(now+7*DAY).enabled,false);
});
test('unknown keys, private values and unrecognised enum values never enter logs',t=>{
 const file=setup(t),journal=new DeveloperJournal(file);journal.setEnabled(true,now);
 journal.event({area:'browser',phase:'navigation_blocked',site:'keymedi',password:'secret',url:'https://private.test',cookie:'secret',reason:'secret',title:'private title'},now+1000);
 journal.event({area:'https://private.test',phase:'start'},now+2000);
 const raw=readFileSync(file,'utf8');assert.doesNotMatch(raw,/secret|private|https:|password|cookie|title/);assert.equal(journal.export(now+2000).events.length,1);
});
test('old Korean calendar days are pruned while current opt-in remains active',t=>{
 const file=setup(t),journal=new DeveloperJournal(file);journal.setEnabled(true,now);journal.event({area:'process',phase:'start'},now);
 assert.equal(journal.export(now+6*DAY).events.length,1);assert.equal(journal.export(now+7*DAY).events.length,0);
 assert.equal(JSON.parse(readFileSync(file,'utf8')).events.length,0);
});
test('diagnostic storage failures disable only diagnostics and never throw into work',t=>{
 const journal=new DeveloperJournal(setup(t),{commit(){throw Error('full');}});
 assert.equal(journal.setEnabled(true,now),false);assert.equal(journal.status(now).enabled,false);
 assert.doesNotThrow(()=>journal.event({area:'collection',phase:'start'},now));assert.equal(journal.status(now).writeFailures,1);
});
test('a corrupt journal is left intact until an explicit clear',t=>{
 const file=setup(t);writeFileSync(file,'{broken');const journal=new DeveloperJournal(file);
 assert.equal(journal.status(now).unavailable,true);assert.equal(journal.setEnabled(true,now),false);assert.equal(readFileSync(file,'utf8'),'{broken');
 assert.equal(journal.clear(),true);assert.equal(journal.status(now).enabled,false);assert.equal(journal.export(now).events.length,0);
});
test('opt-in fault rows survive restart with fixed fields and no raw exception',t=>{
 const file=setup(t),journal=new DeveloperJournal(file);journal.setEnabled(true,now);
 journal.event({area:'process',phase:'fault',site:'',origin:'uncaught_exception',code:'object_destroyed',source:'src/main.js',line:120,column:8,appVersion:'0.1.0-preview.19',sourceCommit:'a'.repeat(40),message:'PRIVATE_ACCOUNT',stack:'C:/Users/PRIVATE/secret.js',url:'https://private.invalid/'},now+1000);
 journal.event({area:'process',phase:'fault',site:'',origin:'uncaught_exception',code:'PRIVATE'},now+1500);
 const rows=new DeveloperJournal(file).export(now+2000).events;assert.equal(rows.length,1);assert.equal(rows[0].code,'object_destroyed');assert.equal(rows[0].line,120);assert.equal(rows[0].sourceCommit,'a'.repeat(40));
 assert.doesNotMatch(readFileSync(file,'utf8'),/PRIVATE|private|Users|https:|message|stack/);
});
