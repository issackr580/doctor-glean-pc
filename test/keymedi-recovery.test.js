import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runInNewContext} from 'node:vm';
import {CredentialRunner} from '../src/credential-runner.js';
import {CredentialAttempts} from '../src/credential-attempts.js';

const helper=readFileSync(new URL('../vendor/credentials/credential-background-keymedi-proof.js',import.meta.url),'utf8');
const api='https://api.keymedi.com/api/member/getMyInfo';

async function recover(t,{sameDocument=true,responseStatus=200,member=true}={}){
  const directory=mkdtempSync(join(tmpdir(),'pc-keymedi-recovery-'));
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const attempts=new CredentialAttempts(join(directory,'attempts.json'));
  let now=Date.now(),submissions=0,memberReads=0,decryptions=0;
  const location={href:'https://www.keymedi.com/login'},document={readyState:'complete'};
  const window={localStorage:{getItem:key=>key==='access_token'?'SYNTHETIC_ACCESS_TOKEN':null}};
  window.top=window.self=window;
  window.fetch=async(url,options)=>{
    memberReads++;
    assert.equal(url,api);
    assert.equal(options.credentials,'omit');
    assert.equal(options.redirect,'error');
    assert.equal(attempts.data.sites.keymedi.status,'submitted');
    return {url:api,redirected:false,status:responseStatus,ok:responseStatus===200,
      text:async()=>JSON.stringify({code:0,data:{info:member?{name:'SYNTHETIC_MEMBER'}:{}}})};
  };
  const proof=runInNewContext(helper,{window,document,location,URL,AbortController,setTimeout,clearTimeout});
  const page={
    version:1,closed:false,route:'login',
    get url(){return location.href;},
    async load(url){location.href=url;},
    async call(name,[input,domReply]){
      if(name==='credential-background-keymedi-proof.js')return proof(input,domReply);
      if(input.mode==='probe')return {status:'ready'};
      if(input.mode==='fill'){
        submissions++;
        assert.equal(attempts.data.sites.keymedi.status,'submitted');
        location.href='https://www.keymedi.com/';this.route='home';
        if(sameDocument)document.__webinarCredentialLoginV1={validation:false,site:'keymedi',nonce:input.nonce,submitted:true};
        else this.version++;
        return {status:'submitted',submitted:true};
      }
      return {status:'unknown',submitted:false,evidence:{observed:true,loginShown:false,passwordShown:false,logoutShown:false}};
    }
  };
  const runner=new CredentialRunner({attempts,now:()=>now,sleep:async ms=>{now+=ms;await new Promise(resolve=>setImmediate(resolve));}});
  const result=await runner.run('keymedi',page,{automatic:true,signal:new AbortController().signal,
    readCredentials:()=>{decryptions++;return {id:'SYNTHETIC_USER',password:'SYNTHETIC_PASSWORD'};}});
  assert.equal(submissions,1);
  assert.equal(decryptions,1);
  assert.doesNotMatch(JSON.stringify(result)+JSON.stringify(attempts.snapshot()),/SYNTHETIC_|Bearer|https:/);
  return {result,memberReads,attempts};
}

test('saved Keymedi recovery verifies one server member response after a same-document login',async t=>{
  const {result,memberReads}=await recover(t);
  assert.equal(result.status,'authenticated');
  assert.equal(memberReads,1);
  assert.ok(result.trace.some(row=>row.authEvidenceSource==='keymedi_background_member'));
});

test('saved Keymedi recovery verifies one server member response after a full navigation',async t=>{
  const {result,memberReads}=await recover(t,{sameDocument:false});
  assert.equal(result.status,'authenticated');
  assert.equal(memberReads,1);
});

test('a Keymedi token or destination without a valid server member response never authenticates or retries',async t=>{
  for(const options of [{responseStatus:401},{member:false}]){
    const {result,memberReads,attempts}=await recover(t,options);
    assert.equal(result.status,'time_limit');
    assert.equal(memberReads,1);
    assert.equal(attempts.decision('keymedi',attempts.data.sites.keymedi.at+60001,false,true),'disabled');
  }
});
