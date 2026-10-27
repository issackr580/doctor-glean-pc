import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {CredentialVault} from '../src/credential-vault.js';
import {CredentialAttempts} from '../src/credential-attempts.js';
import {CredentialRunner} from '../src/credential-runner.js';
import {CredentialManager} from '../src/credential-manager.js';
import {credentialSite,allowedCredentialPage} from '../src/credential-policy.js';
import {atomicJson} from '../src/atomic-json.js';
const account={id:'SYNTHETIC_PRIVATE_ACCOUNT',password:'SYNTHETIC_PRIVATE_PASSWORD'};
test('an in-page provider detour requires two fresh ready probes before decrypting in the same document generation',async t=>{
 const s=setup(t),attempts=new CredentialAttempts(join(s.root,'fresh-probe.json'));let probes=0,state='first',canonical='';const began=s.now();
 const p=fakePage('doctorville',async(_name,[input])=>{if(input.mode==='probe'){probes++;return {status:'ready'};}if(input.mode==='fill'){assert.equal(probes,3);return {status:'submitted',submitted:true};}return {status:'authenticated'};});canonical=p.url;
 p.ready=async()=>{if(probes===1&&state==='first'){p.url='https://mims-account.shop.co.kr/login/direct?ot=PRIVATE';state='wait';}else if(state==='wait'&&s.now()-began>=650){p.url=canonical;state='restored';}};
 const r=await new CredentialRunner({...s,attempts}).run('doctorville',p,{signal:new AbortController().signal,readCredentials:()=>({...account})});assert.equal(r.status,'authenticated');assert.equal(probes,3);
});
test('explicit login requests use short edition gaps while automatic rolling limits remain',t=>{
 for(const developer of [false,true]){
  const s=setup(t),a=new CredentialAttempts(join(s.root,'manual.json'),{developer}),gap=developer?3000:10000;
  for(let i=0;i<3;i++){assert.equal(a.reserve('hmp',s.now()),'ready');a.finish('hmp','authenticated',s.now());assert.equal(a.retryAt('hmp',s.now()),s.now()+gap);s.advance(gap);}
  assert.equal(a.decision('hmp',s.now()),'ready');assert.equal(a.decision('hmp',s.now(),false,true),'cooldown');assert.ok(a.retryAt('hmp',s.now(),{automatic:true})>s.now());
 }
});
test('manual attempts retain daily limits and v1 history bounds across Korean midnight',t=>{
 const s=setup(t),a=new CredentialAttempts(join(s.root,'midnight-manual.json'),{developer:true}),start=Date.parse(kstDateForTest(s.now())+'T23:59:00+09:00');s.advance(start-s.now());
 for(let day=0;day<2;day++){
  if(day)s.advance(30000);
  for(let i=0;i<10;i++){assert.equal(a.reserve('hmp',s.now()),'ready');a.finish('hmp','authenticated',s.now());s.advance(3000);}
  assert.equal(a.decision('hmp',s.now()),'daily_limit');assert.equal(a.data.sites.hmp.attempts.filter(n=>kstDateForTest(n)===kstDateForTest(s.now())).length,10);
 }
 assert.equal(a.data.sites.hmp.attempts.length,13);assert.equal(new CredentialAttempts(a.file,{developer:true}).failed,false);
});
function kstDateForTest(at){return new Date(at+9*3600000).toISOString().slice(0,10);}
test('a waiting or daily-limited recovery can observe an existing session without a new submit lease',async t=>{
 for(const daily of [false,true]){
  const s=setup(t);let decrypted=0,pages=0;const protect=protector(),decrypt=protect.decrypt;protect.decrypt=bytes=>{decrypted++;return decrypt(bytes);};
  const m=new CredentialManager({directory:s.root,applicationId:'developer',developer:true,protect,automaticAllowed:()=>true,isManualOpen:()=>false,now:s.now,createPage:async site=>{pages++;return fakePage(site,async()=>({status:'authenticated'}));}});m.vault.save('hmp',account,true);
  for(let i=0;i<(daily?10:1);i++){m.attempts.reserve('hmp',s.now());m.attempts.finish('hmp','authenticated',s.now());if(daily)s.advance(3000);}
  const before=readFileSync(m.attempts.file,'utf8'),r=await m.recover('hmp');assert.equal(r.status,'authenticated');assert.equal(pages,1);assert.equal(decrypted,0);assert.equal(readFileSync(m.attempts.file,'utf8'),before);
 }
});
test('a waiting recovery may inspect a form but still cannot decrypt or submit before its short gap',async t=>{
 const s=setup(t);let decrypted=0,calls=0;const protect=protector(),decrypt=protect.decrypt;protect.decrypt=bytes=>{decrypted++;return decrypt(bytes);};
 const m=new CredentialManager({directory:s.root,applicationId:'developer',developer:true,protect,automaticAllowed:()=>true,isManualOpen:()=>false,now:s.now,createPage:async site=>fakePage(site,async()=>{calls++;return {status:'ready'};})});m.vault.save('hmp',account,true);m.attempts.reserve('hmp',s.now());m.attempts.finish('hmp','authenticated',s.now());
 m.runner.sleep=s.sleep;const r=await m.recover('hmp');assert.equal(r.status,'cooldown');assert.equal(decrypted,0);assert.equal(calls,2);assert.equal(r.retryAt,m.attempts.data.sites.hmp.attempts[0]+3000);
});
test('Doctorville waits passively for its asynchronous provider to reach the authenticated site without decrypting',async t=>{
 const s=setup(t),attempts=new CredentialAttempts(join(s.root,'settle.json'));let decrypted=0,calls=0;const began=s.now();
 const p=fakePage('doctorville',async()=>{calls++;if(!p.url.includes('doctorville.co.kr'))throw Object.assign(Error('policy'),{code:'policy_rejected'});return {status:'authenticated'};});p.load=async()=>{p.url='https://mims-account.shop.co.kr/login/direct?ot=PRIVATE';};p.ready=async()=>{if(s.now()-began>=700){p.url=credentialSite('doctorville').entry;p.version++;}};
 const r=await new CredentialRunner({...s,attempts}).run('doctorville',p,{signal:new AbortController().signal,readCredentials:()=>{decrypted++;return {...account};}});
 assert.equal(r.status,'authenticated');assert.equal(r.submitted,false);assert.equal(decrypted,0);assert.equal(calls,1);assert.ok(r.trace.some(row=>row.providerSettling));assert.doesNotMatch(JSON.stringify(r.trace),/PRIVATE|https:/);
});
test('Doctorville post-submit provider transition never replays a POST and keeps its original lease',async t=>{
 const s=setup(t),attempts=new CredentialAttempts(join(s.root,'settle-post.json'));let filled=0,at=0;
 const p=fakePage('doctorville',async(_name,[input])=>{if(input.mode==='probe')return {status:'ready'};if(input.mode==='fill'){filled++;at=s.now();p.url='https://mims-account.shop.co.kr/login/direct?ot=PRIVATE';return {status:'submitted',submitted:true};}if(!p.url.includes('doctorville.co.kr'))throw Object.assign(Error('policy'),{code:'policy_rejected'});return {status:'authenticated'};});p.ready=async()=>{if(filled&&s.now()-at>=700){p.url=credentialSite('doctorville').entry;p.version++;}};
 const r=await new CredentialRunner({...s,attempts}).run('doctorville',p,{signal:new AbortController().signal,readCredentials:()=>({...account})});
 assert.equal(r.status,'authenticated');assert.equal(filled,1);assert.equal(attempts.data.sites.doctorville.attempts.length,1);assert.equal(r.submitted,true);
});
test('provider wait is bounded, excludes candidates and bad callbacks, and can be cancelled without a secret',async t=>{
 for(const scenario of ['stuck','candidate','wrong_callback','foreign','cancel']){
  const s=setup(t),attempts=new CredentialAttempts(join(s.root,'bounded.json')),controller=new AbortController();let decrypted=0,slept=0;
  const p=fakePage('doctorville',async()=>{throw Object.assign(Error('policy'),{code:'policy_rejected'});});p.load=async()=>{p.url=scenario==='foreign'?'https://evil.invalid/':scenario==='wrong_callback'?'https://mims-account.shop.co.kr/login?cb=PRIVATE':'https://mims-account.shop.co.kr/login/direct?ot=PRIVATE';};
  const r=await new CredentialRunner({attempts,now:s.now,sleep:async ms=>{slept+=ms;await s.sleep(ms);if(scenario==='cancel')controller.abort();}}).run('doctorville',p,{validation:scenario==='candidate',signal:controller.signal,readCredentials:()=>{decrypted++;return {...account};}});
  assert.equal(r.status,scenario==='cancel'?'cancelled':'blocked');assert.equal(decrypted,0);assert.equal(r.attempted,false);assert.equal(slept,scenario==='stuck'?8000:scenario==='cancel'?400:0);
 }
});
test('provider route diagnostics emit reviewed categories without callback, one-time-token or path values',async()=>{
 const {credentialObservation}=await import('../src/credential-diagnostics.js');
 for(const [path,kind] of [['/login/direct?ot=PRIVATE','direct_login'],['/mypage/information?token=PRIVATE','profile_required'],['/PRIVATE','other']]){
  const r=credentialObservation('doctorville',{url:'https://mims-account.shop.co.kr'+path},'provider',{status:'loading',evidence:{providerSettling:true}},1);assert.equal(r.providerPath,kind);assert.equal(r.providerSettling,true);assert.doesNotMatch(JSON.stringify(r),/PRIVATE|https:|token|mypage/);
 }
});
function setup(t){const root=mkdtempSync(join(tmpdir(),'pc-credentials-'));t.after(()=>rmSync(root,{recursive:true,force:true}));let now=Date.now();return {root,now:()=>now,sleep:async ms=>{now+=ms;},advance:ms=>{now+=ms;}};}
// Test-only AES adapter. This is never used as a fallback for Windows DPAPI.
function protector(){const key=randomBytes(32);return {available:()=>true,encrypt:text=>{const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv),data=Buffer.concat([c.update(text),c.final()]);return Buffer.concat([iv,c.getAuthTag(),data]);},decrypt:bytes=>{const d=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));d.setAuthTag(bytes.subarray(12,28));return Buffer.concat([d.update(bytes.subarray(28)),d.final()]).toString();}};}
function fakePage(site,handler){return {url:credentialSite(site).url,version:1,closed:false,load:async function(url){this.url=url;this.version++;},call:handler,close(){this.closed=true;}};}
test('secure storage unavailable never writes or decrypts an account',t=>{const {root}=setup(t);let calls=0;const v=new CredentialVault(join(root,'v.json'),'developer',{available:()=>false,encrypt:()=>calls++,decrypt:()=>calls++});assert.throws(()=>v.save('hmp',account,true),/storage_unavailable/);assert.equal(calls,0);assert.equal(existsSync(join(root,'v.json')),false);});
test('vault round trip binds site and edition, preserves consent, and exports no secrets',t=>{const {root}=setup(t),file=join(root,'v.json'),protect=protector();const v=new CredentialVault(file,'developer',protect);v.save('hmp',account,false);assert.deepEqual(new CredentialVault(file,'developer',protect).read('hmp'),account);assert.equal(v.read('hmp',{automatic:true}),null);v.setAutomatic('hmp',true);assert.deepEqual(v.read('hmp',{automatic:true}),account);assert.doesNotMatch(readFileSync(file,'utf8')+JSON.stringify(v.snapshot()),/SYNTHETIC_PRIVATE/);assert.throws(()=>new CredentialVault(file,'distribution',protect),/storage_error/);v.remove('hmp');assert.equal(v.read('hmp'),null);});
test('ciphertext corruption fails closed and does not erase the previous file',t=>{const {root}=setup(t),file=join(root,'v.json'),v=new CredentialVault(file,'developer',protector());v.save('hmp',account,true);const d=JSON.parse(readFileSync(file));d.entries.hmp.ciphertext=Buffer.from('invalid-encrypted-record').toString('base64');writeFileSync(file,JSON.stringify(d));const original=readFileSync(file);assert.throws(()=>new CredentialVault(file,'developer',protector()).read('hmp'),/storage_error/);assert.deepEqual(readFileSync(file),original);});
test('vault write failure disables future decryption',t=>{const {root}=setup(t);const v=new CredentialVault(join(root,'v.json'),'developer',protector(),{commit:()=>{throw Error('disk_full');}});assert.throws(()=>v.save('hmp',account,true),/storage_error/);assert.equal(v.available(),false);});
test('reviewed routes reject lookalikes, credential URLs and wrong callbacks',()=>{for(const site of ['doctorville','keymedi','hmp','intermd','whodadoc','medigate','ckd','bluepharm','dtalks','docple'])assert.ok(allowedCredentialPage(site,credentialSite(site).url),site);for(const url of ['http://www.keymedi.com/login','https://www.keymedi.com.evil.test/login','https://user@www.keymedi.com/login','https://www.keymedi.com:444/login','https://www.keymedi.com/other'])assert.equal(allowedCredentialPage('keymedi',url),false);assert.equal(allowedCredentialPage('doctorville','https://mims-account.shop.co.kr/login?cb=https://evil.test/'),false);});
test('recovery decrypts only after a durable lease and current ready probe',async t=>{const s=setup(t),attempts=new CredentialAttempts(join(s.root,'a.json'));let decrypted=0,filled=0;const p=fakePage('hmp',async(_name,[input])=>{if(input.mode==='probe')return {status:'ready'};if(input.mode==='fill'){filled++;assert.equal(JSON.parse(readFileSync(join(s.root,'a.json'))).sites.hmp.status,'submitted');return {status:'submitted',submitted:true};}return {status:'authenticated'};});const r=await new CredentialRunner({...s,attempts}).run('hmp',p,{signal:new AbortController().signal,readCredentials:()=>{decrypted++;assert.equal(attempts.data.sites.hmp.status,'submitted');return {...account};}});assert.equal(r.status,'authenticated');assert.equal(filled,1);assert.equal(decrypted,1);assert.doesNotMatch(JSON.stringify(attempts.snapshot()),/SYNTHETIC_PRIVATE/);});
test('challenge and rejected forms receive no decrypted credentials',async t=>{for(const status of ['challenge','rejected','blocked','stale']){const s=setup(t),attempts=new CredentialAttempts(join(s.root,'a.json'));let reads=0;const p=fakePage('hmp',async()=>({status}));const r=await new CredentialRunner({...s,attempts}).run('hmp',p,{signal:new AbortController().signal,readCredentials:()=>{reads++;return account;}});assert.equal(reads,0);assert.equal(r.status,status);}});
test('a changed second probe cannot reuse earlier readiness',async t=>{const s=setup(t),attempts=new CredentialAttempts(join(s.root,'a.json'));let calls=0,reads=0;const p=fakePage('hmp',async()=>({status:++calls===1?'ready':'challenge'}));await new CredentialRunner({...s,attempts}).run('hmp',p,{signal:new AbortController().signal,readCredentials:()=>{reads++;return account;}});assert.equal(reads,0);assert.equal(Object.keys(attempts.data.sites).length,0);});
test('failed attempt persistence prevents both decryption and form submission',async t=>{const s=setup(t),attempts=new CredentialAttempts(join(s.root,'a.json'),{commit:()=>{throw Error('disk_full');}});let filled=0,decrypted=0;const p=fakePage('hmp',async(_name,[input])=>{if(input.mode==='fill')filled++;return {status:'ready'};});const r=await new CredentialRunner({...s,attempts}).run('hmp',p,{signal:new AbortController().signal,readCredentials:()=>{decrypted++;return account;}});assert.equal(r.status,'storage_error');assert.equal(decrypted,0);assert.equal(filled,0);});
test('unknown dispatch survives restart and blocks every automatic resubmission',async t=>{const s=setup(t),file=join(s.root,'a.json');let filled=0;const page=()=>fakePage('hmp',async(_name,[input])=>{if(input.mode==='fill'){filled++;throw Error('network_error');}return {status:'ready'};});await new CredentialRunner({...s,attempts:new CredentialAttempts(file)}).run('hmp',page(),{automatic:true,signal:new AbortController().signal,readCredentials:()=>({...account})});s.advance(20*60000);const r=await new CredentialRunner({...s,attempts:new CredentialAttempts(file)}).run('hmp',page(),{automatic:true,signal:new AbortController().signal,readCredentials:()=>({...account})});assert.equal(filled,1);assert.equal(r.status,'disabled');});
test('rejected credentials stay locked while candidate validation retains rate history',t=>{const s=setup(t),a=new CredentialAttempts(join(s.root,'a.json'));assert.equal(a.reserve('hmp',s.now()),'ready');a.finish('hmp','rejected',s.now());s.advance(61000);assert.equal(a.decision('hmp',s.now()),'disabled');assert.equal(a.reserve('hmp',s.now(),{validation:true}),'ready');a.finish('hmp','manual',s.now());s.advance(61000);assert.equal(a.decision('hmp',s.now()),'disabled');assert.equal(a.data.sites.hmp.attempts.length,2);a.reset('hmp');assert.equal(a.data.sites.hmp.attempts.length,2);});
test('rate limits and reversed clocks stay in force across explicit updates',t=>{const s=setup(t),a=new CredentialAttempts(join(s.root,'a.json'));for(let i=0;i<3;i++){assert.equal(a.reserve('hmp',s.now(),{automatic:true}),'ready');a.finish('hmp','authenticated',s.now());s.advance(61000);}a.reset('hmp');assert.equal(a.decision('hmp',s.now(),false,true),'cooldown');assert.equal(a.decision('hmp',s.now()-500000,false,true),'cooldown');});
test('candidate cannot be saved from an existing session without submission proof',async t=>{const s=setup(t),attempts=new CredentialAttempts(join(s.root,'a.json'));const p=fakePage('hmp',async()=>({status:'authenticated'}));const r=await new CredentialRunner({...s,attempts}).run('hmp',p,{candidate:account,validation:true,signal:new AbortController().signal});assert.equal(r.status,'manual');assert.equal(r.submitted,false);assert.equal(Object.keys(attempts.data.sites).length,0);});
test('manager validates in a unique temporary profile and stores only the same verified candidate',async t=>{const s=setup(t);let options,page;const m=new CredentialManager({directory:s.root,applicationId:'developer',protect:protector(),automaticAllowed:()=>true,isManualOpen:()=>false,now:s.now,createPage:async(site,_signal,o)=>{options=o;page=fakePage(site,async()=>({status:'ready'}));return page;}});m.runner.run=async(_site,_p,{candidate,validation})=>{assert.equal(validation,true);assert.deepEqual(candidate,account);return {status:'authenticated',submitted:true};};const r=await m.save('hmp',account.id,account.password,true);assert.equal(r.status,'saved');assert.equal(options.validation,true);assert.match(options.partition,/^credential-validation-/);assert.equal(options.partition.startsWith('persist:'),false);assert.deepEqual(m.vault.read('hmp'),account);assert.ok(page.closed);assert.doesNotMatch(JSON.stringify(m.snapshot()),/SYNTHETIC_PRIVATE|ciphertext/);});
test('failed replacement preserves encrypted credentials and does not clear rejection lock',async t=>{const s=setup(t);const m=new CredentialManager({directory:s.root,applicationId:'developer',protect:protector(),automaticAllowed:()=>true,isManualOpen:()=>false,now:s.now,createPage:async site=>fakePage(site,async()=>({status:'challenge'}))});m.vault.save('hmp',account,true);m.attempts.reserve('hmp',s.now());m.attempts.finish('hmp','rejected',s.now());m.runner.run=async()=>({status:'challenge'});await m.save('hmp','different','different',true);assert.deepEqual(m.vault.read('hmp'),account);assert.equal(m.attempts.data.sites.hmp.disabled,true);});
test('automatic recovery requires explicit consent, execution enabled and no manual window',async t=>{const s=setup(t);let paused=true,open=false,pages=0;const m=new CredentialManager({directory:s.root,applicationId:'developer',protect:protector(),automaticAllowed:()=>!paused,isManualOpen:()=>open,createPage:async()=>{pages++;throw Error();}});m.vault.save('hmp',account,false);await m.recover('hmp',{automatic:true});paused=false;await m.recover('hmp',{automatic:true});m.vault.setAutomatic('hmp',true);open=true;await m.recover('hmp',{automatic:true});assert.equal(pages,0);});
test('deleting a credential cancels its active recovery and removes its encrypted record',async t=>{const s=setup(t);let release;const m=new CredentialManager({directory:s.root,applicationId:'developer',protect:protector(),automaticAllowed:()=>true,isManualOpen:()=>false,createPage:async site=>fakePage(site,async()=>({status:'ready'}))});m.vault.save('hmp',account,true);m.runner.run=async(_site,_p,{signal})=>new Promise(resolve=>{release=()=>resolve({status:signal.aborted?'cancelled':'authenticated'});});const work=m.recover('hmp');await new Promise(resolve=>setImmediate(resolve));m.remove('hmp');release();await work;assert.equal(m.vault.has('hmp'),false);assert.equal(m.last.get('hmp').status,'cancelled');});

