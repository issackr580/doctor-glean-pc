import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {CredentialRunner} from '../src/credential-runner.js';
import {CredentialAttempts} from '../src/credential-attempts.js';
import {CredentialManager} from '../src/credential-manager.js';
import {credentialSite,isCredentialRequest} from '../src/credential-policy.js';
import {inspectDocpleSession} from '../src/credential-session.js';

function setup(t){
 const directory=mkdtempSync(join(tmpdir(),'pc-profile-recovery-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));
 let now=Date.now();return {directory,now:()=>now,sleep:async ms=>{now+=ms;}};
}
const observed={observed:true,loginShown:true,passwordShown:true,logoutShown:false};
// Test-only encryption; production continues to require Windows DPAPI.
function protector(){const key=randomBytes(32);return {available:()=>true,encrypt:text=>{const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv),data=Buffer.concat([c.update(text),c.final()]);return Buffer.concat([iv,c.getAuthTag(),data]);},decrypt:bytes=>{const d=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));d.setAuthTag(bytes.subarray(12,28));return Buffer.concat([d.update(bytes.subarray(28)),d.final()]).toString();}};}

test('CKD collection commits a daily lease before one original logout and one credential dispatch',async t=>{
 const clock=setup(t);let manager,logged=true,logouts=0,posts=0,pages=0;
 const createPage=async()=>{pages++;return {url:'',version:0,closed:false,async load(url){this.url=url;this.version++;},async call(_name,[input]){
  if(input.mode==='ckd_logout'){assert.equal(manager.dailyFuses.summary().ckd.outcome,'started');assert.equal(input.ckdFreshCollection,true);logouts++;logged=false;this.version++;return {status:'pending'};}
  if(input.mode==='fill'){assert.equal(manager.attempts.data.sites.ckd.status,'submitted');assert.equal(manager.dailyFuses.summary().ckd.outcome,'started');posts++;logged=true;this.url=credentialSite('ckd').entry;this.version++;return {status:'submitted',submitted:true};}
  return {status:logged?'authenticated':'ready',evidence:{observed:true,logoutShown:logged,passwordShown:!logged}};
 },close(){this.closed=true;}};};
 manager=new CredentialManager({directory:clock.directory,applicationId:'synthetic.pc',protect:protector(),createPage,automaticAllowed:()=>true,isManualOpen:()=>false,now:clock.now});manager.runner.sleep=clock.sleep;
 manager.vault.save('ckd',{id:'SYNTHETIC',password:'SYNTHETIC'},true,clock.now());await manager.prepareCollection('ckd',new AbortController().signal);
 assert.equal(logouts,1);assert.equal(posts,1);assert.equal(manager.dailyFuses.summary().ckd.outcome,'authenticated');assert.equal(manager.dailyFuses.summary().ckd.submitted,true);
 await manager.prepareCollection('ckd',new AbortController().signal);assert.equal(pages,1);assert.equal(logouts,1);assert.equal(posts,1);
});
test('CKD fresh-login lease unavailable before credential fill does not reset quota or create another logout',async t=>{
 const clock=setup(t);let logouts=0;
 const manager=new CredentialManager({directory:clock.directory,applicationId:'synthetic.pc',protect:protector(),automaticAllowed:()=>true,isManualOpen:()=>false,now:clock.now,createPage:async()=>({url:'',version:1,async load(url){this.url=url;},async call(_name,[input]){if(input.mode==='ckd_logout'){logouts++;return {status:'manual'};}return {status:'authenticated'};},close(){}})});manager.runner.sleep=clock.sleep;manager.vault.save('ckd',{id:'SYNTHETIC',password:'SYNTHETIC'},true,clock.now());
 manager.attempts.reserve('ckd',clock.now(),{automatic:true});manager.attempts.finish('ckd','authenticated',clock.now());await manager.prepareCollection('ckd',new AbortController().signal);assert.equal(manager.dailyFuses.summary().ckd,null);assert.equal(logouts,0);await clock.sleep(61001);
 await manager.prepareCollection('ckd',new AbortController().signal);assert.equal(manager.dailyFuses.summary().ckd.outcome,'unavailable');assert.equal(manager.dailyFuses.summary().ckd.submitted,false);assert.equal(manager.attempts.data.sites.ckd.attempts.length,1);assert.equal(manager.attempts.data.sites.ckd.status,'authenticated');
 await manager.prepareCollection('ckd',new AbortController().signal);assert.equal(logouts,1);
});

test('Whodadoc rereads only the fixed PC entry after a submitted auth response and blocked destination',async t=>{
 for(const authenticated of [true,false]){
  const clock=setup(t),attempts=new CredentialAttempts(join(clock.directory,'attempts.json'));let posts=0,entries=0;
  const page={version:1,closed:false,url:'',async load(url){this.url=url;this.version++;if(url===credentialSite('whodadoc').entry)entries++;},
   diagnostics:()=>({navigationBlocked:posts,credentialNetworkEnabled:true,credentialRequests:posts,credentialResponses:posts,credentialHttpStatus:200}),
   async call(_name,[input]){
    if(input.mode==='probe')return {status:'ready'};
    if(input.mode==='fill'){posts++;return {status:'submitted',submitted:true};}
    return authenticated&&entries?{status:'authenticated'}:{status:'login_required',evidence:observed};
   }};
  const result=await new CredentialRunner({attempts,...clock}).run('whodadoc',page,{readCredentials:()=>({id:'SYNTHETIC',password:'SYNTHETIC'}),signal:new AbortController().signal});
  assert.equal(result.status,authenticated?'authenticated':'login_required');assert.equal(posts,1);assert.equal(entries,1);
 }
});

