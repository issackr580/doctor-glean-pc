import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {mkdtempSync,rmSync} from 'node:fs';
import {DailyRunner} from '../src/daily-runner.js';
import {CatalogRunner} from '../src/catalog-runner.js';
import {NativeCatalogRead} from '../src/native-catalog.js';
import {LocalState} from '../src/local-state.js';
import {WorkflowStore} from '../src/workflow-store.js';
import {SiteWait} from '../src/site-wait.js';
import {kstInstant} from '../src/schedule.js';

const date='2026-11-24',now=()=>kstInstant(date,'12:30');
const complete=()=>({data:{yearMonth:'202611',attendedDates:[date]}});
const response=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json',...headers}});
function setup(t,{reply=async()=>response(complete()),cookieNames=['accessToken']}={}){
 const path=mkdtempSync(join(tmpdir(),'pc-http-test-'));t.after(()=>rmSync(path,{recursive:true,force:true}));
 let epoch=0,cookieReads=0,requests=0,pages=0;const gate=new SiteWait(join(path,'wait.json'),{now});
 const owner={cookies:{get:async({url})=>{
  cookieReads++;assert.equal(new URL(url).origin,'https://docple-plus.com');
  return cookieNames.map((name,index)=>({name,value:'SYNTHETIC_TOKEN_'+index}));
 }}};
 const reader=new NativeCatalogRead({gate,sessionOwner:()=>owner,now,accountEpoch:()=>epoch,profileEpoch:()=>0,fetchImpl:async(url,options)=>{
  requests++;assert.equal(options.method,'GET');assert.equal(options.redirect,'manual');assert.equal(options.credentials,'omit');
  return reply(url,options);
 }});
 const ledger=new LocalState(join(path,'ledger.json'));ledger.setPaused(false);
 const store=new WorkflowStore(join(path,'workflow.json'),{now});store.setFeature('dailyClaim',true);
 const daily=new DailyRunner({ledger,store,now,readDocpleAttendance:(...args)=>reader.readAttendance(...args),
  createPage:async()=>{pages++;return {load:async()=>{},call:async()=>({status:'pending',reason:'docple_current_month_calendar'}),close(){}};}});
 daily.siteWait=gate;daily.receiptContext=()=>epoch;
 return {pageCount:()=>pages,requestCount:()=>requests,cookieCount:()=>cookieReads,rotate:()=>epoch++,store,daily,reader,gate,ledger};
}
test('Docple catalogue recovery respects a new server wait without a second browser',async t=>{
 const s=setup(t,{reply:async()=>response({},429,{'retry-after':'600'})});
 let tokenAvailable=false,pages=0,logins=0,last;
 const runner=new CatalogRunner({now,gate:s.gate,store:{record:(_site,_date,row)=>{last=row;}},
  nativeRead:(...args)=>tokenAvailable?s.reader.read(...args):null,
  createPage:async()=>{pages++;return {open:async()=>{},read:async()=>({status:'login',events:[],done:true}),close(){}};},
  recoverLogin:async()=>{logins++;tokenAvailable=true;s.rotate();return true;}});
 await runner.start(date,['docple']);await runner.start(date,['docple']);
 assert.equal(last.reason,'site_wait');assert.equal(pages,1);assert.equal(logins,1);assert.equal(s.requestCount(),1);assert.equal(s.cookieCount(),1);
});
test('Docple attendance discards an obsolete account reply without updating history or opening a browser',async t=>{
 let deliver,requested;
 const began=new Promise(resolve=>{requested=resolve;});
 const s=setup(t,{reply:()=>new Promise(resolve=>{deliver=resolve;requested();})});
 const work=s.daily.run(['docple:attendance'],{readOnly:true});
 await began;s.rotate();deliver(response(complete()));await work;
 assert.equal(s.pageCount(),0);assert.equal(s.store.day(date).daily['docple:attendance'],undefined);
});
test('Docple pending calendar leaves the automatic claim on the browser path',async t=>{
 const s=setup(t,{reply:async()=>response({data:{yearMonth:'202611',attendedDates:[]}})});
 await s.daily.run(['docple:attendance']);
 assert.equal(s.requestCount(),1);assert.equal(s.pageCount(),1);
 assert.equal(s.store.day(date).daily['docple:attendance'].attempted,false);
 assert.equal(Object.keys(s.ledger.snapshot().jobs).length,0);
});
test('Docple already-open receipt records completion even during server wait without a fetch, page or claim',async t=>{
 const s=setup(t);let inspections=0;
 s.gate.observe('docple',{url:'https://docple-plus.com/offerwall/attendance',status:429,retryAfter:'600',document:true});
 await s.daily.run(['docple:attendance']);
 assert.equal(s.store.day(date).daily['docple:attendance'].reason,'site_wait');
 assert.equal(s.store.day(date).daily['docple:attendance'].waitUntil,now()+600000);
 s.daily.isManualOpen=()=>true;
 s.daily.readOpenDocpleAttendance=async day=>{assert.equal(day,date);inspections++;return true;};
 await s.daily.run(['docple:attendance'],{readOnly:true});
 assert.equal(s.store.day(date).daily['docple:attendance'].status,'complete');
 assert.equal(s.store.day(date).daily['docple:attendance'].attempted,false);
 assert.equal(inspections,1);
 assert.equal(s.requestCount(),0);
 assert.equal(s.cookieCount(),0);
 assert.equal(s.pageCount(),0);
 assert.equal(Object.keys(s.ledger.snapshot().jobs).length,0);
});
test('Docple complete fast read requires a single token and a matching clean calendar',async t=>{
 for(const names of [[],['accessToken','check-accessToken']]){
  const s=setup(t,{cookieNames:names});
  await s.daily.run(['docple:attendance'],{readOnly:true});assert.equal(s.requestCount(),0);assert.equal(s.pageCount(),1);
 }
 for(const reply of [
  ()=>response(complete(),302,{Location:'https://example.invalid/'}),
  ()=>response(complete(),401),
  ()=>response(complete(),200,{'Set-Cookie':'session=SYNTHETIC'}),
  ()=>response({data:{yearMonth:'202610',attendedDates:[date]}}),
  ()=>response({success:false,...complete()}),
  ()=>response({data:{yearMonth:'202611',attendedDates:[date,date]}}),
 ]){
  const s=setup(t,{reply});await s.daily.run(['docple:attendance'],{readOnly:true});
  assert.equal(s.requestCount(),1);assert.equal(s.pageCount(),1);assert.equal(s.store.day(date).daily['docple:attendance'].status,'pending');
 }
});