test('successful candidate validation permits one immediate active-profile recovery without resetting daily limits',t=>{const s=setup(t),a=new CredentialAttempts(join(s.root,'a.json'));assert.equal(a.reserve('hmp',s.now(),{validation:true}),'ready');a.finish('hmp','authenticated',s.now());a.reset('hmp');s.advance(1);assert.equal(a.reserve('hmp',s.now(),{automatic:true}),'ready');a.finish('hmp','authenticated',s.now());s.advance(1);assert.equal(a.decision('hmp',s.now(),false,true),'cooldown');assert.equal(a.data.sites.hmp.attempts.length,2);});

test('candidate authentication alone never unlocks a previously uncertain saved account',async t=>{const s=setup(t),a=new CredentialAttempts(join(s.root,'a.json'));let filled=false;const p=fakePage('hmp',async(_name,[input])=>{if(input.mode==='probe')return {status:'ready'};if(input.mode==='fill'){filled=true;return {status:'submitted',submitted:true};}return {status:'authenticated'};});const r=await new CredentialRunner({...s,attempts:a}).run('hmp',p,{candidate:account,validation:true,signal:new AbortController().signal});assert.equal(r.status,'authenticated');assert.equal(filled,true);s.advance(600000);assert.equal(new CredentialAttempts(join(s.root,'a.json')).decision('hmp',s.now(),false,true),'disabled');});