test('Whodadoc missing auth response or a challenge cannot trigger the protected reread',async t=>{
 for(const status of ['login_required','challenge']){
  const clock=setup(t),attempts=new CredentialAttempts(join(clock.directory,'attempts.json'));let entries=0,posts=0;
  const page={version:1,closed:false,url:'',async load(url){this.url=url;if(url===credentialSite('whodadoc').entry)entries++;},
   diagnostics:()=>({navigationBlocked:1,credentialNetworkEnabled:true,credentialRequests:1,credentialResponses:status==='challenge'?1:0,credentialHttpStatus:200}),
   async call(_name,[input]){if(input.mode==='probe')return {status:'ready'};if(input.mode==='fill'){posts++;return {status:'submitted',submitted:true};}return {status,evidence:observed};}};
  const result=await new CredentialRunner({attempts,...clock}).run('whodadoc',page,{readCredentials:()=>({id:'SYNTHETIC',password:'SYNTHETIC'}),signal:new AbortController().signal});
  assert.equal(result.status,status);assert.equal(entries,0);assert.equal(posts,1);
 }
 assert.ok(isCredentialRequest('whodadoc','https://hcp.whodadoc.com/auth/login'));
 for(const url of ['https://mhcp.whodadoc.com/auth/login','http://hcp.whodadoc.com/auth/login','https://hcp.whodadoc.com/auth/login?token=private'])assert.equal(isCredentialRequest('whodadoc',url),false);
});

test('Docple requires a current protected calendar response after its SPA logout label',async t=>{
 for(const serverStatus of ['pending','login','unknown']){
  const clock=setup(t),attempts=new CredentialAttempts(join(clock.directory,'attempts.json'));let posts=0,protectedReads=0;
  const page={version:1,closed:false,url:'',async load(url){this.url=url;this.version++;if(url===credentialSite('docple').entry)protectedReads++;},
   async call(name,[input]){
    if(name==='credential-docple-session.js'){
     assert.equal(input.autoClaim,false);assert.equal(input.phase,undefined);
     return serverStatus==='pending'?{status:'authenticated',evidence:{authEvidenceSource:'docple_server_calendar'}}:{status:serverStatus==='login'?'login_required':'unknown'};
    }
    if(input.mode==='probe')return {status:'ready'};
    if(input.mode==='fill'){posts++;this.url='https://docple-plus.com/';return {status:'submitted',submitted:true};}
    return {status:'authenticated',evidence:{observed:true,loginShown:false,passwordShown:false}};
   }};
  const result=await new CredentialRunner({attempts,...clock}).run('docple',page,{readCredentials:()=>({id:'SYNTHETIC',password:'SYNTHETIC'}),signal:new AbortController().signal});
  assert.equal(result.status,serverStatus==='pending'?'authenticated':serverStatus==='login'?'login_required':'time_limit');
  assert.equal(posts,1);assert.equal(protectedReads,1);
  if(serverStatus==='pending')assert.ok(result.trace.some(row=>row.authEvidenceSource==='docple_server_calendar'));
 }
});

test('a still-authenticated Docple task does not start another recovery during cooldown',async t=>{
 const clock=setup(t);let recoveries=0;
 const manager=new CredentialManager({directory:clock.directory,applicationId:'developer',protect:protector(),automaticAllowed:()=>true,isManualOpen:()=>false,now:clock.now,createPage:async()=>{recoveries++;throw Error('unexpected_recovery');}});
 manager.vault.save('docple',{id:'SYNTHETIC',password:'SYNTHETIC'},true);
 manager.attempts.reserve('docple',clock.now());manager.attempts.finish('docple','authenticated',clock.now());
 const page={version:1,closed:false,signal:new AbortController().signal,url:'',async load(url){this.url=url;this.version++;},
  async call(name){return name==='credential-docple-session.js'?{status:'authenticated',evidence:{authEvidenceSource:'docple_server_calendar'}}:{status:'login_required',evidence:{passwordShown:false}};}};
 await manager.wrapPage('docple',page).load(credentialSite('docple').entry);
 assert.equal(recoveries,0);assert.equal(manager.last.get('docple'),undefined);assert.equal(manager.attempts.data.sites.docple.attempts.length,1);
});

test('a Docple calendar result from a replaced document never authenticates the task',async()=>{
 const page={version:1,closed:false,url:credentialSite('docple').entry,async call(){this.version++;return {status:'authenticated',evidence:{authEvidenceSource:'docple_server_calendar'}};}};
 assert.equal((await inspectDocpleSession(page)).status,'stale');
});
