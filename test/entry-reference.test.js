import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {catalogEntryReference} from '../src/entry-reference.js';
import {canPreflightEntry} from '../src/execution-presentation.js';
import {EntryRunner} from '../src/entry-runner.js';
import {AutomationController} from '../src/automation-controller.js';
import {LocalState} from '../src/local-state.js';
import {WorkflowStore,cleanReceipt} from '../src/workflow-store.js';
import {kstDate} from '../src/schedule.js';
const date=kstDate(),url='https://www.doctorville.co.kr/seminar/seminarDetail?seminarId=17';
const job={key:'a'.repeat(64),site:'doctorville',date,time:'18:30',title:'합성 일정 확인',slot:0};
const event={site:job.site,date,time:job.time,title:job.title,url};
const catalog=(events=[event])=>({doctorville:{site:'doctorville',date,status:'review',events}});
const missing={status:'target_missing',reason:'schedule_unmatched',titleMatches:2,dateMissingCards:2,dateMatches:0,timeMatches:0,targetMatched:false};
function setup(t){
 const root=mkdtempSync(join(tmpdir(),'pc-reference-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 let now=Date.now();const ledger=new LocalState(join(root,'state.json')),store=new WorkflowStore(join(root,'workflows.json'));
 const row={...job,start:now,due:now-1000,deadline:now+600000,nextAt:now-1000,status:'reserved',retries:0,attempts:[],entryAttempted:false};store.putEntry(row);
 const loads=[],calls=[],events=[];
 const page={url:'about:blank',route:'catalog',version:0,load:async function(next){loads.push(next);this.url=next;this.version++;},call:async function(name,args){calls.push([name,args[1]]);assert.equal(args[1],'preflight');return this.url===url?{status:'ready',reason:'entry_ready',targetMatched:true,dateMatches:1,timeMatches:1,entryControls:1}:missing;},close(){this.closed=true;}};
 const options={ledger,store,catalog:()=>catalog(),createInspectionPage:async()=>page,now:()=>now,sleep:async ms=>{now+=ms;},traceEntry:()=>({event:(phase,detail)=>events.push({phase,...detail}),finish(){}})};
 return {root,ledger,store,row,page,loads,calls,events,options};
}
test('one observed catalog identity resolves by exact site, date, title and start',()=>{
 assert.equal(catalogEntryReference(job,catalog()).url,url);
 assert.equal(catalogEntryReference(job,catalog([{...event,title:' 합성   일정 확인 '},event])).url,url);
 assert.equal(catalogEntryReference({...job,url:'https://PRIVATE.invalid'},{}),null);
 for(const change of [{site:'hmp'},{date:'2020-01-01'},{time:'18:00'},{title:'다른 합성 강의'}])assert.equal(catalogEntryReference(job,catalog([{...event,...change}])),null);
 assert.equal(catalogEntryReference(job,{doctorville:{...catalog().doctorville,date:'2020-01-01'}}),null);
});
test('different observed identities for the same schedule remain ambiguous',()=>{
 assert.equal(catalogEntryReference(job,catalog([event,{...event,url:url.replace('17','18')}])).status,'ambiguous');
});
test('unsafe catalog links never become navigation hints',()=>{
 for(const bad of [url+'&token=PRIVATE',url+'&other=1',url+'&seminarId=18',url+'#fragment',url.replace('www.doctorville.co.kr','PRIVATE.invalid'),url.replace('https:','http:'),url.replace('www.','user:password@www.'),url.replace('seminarDetail','other'),url.replace('=17','=0')])assert.equal(catalogEntryReference(job,catalog([{...event,url:bad}])).status,'blocked');
});
test('consumed jobs hide preflight but a future Hanmi slot remains inspectable',()=>{
 for(const status of ['clicked','manual_clicked','cancelled','expired','lecture_ended','running','attempting'])assert.equal(canPreflightEntry({...job,status}),false);
 assert.equal(canPreflightEntry({...job,status:'unknown',entryAttempted:true}),false);
 assert.equal(canPreflightEntry({...job,site:'hmp',slot:1,status:'reserved',entryAttempted:false,receipt:{status:'clicked',attempted:true,slot:0}}),true);
});
test('date-missing preflight reads one catalog detail and leaves durable entry data intact',async t=>{
 const s=setup(t),before=s.store.entries()[0];let recoveries=0;
 const runner=new EntryRunner({...s.options,createPage:async()=>{recoveries++;throw Error('forbidden');}});
 assert.equal((await runner.preflight(job.key)).ok,true);
 assert.deepEqual(s.loads,['https://www.doctorville.co.kr/seminar/main',url]);
 const {preflight,inspection,...after}=s.store.entries()[0];assert.deepEqual(after,before);assert.equal(preflight.status,'complete');assert.equal(preflight.attempted,false);assert.equal(preflight.reads,4);assert.equal(inspection.dateMatches,1);
 assert.equal(recoveries,0);assert.equal(existsSync(join(s.root,'state.json')),false);assert.equal(s.events.find(e=>e.phase==='target_open_requested').targetSource,'catalog');assert.doesNotMatch(JSON.stringify(s.events),/https:|seminarId/);
});
test('wrong detail schedule cannot be replaced by the cached catalog schedule',async t=>{
 const s=setup(t);s.page.call=async function(){return this.url===url?{...missing,titleMatches:1,dateMissingCards:0}:missing;};
 await new EntryRunner(s.options).preflight(job.key);assert.equal(s.store.entries()[0].preflight.status,'target_missing');assert.equal(s.loads.filter(v=>v===url).length,1);assert.equal(Object.keys(s.ledger.snapshot().jobs).length,0);
});
test('ambiguous catalog references cannot select one detail or consume an attempt',async t=>{
 const s=setup(t);await new EntryRunner({...s.options,catalog:()=>catalog([event,{...event,url:url.replace('17','18')}])}).preflight(job.key);
 assert.equal(s.store.entries()[0].preflight.status,'ambiguous');assert.equal(s.loads.length,1);assert.equal(Object.keys(s.ledger.snapshot().jobs).length,0);
});
test('cancelling a detail read drops late results and preserves the reservation',async t=>{
 const s=setup(t);let deliver,entered;const waiting=new Promise(resolve=>{entered=resolve;});
 s.page.load=async function(next){s.loads.push(next);if(next===url){entered();await new Promise(resolve=>{deliver=resolve;});}this.url=next;this.version++;};
 const runner=new EntryRunner(s.options),pending=runner.preflight(job.key);await waiting;runner.cancel();deliver();await pending;
 assert.equal(s.store.entries()[0].status,'reserved');assert.equal(s.store.entries()[0].preflight.status,'cancelled');assert.equal(s.calls.length,2);assert.equal(Object.keys(s.ledger.snapshot().jobs).length,0);
});
test('already dispatched entry cannot run another preflight or change its old evidence',async t=>{
 const s=setup(t);s.store.updateEntry(job.key,{status:'clicked',entryAttempted:true,receipt:cleanReceipt({status:'clicked',attempted:true,navigationObserved:true}),preflight:cleanReceipt(missing)});
 const before=readFileSync(join(s.root,'workflows.json'),'utf8');const result=await new EntryRunner(s.options).preflight(job.key);
 assert.equal(result.ok,false);assert.equal(s.loads.length,0);assert.equal(readFileSync(join(s.root,'workflows.json'),'utf8'),before);
});
test('the automation controller supplies its catalog to the entry inspector',async t=>{
 const s=setup(t),controller=new AutomationController({...s.options,file:join(s.root,'workflows.json'),catalogBusy:()=>false,queueCatalog(){},yieldCatalog(){}});
 clearInterval(controller.timer);t.after(()=>controller.close());await controller.preflightEntry(job.key);
 assert.equal(controller.store.entries()[0].preflight.status,'complete');assert.equal(s.loads.at(-1),url);
});