test('the rolling login limit retains previous-day attempts across Korean midnight',t=>{const s=setup(t);const initial=Date.parse(new Date(s.now()+9*3600000).toISOString().slice(0,10)+'T23:58:00+09:00');s.advance(initial-s.now());const a=new CredentialAttempts(join(s.root,'a.json'));for(let i=0;i<3;i++){assert.equal(a.reserve('hmp',s.now(),{automatic:true}),'ready');a.finish('hmp','authenticated',s.now());s.advance(61000);}assert.equal(a.data.sites.hmp.attempts.length,3);assert.equal(new CredentialAttempts(join(s.root,'a.json')).decision('hmp',s.now(),false,true),'cooldown');});

test('retry time gives the actual rolling-window boundary without clearing login attempts',t=>{const s=setup(t),a=new CredentialAttempts(join(s.root,'a.json')),first=s.now();for(let i=0;i<3;i++){a.reserve('hmp',s.now(),{automatic:true});a.finish('hmp','authenticated',s.now());s.advance(61000);}assert.equal(a.retryAt('hmp',s.now(),{automatic:true}),first+900000);assert.equal(a.data.sites.hmp.attempts.length,3);});
test('manager blocks a cooling-down request before opening another login page',async t=>{const s=setup(t);let pages=0;const m=new CredentialManager({directory:s.root,applicationId:'developer',protect:protector(),automaticAllowed:()=>true,isManualOpen:()=>false,now:s.now,createPage:async()=>{pages++;throw Error();}});m.attempts.reserve('hmp',s.now());m.attempts.finish('hmp','blocked',s.now());const result=await m.save('hmp',account.id,account.password,true);assert.equal(result.status,'cooldown');assert.equal(result.retryAt,s.now()+10000);assert.equal(pages,0);});
test('credential diagnostics project only fixed observations even from arbitrary provider text',async()=>{const {credentialObservation}=await import('../src/credential-diagnostics.js');const row=credentialObservation('dtalks',{url:'https://www.dtalks.kr/member/loginConfirm.do?token=SYNTHETIC_PRIVATE',version:3,route:'other',diagnostics:()=>({popupDenied:0,navigationBlocked:1,raw:'SYNTHETIC_PRIVATE'})},'verify',{status:'blocked',message:'SYNTHETIC_PRIVATE',evidence:{passwordShown:true,account:'SYNTHETIC_PRIVATE',authEvidenceSource:'none'}},10);assert.equal(row.originAllowed,true);assert.equal(row.navigationBlocked,1);assert.equal(row.passwordShown,true);assert.doesNotMatch(JSON.stringify(row),/SYNTHETIC_PRIVATE|https:|token|loginConfirm/);});
test('a pre-probe policy refusal retains a fixed failure and callback eligibility without reading credentials',async t=>{
 const s=setup(t),attempts=new CredentialAttempts(join(s.root,'policy.json'));let decrypted=0;
 const p=fakePage('doctorville',async()=>{throw Object.assign(Error('PRIVATE_PROVIDER_TEXT'),{code:'policy_rejected'});});p.load=async()=>{p.url='https://mims-account.shop.co.kr/login?cb=https://wrong.invalid/PRIVATE';};p.route='provider';
 const r=await new CredentialRunner({...s,attempts}).run('doctorville',p,{signal:new AbortController().signal,readCredentials:()=>{decrypted++;return account;}});
 assert.equal(r.trace.at(-1).failure,'policy_rejected');assert.equal(r.trace.at(-1).navigationAllowed,false);assert.equal(r.reads,0);assert.equal(decrypted,0);assert.doesNotMatch(JSON.stringify(r.trace),/PRIVATE|https:|wrong/);
});
test('Doctorville bare provider recovery rechecks one fixed site GET without decrypting an existing session',async t=>{
 const s=setup(t),attempts=new CredentialAttempts(join(s.root,'landing.json')),loads=[];let decrypted=0;
 const page=fakePage('doctorville',async(name)=>name==='credential-provider-landing.js'?{status:'ready',evidence:{providerLanding:true}}:{status:'authenticated'});
 page.load=async url=>{loads.push(url);page.url=loads.length===1?'https://mims-account.shop.co.kr/':url;page.version++;};
 const r=await new CredentialRunner({...s,attempts}).run('doctorville',page,{signal:new AbortController().signal,readCredentials:()=>{decrypted++;return {...account};}});
 assert.equal(r.status,'authenticated');assert.equal(r.attempted,false);assert.equal(decrypted,0);assert.equal(loads[1],credentialSite('doctorville').entry);assert.equal(loads.length,2);assert.equal(attempts.snapshot().sites.length,0);
});
test('Doctorville provider barrier and unreviewed paths never navigate to a session refresh or decrypt',async t=>{
 for(const url of ['https://mims-account.shop.co.kr/','https://mims-account.shop.co.kr/account','https://mims-account.shop.co.kr/login?cb=PRIVATE']){
  const s=setup(t),attempts=new CredentialAttempts(join(s.root,'barrier.json'));let loads=0,decrypted=0;
  const page=fakePage('doctorville',async name=>{if(name==='credential-provider-landing.js')return {status:'manual',evidence:{providerBarrier:true}};throw Object.assign(Error('PRIVATE'),{code:'policy_rejected'});});page.load=async()=>{loads++;page.url=url;};
  const r=await new CredentialRunner({...s,attempts}).run('doctorville',page,{signal:new AbortController().signal,readCredentials:()=>{decrypted++;return {...account};}});
  assert.ok(['manual','blocked'].includes(r.status));assert.equal(loads,1);assert.equal(decrypted,0);assert.doesNotMatch(JSON.stringify(r.trace),/PRIVATE|https:/);
 }
});
test('a persistent bare provider does not loop and candidate validation cannot use a cached site session',async t=>{
 for(const validation of [false,true]){
  const s=setup(t),attempts=new CredentialAttempts(join(s.root,'persistent.json'));let loads=0,landingReads=0;
  const page=fakePage('doctorville',async name=>{if(name==='credential-provider-landing.js'){landingReads++;return {status:'ready'};}throw Object.assign(Error('not eligible'),{code:'policy_rejected'});});page.load=async()=>{loads++;page.url='https://mims-account.shop.co.kr/';};
  const r=await new CredentialRunner({...s,attempts}).run('doctorville',page,{candidate:{...account},validation,signal:new AbortController().signal});
  assert.equal(r.status,'blocked');assert.equal(r.submitted,false);assert.equal(loads,validation?1:2);assert.equal(landingReads,validation?0:1);
 }
});
test('Doctorville never navigates a dispatched uncertain login through the pre-submit landing recovery',async t=>{
 const s=setup(t),attempts=new CredentialAttempts(join(s.root,'post.json'));let loads=0;
 const page=fakePage('doctorville',async(_name,[input])=>{if(input.mode==='probe')return {status:'ready'};if(input.mode==='fill'){page.url='https://mims-account.shop.co.kr/';page.version++;return {status:'submitted',submitted:true};}throw Object.assign(Error('policy'),{code:'policy_rejected'});});const load=page.load.bind(page);page.load=async url=>{loads++;await load(url);};
 const r=await new CredentialRunner({...s,attempts}).run('doctorville',page,{readCredentials:()=>({...account}),signal:new AbortController().signal});
 assert.equal(r.status,'unknown');assert.equal(r.submitted,true);assert.equal(loads,1);assert.equal(attempts.decision('doctorville',s.now(),false,true),'disabled');
});
test('Doctorville loads the working encoded manual entry and retains ready probes and durable submission',async t=>{
 const {siteById}=await import('../src/security.js'),s=setup(t),attempts=new CredentialAttempts(join(s.root,'canonical.json'));let loaded='',probes=0,decrypted=0;
 const p=fakePage('doctorville',async(_name,[input])=>{if(input.mode==='probe'){probes++;return {status:'ready'};}if(input.mode==='fill'){assert.equal(probes,2);return {status:'submitted',submitted:true};}return {status:'authenticated'};});
 p.load=async url=>{loaded=url;p.url=url;p.version++;};
 const result=await new CredentialRunner({...s,attempts}).run('doctorville',p,{signal:new AbortController().signal,readCredentials:()=>{decrypted++;assert.equal(attempts.data.sites.doctorville.status,'submitted');return {...account};}});
 assert.equal(loaded,siteById('doctorville').loginUrl);assert.equal(allowedCredentialPage('doctorville',loaded),true);assert.equal(result.status,'authenticated');assert.equal(decrypted,1);assert.equal(result.submitted,true);
});
test('Doctorville callback diagnostics distinguish only bounded URL shapes and never export their values',async()=>{
 const {credentialObservation}=await import('../src/credential-diagnostics.js');
 for(const [suffix,expected] of [['','missing'],['?cb=PRIVATE','mismatch'],['?cb=PRIVATE&cb=OTHER','repeated']]){
  const row=credentialObservation('doctorville',{url:'https://mims-account.shop.co.kr/login'+suffix,route:'provider'},'open',{status:'ready'},1);
  assert.equal(row.providerPath,'login');assert.equal(row.callbackState,expected);assert.doesNotMatch(JSON.stringify(row),/PRIVATE|OTHER|https:/);
 }
});
test('a policy refusal before submission is blocked while a dispatched refusal stays uncertain',async t=>{
 for(const submitted of [false,true]){
  const s=setup(t),attempts=new CredentialAttempts(join(s.root,'refusal.json'));let decrypted=0;
  const p=fakePage('doctorville',async(_name,[input])=>{if(submitted&&input.mode==='probe')return {status:'ready'};throw Object.assign(Error('PRIVATE'),{code:'policy_rejected'});});
  const r=await new CredentialRunner({...s,attempts}).run('doctorville',p,{signal:new AbortController().signal,readCredentials:()=>{decrypted++;return {...account};}});
  assert.equal(r.status,submitted?'unknown':'blocked');assert.equal(decrypted,submitted?1:0);assert.equal(r.trace.at(-1).failure,'policy_rejected');
 }
});
test('readiness is awaited before capturing the redirected verification URL',async t=>{const s=setup(t),a=new CredentialAttempts(join(s.root,'a.json'));let filled=false,settled=false;const p=fakePage('dtalks',async(_name,[input])=>{if(input.mode==='probe')return {status:'ready'};if(input.mode==='fill'){filled=true;return {status:'submitted',submitted:true};}assert.equal(settled,true);assert.equal(input.expectedUrl,'https://www.dtalks.kr/websim/vodList.do');return {status:'authenticated'};});p.ready=async()=>{if(filled&&!settled){p.url='https://www.dtalks.kr/websim/vodList.do';p.version++;settled=true;}};const r=await new CredentialRunner({...s,attempts:a}).run('dtalks',p,{candidate:account,validation:true,signal:new AbortController().signal});assert.equal(r.status,'authenticated');});

