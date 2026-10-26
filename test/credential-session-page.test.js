import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {credentialDocpleSession} from '../src/credential-session-page.js';
import {kstDate} from '../src/schedule.js';

const api='https://docple-plus.com/api/season2/mission/attendance/calendar',url='https://docple-plus.com/offerwall/attendance';
async function fixture(overrides={}){
 const document={readyState:'complete',cookie:'accessToken=SYNTHETIC_TOKEN'},location={href:url};let reads=0;
 const window={fetch:async(target,options)=>{
  reads++;assert.equal(target,api);assert.equal(options.method,'GET');assert.equal(options.credentials,'same-origin');assert.equal(options.redirect,'error');
  return {url:api,redirected:false,status:200,ok:true,text:async()=>JSON.stringify({data:{yearMonth:kstDate().slice(0,7).replace('-',''),attendedDates:[]}}),...overrides};
 }};window.top=window.self=window;
 const proof=runInNewContext('('+credentialDocpleSession.toString()+')',{document,location,window,AbortController,setTimeout,clearTimeout});
 const input={site:'docple',mode:'verify',nonce:'synthetic_docple_operation_1234',pageTag:'1:1',expectedUrl:url,kind:'attendance',autoClaim:false,attempted:false,date:kstDate()};
 assert.equal(proof(input).status,'loading');await new Promise(resolve=>setImmediate(resolve));
 return {document,location,input,proof,reads:()=>reads};
}
test('Docple session proof accepts only one current, successful and well-formed protected calendar response',async()=>{
 for(const response of [{},{status:401,ok:false},{status:403,ok:false},{redirected:true},{url:'https://other.example.invalid/'},{text:async()=>'{invalid'},{text:async()=>JSON.stringify({data:{yearMonth:'200001',attendedDates:[]}})},{text:async()=>JSON.stringify({data:{yearMonth:kstDate().slice(0,7).replace('-',''),attendedDates:[kstDate(),kstDate()]}})}]){
  const f=await fixture(response),result=f.proof(f.input);
  assert.equal(result.status,Object.keys(response).length===0?'authenticated':response.status===401?'login_required':'unknown');
  f.proof(f.input);assert.equal(f.reads(),1);assert.doesNotMatch(JSON.stringify(result),/SYNTHETIC_|https:|Bearer/);
 }
});
test('Docple session proof permanently invalidates on token replacement and never follows a new document',async()=>{
 const f=await fixture();assert.equal(f.proof(f.input).status,'authenticated');
 f.document.cookie='accessToken=SYNTHETIC_OTHER';assert.equal(f.proof(f.input).status,'stale');
 f.document.cookie='accessToken=SYNTHETIC_TOKEN';assert.equal(f.proof(f.input).status,'stale');assert.equal(f.reads(),1);
 f.location.href='https://docple-plus.com/auth/login';assert.equal(f.proof(f.input).status,'unknown');assert.equal(f.reads(),1);
});
