import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CatalogStore,sanitiseResult} from '../src/catalog-store.js';
import {kstInstant} from '../src/schedule.js';
const date='2026-10-26',now=kstInstant(date,'12:00');
const event={site:'doctorville',date,time:'13:00',title:'검증용 강의',id:'1',url:'https://www.doctorville.co.kr/seminar/seminarDetail?seminarId=1'};
function setup(t){const dir=mkdtempSync(join(tmpdir(),'pc-catalog-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const file=join(dir,'catalog.json');return {file,store:new CatalogStore(file)};}
test('results reject other dates and hostile links, keeping display text inert',()=>{
 const r=sanitiseResult('doctorville',date,{status:'ok',coverage:true,events:[event,{...event,date:'2026-10-27'},{...event,url:'https://evil.test/?token=secret'}]},now);
 assert.equal(r.events.length,1);assert.equal(r.status,'review');assert.equal(r.coverage,false);
 assert.doesNotMatch(JSON.stringify(r),/secret|evil.test|2026-10-27/);
});
test('public lecture links cannot carry authentication fields into the cache',()=>{
 const r=sanitiseResult('doctorville',date,{status:'review',events:[{...event,url:event.url+'&authToken=secret#cookie'}]},now);
 assert.equal(r.events.length,1);assert.doesNotMatch(r.events[0].url,/secret|authToken|#/);
});
test('failed refresh retains only same-day cached rows and marks them stale',t=>{
 const {store}=setup(t);store.record('doctorville',date,{status:'ok',coverage:true,events:[event]},now);
 const after=store.record('doctorville',date,{status:'login',events:[]},now+1000);
 assert.equal(after.events.length,1);assert.equal(after.stale,true);assert.equal(after.status,'login');
 assert.deepEqual(store.view('2026-10-27').results,{});
});
test('a verified empty list replaces old rows but an unverified empty page does not',t=>{
 const {store}=setup(t);store.record('doctorville',date,{status:'ok',coverage:true,events:[event]},now);
 assert.equal(store.record('doctorville',date,{status:'review',coverage:false,events:[]},now+1000).events.length,1);
 const empty=store.record('doctorville',date,{status:'ok',coverage:true,events:[]},now+2000);
 assert.equal(empty.events.length,0);assert.equal(empty.stale,false);
});
test('new partial rows do not union cancelled historical rows back in',t=>{
 const {store}=setup(t);store.record('doctorville',date,{status:'ok',coverage:true,events:[event]},now);
 const result=store.record('doctorville',date,{status:'review',events:[{...event,title:'새 강의',id:'2'}]},now+1000);
 assert.deepEqual(result.events.map(e=>e.title),['새 강의']);assert.equal(result.stale,false);
});
test('selection and lecture rows survive restart but reports omit lecture links and titles',t=>{
 const {file,store}=setup(t);store.select(['doctorville','keymedi']);store.record('doctorville',date,{status:'ok',coverage:true,events:[event]},now);
 const restored=new CatalogStore(file);
 assert.deepEqual(restored.selected(),['doctorville','keymedi']);assert.equal(restored.view(date).results.doctorville.events.length,1);
 assert.doesNotMatch(JSON.stringify(restored.diagnostics(date)),/seminarId|검증용 강의|https:/);
});
test('invalid saved catalog fails without rewriting the file',t=>{
 const {file}=setup(t);const raw='{"schemaVersion":999}';writeFileSync(file,raw);
 assert.throws(()=>new CatalogStore(file));assert.equal(readFileSync(file,'utf8'),raw);
});
test('invalid selection is rejected and failed writes do not become saved results',t=>{
 const {file,store}=setup(t);assert.throws(()=>store.select(['__proto__']));assert.throws(()=>store.select(['docple']));
 const broken=new CatalogStore(file,{commit:()=>{throw Error('disk full');}});
 assert.throws(()=>broken.record('doctorville',date,{status:'ok',events:[event]},now));
 assert.deepEqual(broken.view(date).results,{});
});
test('review status preserves bounded list evidence without promoting unknown coverage',t=>{
 const {file,store}=setup(t);
 const row=store.record('doctorville',date,{status:'review',coverage:true,events:[event],diagnostics:{stopReason:'doctorville_list_exhausted',listDetails:{status:'checked'},rows:42,source:'https://private.invalid/',samples:[{title:'private'}]}},now);
 assert.equal(row.status,'review');assert.equal(row.scope,'list_checked');
 assert.deepEqual(new CatalogStore(file).diagnostics(date)[0].inspection,row.inspection);
 assert.doesNotMatch(JSON.stringify(store.diagnostics(date)),/private|source|samples/);
 const unknown=store.record('doctorville',date,{status:'review',coverage:true,events:[event]},now+1);
 assert.equal(unknown.scope,'unconfirmed');
});
test('a checked Dtalks calendar retains only bounded facts and binds its selected date across restart',t=>{
 const {file,store}=setup(t),diagnostics={stopReason:'selected_month_calendar',calendarChecked:true,calendarStatus:'checked',calendarDate:date,calendarMonth:date.slice(0,7),calendarReason:'selected_day_cell',calendarDetails:{parts:['PRIVATE']},selectedEvents:[{title:'PRIVATE'}],continuation:{more:0,pagers:0,ambiguous:false}};
 const row=store.record('dtalks',date,{status:'review',coverage:true,events:[],diagnostics},now);
 assert.equal(row.scope,'calendar_checked');assert.equal(row.inspection.continuationPages,0);
 assert.equal(new CatalogStore(file).view(date).results.dtalks.scope,'calendar_checked');assert.doesNotMatch(JSON.stringify(store.diagnostics(date)),/PRIVATE|parts|selectedEvents/);
 for(const patch of [{calendarChecked:false},{calendarStatus:'waiting'},{calendarDate:'2026-10-27'},{calendarMonth:'2026-11'}])assert.equal(sanitiseResult('dtalks',date,{status:'review',coverage:true,events:[],diagnostics:{...diagnostics,...patch}},now).scope,'unconfirmed');
});
test('Hanmi and InterMD current-list evidence never becomes whole-catalog coverage',()=>{
 const diagnostics={stopReason:'current_list_only',currentListRead:true,listStatus:'read',rows:16,undated:0,untimed:0,untitled:0,continuation:{more:1,pagers:0,ambiguous:false}};
 const row=sanitiseResult('hmp',date,{status:'review',coverage:false,events:[],diagnostics},now);
 assert.equal(row.scope,'current_list_checked');assert.equal(row.coverage,false);assert.equal(row.inspection.continuationMore,1);
 assert.equal(sanitiseResult('intermd',date,{status:'review',coverage:true,events:[],diagnostics:{...diagnostics,cardLayout:'intermd_cards'}},now).scope,'current_list_checked');
 assert.equal(sanitiseResult('hmp',date,{status:'review',coverage:false,events:[],diagnostics:{...diagnostics,untimed:1}},now).scope,'current_page');
});
test('coverage of an unresolved or only current empty list cannot erase previously read lectures',t=>{
 const {store}=setup(t);store.record('doctorville',date,{status:'ok',coverage:true,events:[event]},now);
 const unresolved=store.record('doctorville',date,{status:'review',coverage:true,events:[]},now+1);
 assert.equal(unresolved.events.length,1);assert.equal(unresolved.stale,true);
 const checked=store.record('doctorville',date,{status:'review',coverage:true,events:[],diagnostics:{stopReason:'doctorville_list_exhausted',listStatus:'checked'}},now+2);
 assert.equal(checked.events.length,0);assert.equal(checked.stale,false);
});
test('Bluepharm observed start dates require complete current-card facts and no unresolved continuation',()=>{
 const diagnostics={rows:9,undated:0,untimed:0,untitled:0,startDatesRead:true,cardLayout:'sem_tit',continuation:{more:0,pagers:0,ambiguous:false}};
 const make=patch=>sanitiseResult('bluepharm',date,{status:'review',coverage:true,events:[],diagnostics:{...diagnostics,...patch}},now);
 assert.equal(make({}).scope,'current_list_checked');
 assert.equal(make({continuation:{more:1,pagers:0,ambiguous:false}}).scope,'unconfirmed');assert.equal(make({startDatesRead:false}).scope,'unconfirmed');
});
test('Bluepharm selected-day calendar proof remains scoped to that checked date despite unrelated page controls',()=>{
 const diagnostics={calendarChecked:true,calendarStatus:'checked',calendarDate:date,calendarMonth:date.slice(0,7),continuation:{more:0,pagers:1,ambiguous:false}};
 const row=sanitiseResult('bluepharm',date,{status:'review',coverage:true,events:[],diagnostics},now);assert.equal(row.scope,'calendar_checked');
 assert.equal(sanitiseResult('bluepharm',date,{status:'review',coverage:true,events:[],diagnostics:{...diagnostics,calendarDate:'2026-10-27'}},now).scope,'unconfirmed');
});