test('a settled Dtalks POST result reads the fixed protected catalog once without another POST',async t=>{
 const clock=setup(t),attempts=new CredentialAttempts(join(clock.root,'a.json'));let posts=0,catalogs=0;
 const page=fakePage('dtalks',async(_name,[input])=>{
  if(input.mode==='probe')return {status:'ready'};
  if(input.mode==='fill'){posts++;page.url='https://www.dtalks.kr/member/loginConfirm.do';page.version++;return {status:'submitted',submitted:true};}
  return page.url===credentialSite('dtalks').entry?{status:'authenticated'}:{status:'unknown',evidence:{observed:true,loginShown:false,passwordShown:false,logoutShown:false}};
 });const load=page.load.bind(page);page.load=async url=>{if(url===credentialSite('dtalks').entry)catalogs++;await load(url);};
 const result=await new CredentialRunner({attempts,now:clock.now,sleep:clock.sleep}).run('dtalks',page,{candidate:{...account},validation:true,signal:new AbortController().signal});
 assert.equal(result.status,'authenticated');assert.equal(posts,1);assert.equal(catalogs,1);assert.ok(result.trace.some(row=>row.phase==='refresh'&&row.route==='login_result'));assert.ok(result.trace.some(row=>row.phase==='fill'));
});
test('a Dtalks result destination alone never validates the account or repeats its submission',async t=>{
 const clock=setup(t),attempts=new CredentialAttempts(join(clock.root,'a.json'));let posts=0,catalogs=0;
 const page=fakePage('dtalks',async(_name,[input])=>{
  if(input.mode==='probe')return {status:'ready'};
  if(input.mode==='fill'){posts++;page.url='https://www.dtalks.kr/member/loginConfirm.do';page.version++;return {status:'submitted',submitted:true};}
  return page.url===credentialSite('dtalks').entry?{status:'login_required'}:{status:'unknown',evidence:{observed:true,loginShown:false,passwordShown:false,logoutShown:false}};
 });const load=page.load.bind(page);page.load=async url=>{if(url===credentialSite('dtalks').entry)catalogs++;await load(url);};
 const result=await new CredentialRunner({attempts,now:clock.now,sleep:clock.sleep}).run('dtalks',page,{candidate:{...account},validation:true,signal:new AbortController().signal});
 assert.equal(result.status,'login_required');assert.equal(posts,1);assert.equal(catalogs,1);
});
test('an explicit Dtalks challenge is preserved without navigating it away',async t=>{
 const clock=setup(t),attempts=new CredentialAttempts(join(clock.root,'a.json'));let catalogs=0;
 const page=fakePage('dtalks',async(_name,[input])=>{
  if(input.mode==='probe')return {status:'ready'};
  if(input.mode==='fill'){page.url='https://www.dtalks.kr/member/loginConfirm.do';page.version++;return {status:'submitted',submitted:true};}
  return {status:'challenge'};
 });const load=page.load.bind(page);page.load=async url=>{if(url===credentialSite('dtalks').entry)catalogs++;await load(url);};
 const result=await new CredentialRunner({attempts,now:clock.now,sleep:clock.sleep}).run('dtalks',page,{candidate:{...account},validation:true,signal:new AbortController().signal});
 assert.equal(result.status,'challenge');assert.equal(catalogs,0);
});
test('repeated credential observations preserve the original probe and submit sequence',async()=>{
 const {recordCredentialObservation}=await import('../src/credential-diagnostics.js');const rows=[];
 for(const phase of ['open','probe','fill'])recordCredentialObservation(rows,{phase,status:'ready',elapsedMs:1});
 for(let i=1;i<=126;i++)recordCredentialObservation(rows,{phase:'verify',status:'unknown',elapsedMs:i*350});
 recordCredentialObservation(rows,{phase:'finish',status:'time_limit',elapsedMs:46000});
 assert.deepEqual(rows.map(row=>row.phase),['open','probe','fill','verify','finish']);assert.equal(rows[3].samples,126);assert.equal(rows[3].firstElapsedMs,350);assert.equal(rows[3].elapsedMs,44100);
 for(let i=0;i<100;i++)recordCredentialObservation(rows,{phase:'verify',status:i%2?'loading':'unknown',elapsedMs:47000+i});
 assert.ok(rows.length<=32);assert.deepEqual(rows.slice(0,3).map(row=>row.phase),['open','probe','fill']);
});
test('a provider client-format notice stops candidate verification without saving its account',async t=>{
 const clock=setup(t),attempts=new CredentialAttempts(join(clock.root,'a.json'));
 const page=fakePage('doctorville',async(name,[input])=>{
  if(name==='credential-page-state.js')return {status:'manual',detail:'input_format',evidence:{clientValidationError:true}};
  if(input.mode==='probe')return {status:'ready'};
  if(input.mode==='fill')return {status:'submitted',submitted:true};
  return {status:'unknown',evidence:{observed:true,loginShown:true,passwordShown:true}};
 });const result=await new CredentialRunner({attempts,now:clock.now,sleep:clock.sleep}).run('doctorville',page,{candidate:{...account},validation:true,signal:new AbortController().signal});
 assert.equal(result.status,'manual');assert.equal(result.detail,'input_format');assert.ok(result.elapsedMs<5000);assert.ok(result.trace.some(row=>row.clientValidationError));
});
test('credential network counters recognize only the reviewed exact endpoints',async()=>{
 const {isCredentialRequest}=await import('../src/credential-policy.js');
 assert.ok(isCredentialRequest('doctorville','https://mims-account.shop.co.kr/apis/auth/login'));
 assert.ok(isCredentialRequest('dtalks','https://www.dtalks.kr/member/loginConfirm.do'));
 for(const url of ['https://mims-account.shop.co.kr.evil.invalid/apis/auth/login','http://mims-account.shop.co.kr/apis/auth/login','https://mims-account.shop.co.kr/apis/auth/login?password=private','https://user:pass@mims-account.shop.co.kr/apis/auth/login'])assert.equal(isCredentialRequest('doctorville',url),false);
 assert.equal(isCredentialRequest('keymedi','https://mims-account.shop.co.kr/apis/auth/login'),false);
});
test('provider supplementation still coalesces unchanged polling and retains initial dispatch evidence',async t=>{
 const clock=setup(t),attempts=new CredentialAttempts(join(clock.root,'a.json'));
 const page=fakePage('doctorville',async(name,[input])=>{
  if(name==='credential-page-state.js')return {status:'unknown',evidence:{clientValidationError:false}};
  if(input.mode==='probe')return {status:'ready'};
  if(input.mode==='fill')return {status:'submitted',submitted:true};
  return {status:'unknown',evidence:{observed:true,loginShown:true,passwordShown:true}};
 });const result=await new CredentialRunner({attempts,now:clock.now,sleep:clock.sleep}).run('doctorville',page,{candidate:{...account},validation:true,signal:new AbortController().signal});
 assert.equal(result.status,'time_limit');assert.ok(result.trace.length<8);assert.ok(result.trace.some(row=>row.phase==='fill'));assert.ok(result.trace.some(row=>row.phase==='provider'&&row.samples>100));
});
