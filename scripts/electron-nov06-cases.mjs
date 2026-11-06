// Representative failures, without the user's private titles, IDs or DOM.
import {session} from 'electron';
import {randomUUID} from 'node:crypto';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {AutomationPage} from '../src/automation-page.js';
import {EntryRunner} from '../src/entry-runner.js';
import {LocalState} from '../src/local-state.js';
import {WorkflowStore} from '../src/workflow-store.js';
import {remotePreferences} from '../src/security.js';
import {CredentialManager} from '../src/credential-manager.js';

export async function nov06Cases({root,date,title,clock,check,inspect,job,detailHeader}){
 const main='https://www.doctorville.co.kr/seminar/main',detail=id=>'https://www.doctorville.co.kr/seminar/seminarDetail?seminarId='+id;
 for(const tag of ['em','b']){
  const body=detailHeader().replace('<strong>'+title+'</strong>','<'+tag+'>'+title+'</'+tag+'>');
  check('Doctorville complete visible '+tag+' title retains independent detail checks',(await inspect('doctorville',body,{url:detail(81)})).status==='ready');
 }
 for(const [name,value] of [['format',title.replace('입장','입\u200b장')],['contained',title+' 추가 문구'],['image','<img alt="'+title+'" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==">']]){
  const result=await inspect('doctorville',detailHeader(undefined,undefined,value),{url:detail(81)});
  check('Doctorville '+name+' title evidence is diagnostic and never entry permission',result.status!=='ready'&&result.titleMatches===0&&result.titleCandidates>0&&result[name==='format'?'titleFormatMatches':name==='contained'?'titleContainsMatches':'titleImageMatches']>0);
 }
 for(const scenario of ['corrected_link','same_identity','wrong_title','wrong_date','different_identity','duplicate_list','cancelled','storage_failure']){
  const dir=join(root,'nov06-'+scenario),partition='nov06-'+randomUUID(),ledger=new LocalState(join(dir,'state.json'));ledger.setPaused(false);
  const store=new WorkflowStore(join(dir,'workflows.json'));store.setFeature('entry',true);
  let now=Date.now(),lists=0,details=0,posts=0,durable=false,runner,failed=false;
  const bound=['same_identity','different_identity'].includes(scenario),nextId=scenario==='same_identity'?81:82;
  const card=id=>`<a class="list_detail" href="/seminar/seminarDetail?seminarId=${id}"><strong class="tit">${title}</strong><div class="time"><span class="start">${clock}</span> ~ 23:59</div></a>`;
  await session.fromPartition(partition).protocol.handle('https',request=>{
   if(request.method!=='GET'){posts++;durable=Object.values(JSON.parse(readFileSync(join(dir,'state.json'),'utf8')).jobs).some(r=>r.state==='attempting');return new Response('{}');}
   const u=new URL(request.url);let body;
   if(u.pathname==='/seminar/main'){lists++;body=card(lists===1?81:nextId)+(lists>1&&scenario==='duplicate_list'?card(83):'');}
   else{
    details++;
    body=details===1||scenario==='wrong_title'?detailHeader(undefined,undefined,'다른 합성 강의'):detailHeader('<button onclick="fetch(\'/synthetic-entry\',{method:\'POST\'})">입장하기</button>',scenario==='wrong_date'?'2020-01-01 '+clock+' ~ 23:59':undefined);
   }
   return new Response('<!doctype html><meta charset="utf-8"><body>'+body+'</body>',{headers:{'content-type':'text/html; charset=utf-8'}});
  });
  const entry={...job('doctorville'),start:now,status:'reserved',nextAt:now-1,retries:0,attempts:[],entryAttempted:false,...(bound?{scheduleIdentity:createHash('sha256').update(detail(81)).digest('hex')}:{})};store.putEntry(entry);
  const events=[];
  runner=new EntryRunner({ledger,store,catalog:()=>({doctorville:{site:'doctorville',date,status:'review',events:[{site:'doctorville',date,time:clock,title,url:detail(81)}]}}),now:()=>now,sleep:async ms=>{now+=ms;await new Promise(r=>setTimeout(r,0));},traceEntry:()=>({event:(phase,value)=>events.push({phase,...value})}),createPage:async(_site,signal)=>{
   const page=new AutomationPage('doctorville',signal,{...remotePreferences('doctorville'),partition});const load=page.load.bind(page),call=page.call.bind(page);
   page.load=async url=>{await load(url);if(url===main&&lists===2&&scenario==='cancelled')runner.cancel();};
   page.call=async(name,args,options)=>{const result=await call(name,args,options);if(details>=2&&result.status==='ready'&&scenario==='storage_failure'&&!failed){failed=true;store.commit=()=>{throw Error('storage_error');};}return result;};return page;
  }});
  try{await runner.run(entry);}catch(error){assert.equal(scenario,'storage_failure');}
  const success=['corrected_link','same_identity'].includes(scenario);
  check('Doctorville '+scenario+' refreshes the current list at most once before any dispatch',lists===2&&details<=2&&posts===(success?1:0));
  check('Doctorville '+scenario+' preserves independent detail checks and durable attempt consumption',success?durable&&store.entries()[0].status==='clicked':scenario==='storage_failure'?store.failed&&posts===0:Object.keys(ledger.snapshot().jobs).length===0);
  if(success){await runner.run(store.entries()[0]);check('Doctorville '+scenario+' cannot replay a consumed entry',posts===1);}
  check('Doctorville '+scenario+' records the read-only catalog fallback',events.some(e=>e.targetSource==='live_catalog'&&e.readOnly===true));
 }
 const partition='nov06-redirect-'+randomUUID(),events=[],controller=new AbortController();
 await session.fromPartition(partition).protocol.handle('https',()=>new Response(null,{status:302,headers:{location:'https://unapproved.example.com/private?token=SYNTHETIC'}}));
 const page=new AutomationPage('dtalks',controller.signal,{...remotePreferences('dtalks'),partition},{onDiagnostic:(phase,detail)=>events.push({phase,...detail})});
 try{
  await assert.rejects(page.load('https://www.dtalks.kr/websim/vodList.do'),error=>error.code==='policy_rejected');
  check('blocked redirect stays blocked and distinct from a network failure',page.diagnostics().navigationBlocked===1&&events.some(e=>e.destinationKind==='unapproved_https'));
  check('blocked redirect evidence omits destination hosts, queries and credentials',!JSON.stringify(events).includes('SYNTHETIC')&&!JSON.stringify(events).includes('example.com'));
 }finally{page.close();}
 for(const scenario of ['login_get','recovery_target','armed','credential','wrong_host','other_path','duplicate_query','repeated']){
  const partition='nov06-login-'+randomUUID(),controller=new AbortController();let logins=0,posts=0,authenticated=false,recoveries=0;
  const targets={wrong_host:'http://other.example.com/login.do',other_path:'http://www.dtalks.kr/other.do',duplicate_query:'http://www.dtalks.kr/login.do?backUrl=one&backUrl=two'},target=targets[scenario]??'http://www.dtalks.kr/login.do?backUrl=SYNTHETIC_PRIVATE';
  await session.fromPartition(partition).protocol.handle('https',request=>{
   if(request.method!=='GET'){posts++;return new Response('{}');}
   if(new URL(request.url).pathname==='/login.do'){logins++;return new Response('<!doctype html><input type="password">',{headers:{'content-type':'text/html'}});}
   if(authenticated)return new Response('<!doctype html><main>합성 목록</main>',{headers:{'content-type':'text/html'}});
   return new Response(null,{status:302,headers:{location:target}});
  });
  const page=new AutomationPage('dtalks',controller.signal,{...remotePreferences('dtalks'),partition});
  if(scenario==='recovery_target')CredentialManager.prototype.wrapPage.call({automaticAllowed:()=>true,vault:{enabled:()=>true},verifyPage:async(_site,p)=>p.route==='login'?'login_required':'authenticated',recover:async()=>{authenticated=true;recoveries++;return {status:'authenticated'};}},'dtalks',page);
  if(scenario==='armed')page.armEntryDispatch();if(scenario==='credential')page.credentialNetwork=true;
  try{
   if(scenario==='recovery_target'){
    await page.load('https://www.dtalks.kr/websim/vodList.do');
    check('DTalks recovery returns to the original catalog without a second submission',page.url==='https://www.dtalks.kr/websim/vodList.do'&&recoveries===1&&logins===1&&posts===0);
   }else if(['login_get','repeated'].includes(scenario)){
    await page.load('https://www.dtalks.kr/websim/vodList.do');
    check('DTalks '+scenario+' reaches only the fixed HTTPS login GET',page.url==='https://www.dtalks.kr/login.do'&&page.route==='login'&&logins===1&&posts===0);
    if(scenario==='repeated'){await assert.rejects(page.load('https://www.dtalks.kr/websim/vodList.do'),e=>e.code==='policy_rejected');check('DTalks secure fallback cannot loop',logins===1&&posts===0);}
   }else{await assert.rejects(page.load('https://www.dtalks.kr/websim/vodList.do'),e=>e.code==='policy_rejected');check('DTalks '+scenario+' cannot start a fallback or resend a POST',logins===0&&posts===0);}
  }finally{page.close();}
 }
}
