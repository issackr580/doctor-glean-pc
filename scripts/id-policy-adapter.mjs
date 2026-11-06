// Reference DTO -> actual PC store/runner. Never reads expected case results.
// The pre-existing PC legacy hash uses JSON, unlike the mobile pipe hash. Only
// that representation is projected for the reference contract, with pcKey kept.
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {WorkflowStore} from '../src/workflow-store.js';
import {LocalState} from '../src/local-state.js';
import {EntryRunner} from '../src/entry-runner.js';
import {createEntryJob} from '../src/entry-job.js';
import {ENTRY_SITES} from '../src/automation-policy.js';
import {parseOfficialIdentity,officialEntryKey,legacyEntryKey,sameWorker,sameReceiptOwner,nextIdentityEntry} from '../src/entry-identity.js';
import {kstDate} from '../src/schedule.js';
const hash=s=>createHash('sha256').update(s).digest('hex');
const view=j=>!j?null:{...j,pcKey:j.key,key:!officialEntryKey(j)&&j.key===legacyEntryKey(j)?hash(j.site+'|'+j.date+'|'+j.title.replace(/\s+/g,' ').trim()):j.key,state:j.status,retryCount:j.retries};
const row=j=>({...j,status:j.status??j.state,retries:j.retries??j.retryCount??0,slot:j.slot??0,nextAt:j.nextAt??j.due,attempts:j.attempts??[],prepAt:j.prepAt??0});
export async function evaluate(input){
 const now=input.now;
 if(input.operation==='parse')return {identity:parseOfficialIdentity(input.site,input.url)};
 if(input.operation==='job')return {job:view(createEntryJob(input.event,now))};
 if(input.operation==='same_worker')return {same:sameWorker(row(input.expectedJob),row(input.savedJob))};
 if(input.operation==='same_receipt')return {same:sameReceiptOwner(row(input.expectedJob),row(input.savedJob))};
 if(input.operation==='next'){
  const jobs=Object.values(input.jobs).map(row);return {count:jobs.length,jobs:Object.fromEntries(jobs.map(j=>[j.key,view(j)])),next:view(nextIdentityEntry(jobs,now,{date:kstDate(now)}))};
 }
 const root=mkdtempSync(join(tmpdir(),'pc-id-contract-'));
 try{
  const ledger=new LocalState(join(root,'state-v1.json'));ledger.setPaused(false);const store=new WorkflowStore(join(root,'workflows-v1.json'),{now:()=>now});store.setFeature('entry',true);store.setEntrySites([...ENTRY_SITES]);
  const seed=input.jobs??(input.previous?{[input.previous.key]:input.previous}:{});for(const j of Object.values(seed))store.putEntry(row(j));
  const result=input.result??{status:'ok',events:input.events??[]},site=input.site??input.previous?.site??input.candidateEvent?.site??input.events?.[0]?.site;
  const catalog=()=>({[site]:{...result,site,stale:result.stale===true,pending:result.pending===true}});
  const runner=new EntryRunner({ledger,store,now:()=>now,catalog,createPage:async()=>{throw Error('policy_adapter_never_opens_site');}});
  if(input.operation==='refresh'||input.operation==='hmp_targets')runner.reserveCatalog(kstDate(now),catalog());
  let marked,candidate;
  if(input.operation==='manual'){candidate=createEntryJob(input.candidateEvent,now);marked=runner.manualCandidate(candidate);}
  if(input.operation==='rebook'){if(runner.retryJob(input.previous.key))candidate=store.entries(input.previous.date).find(j=>j.key===input.previous.key);else candidate=null;}
  const jobs=store.entries(kstDate(now));
  return {count:jobs.length,jobs:Object.fromEntries(jobs.map(j=>[j.key,view(j)])),next:view(nextIdentityEntry(jobs,now,{date:kstDate(now)})),...(input.operation==='hmp_targets'?{targets:jobs.map(view)}:{}),...(input.operation==='manual'?{marked,candidateKey:candidate.key}:{}),...(input.operation==='rebook'?{candidate:view(candidate)}:{})};
 }finally{rmSync(root,{recursive:true,force:true});}
}
