import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SiteWait,observeSiteResponse} from '../src/site-wait.js';
import {CatalogRunner} from '../src/catalog-runner.js';
import {NativeCatalogRead} from '../src/native-catalog.js';
import {kstInstant} from '../src/schedule.js';

test('429 stops fallback at the catalog entry point',async t=>{
 const root=mkdtempSync(join(tmpdir(),'pc-wait-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const date='2026-11-18';let now=kstInstant(date,'10:00'),http=0,browser=0,login=0;
 const owner={cookies:{get:async()=>[{name:'accessToken',value:'synthetic_profile'}]}};
 const setup=(gate)=>{
  const reader=new NativeCatalogRead({gate,accountEpoch:()=>0,profileEpoch:()=>0,sessionOwner:()=>owner,fetchImpl:async()=>{http++;return new Response('',{status:429,headers:{'retry-after':'600'}});}});
  return new CatalogRunner({gate,now:()=>now,store:{record(){}},nativeRead:(...args)=>reader.read(...args),createPage:async()=>{browser++;return {open(){},read:()=>({status:'login',events:[],done:true}),close(){}};},recoverLogin:async()=>{login++;return false;}});
 };
 const file=join(root,'site.json');let gate=new SiteWait(file,{now:()=>now});const run=setup(gate);await run.start(date,['docple']);assert.deepEqual({http,browser,login},{http:1,browser:0,login:0});
 assert.equal(gate.status('docple').context,'native_read');assert.equal(gate.status('docple').method,'GET');
 const first=now;now+=10000;gate.observe('docple',{url:'https://docple-plus.com/api/season2/webinar/list',status:429,retryAfter:'10',api:true});
 gate=new SiteWait(file,{now:()=>now});const restarted=setup(gate);now=first+599999;await restarted.start(date,['docple']);
 assert.equal(gate.allowed('hmp'),true);assert.deepEqual({http,browser,login},{http:1,browser:0,login:0});const beforeB={http,browser,login};let bLoads=0;
 const bRun=new CatalogRunner({gate,now:()=>now,store:{record(){}},createPage:async()=>({open(){bLoads++;},read:()=>({status:'ok',events:[],coverage:true,done:true}),close(){}})});
 await bRun.start(date,['hmp']);assert.equal(bLoads,1);assert.deepEqual({http,browser,login},beforeB);
 now++;assert.equal(gate.allowed('docple'),true);
});

test('Docple attributes the first authentication 429 and persists its wait even without Retry-After',t=>{
 const root=mkdtempSync(join(tmpdir(),'pc-wait-docple-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const file=join(root,'site.json'),options={now:()=>1800000000000},gate=new SiteWait(file,options);
 const login='https://docple-plus.com/api/season2/auth/login',refresh='https://docple-plus.com/api/season2/auth/token/refresh';
 const reply={url:login,method:'POST',resourceType:'xhr',statusCode:429};
 for(const invalid of [{url:login+'?private=unsafe'},{url:login.replace('docple-plus.com','docple-plus.com.invalid')},{method:'GET'},{statusCode:403}]){
  assert.equal(observeSiteResponse(gate,'docple',{...reply,...invalid},'manual_browser'),false);
 }
 assert.equal(observeSiteResponse(gate,'docple',reply,'manual_browser'),true);
 const restarted=new SiteWait(file,options);
 assert.equal(restarted.allowed('docple'),false);
 assert.equal(restarted.status('docple').operation,'login');
 assert.equal(restarted.status('docple').until,options.now()+300000);
 assert.equal(observeSiteResponse(gate,'docple',{...reply,url:refresh,responseHeaders:{'Retry-After':['60']}},'manual_browser'),true);
 assert.equal(gate.status('docple').operation,'session_refresh');
 assert.equal(gate.status('docple').until,options.now()+300000);
});

import {workerWait,waitUntil} from '../src/site-wait.js';
import {writeFileSync} from 'node:fs';
test('response scope, revision, stale worker, defaults, restart and storage uncertainty',t=>{
 const path=mkdtempSync(join(tmpdir(),'pc-wait-'));t.after(()=>rmSync(path,{recursive:true,force:true}));
 let now=1800000000000,epoch=0;const initial=now,file=join(path,'gate'),gate=new SiteWait(file,{now:()=>now});
 const make=()=>workerWait(gate,'docple',new AbortController().signal,()=>epoch);
 const worker=make(),details={url:'https://docple-plus.com/seminar',resourceType:'mainFrame'};
 worker.response({...details,statusCode:403,resourceType:'image'});worker.response({...details,statusCode:429,url:'https://other.invalid/a'});assert.equal(gate.status('docple'),null);
 const stale=make();epoch++;stale.response({...details,statusCode:403});assert.equal(gate.status('docple'),null);assert.equal(stale.allowed(),false);
 const active=make();active.response({...details,statusCode:403});assert.equal(active.allowed(),false);const first=gate.status('docple');
 now++;gate.observe('docple',{...details,status:429,retryAfter:'invalid'});const second=gate.status('docple');assert.equal(second.until,now+300000);
 assert.equal(gate.acknowledge('docple',first.at,first.revision),false);
 const restart=new SiteWait(file,{now:()=>now});assert.equal(restart.status('docple').manual,true);assert.equal(restart.acknowledge('docple',second.at,second.revision),true);assert.equal(restart.allowed('docple'),false);
 now=second.until;assert.equal(restart.allowed('docple'),true);now--;assert.equal(restart.allowed('docple'),false);assert.equal(new SiteWait(file,{now:()=>now}).allowed('hmp'),false);
 assert.equal(waitUntil(new Date(initial+90000).toUTCString(),initial,60000),initial+90000);
 gate.observe('docple',{...details,status:503,document:true});assert.equal(gate.status('docple').until,now+60000);
 const broken=new SiteWait(file,{now:()=>now,write(){throw Error('disk_full');}});broken.observe('docple',{...details,status:429});assert.equal(broken.allowed('docple'),false);assert.equal(new SiteWait(file).allowed('docple'),false);
 writeFileSync(join(path,'corrupt'),'{');assert.equal(new SiteWait(join(path,'corrupt')).allowed('docple'),false);
});
