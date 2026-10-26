import test from 'node:test';
import assert from 'node:assert/strict';
import {safeLoginState,loadFailure} from '../src/login-status.js';
test('unknown page output never becomes authentication or includes private text',()=>{
 for(const value of ['ready','cookie_present','username@example.invalid',{authenticated:true},null])assert.equal(safeLoginState(value),'not_confirmed');
 assert.equal(safeLoginState('authenticated'),'authenticated');
 assert.equal(safeLoginState('login_required'),'login_required');
});
test('browser failures preserve their fixed cause without leaking a URL or raw error',()=>{
 assert.equal(loadFailure(-105),'dns_error');assert.equal(loadFailure(-106),'offline');
 assert.equal(loadFailure(-202),'certificate_error');assert.equal(loadFailure(-118),'time_limit');
 assert.equal(loadFailure(-3),'navigation_cancelled');assert.equal(loadFailure('https://private.invalid/'),'load_failed');
});

test('fresh daily evidence supplements unknown labels but a later login failure takes precedence',async()=>{
 const {sessionWithDailyEvidence}=await import('../src/login-status.js');const now=Date.now(),manual={login:'not_confirmed',checkedAt:now-300000,load:'ready'};
 const daily={'intermd:quiz':{status:'complete',checkedAt:now-1000}};
 assert.equal(sessionWithDailyEvidence('intermd',manual,null,daily,now).authSource,'daily_receipt');
 assert.equal(sessionWithDailyEvidence('intermd',manual,{status:'login',checkedAt:now},daily,now),manual);
 assert.equal(sessionWithDailyEvidence('intermd',manual,null,daily,now+1800001),manual);
 assert.equal(sessionWithDailyEvidence('intermd',manual,null,{'intermd:quiz':{status:'pending',checkedAt:now}},now),manual);
});
