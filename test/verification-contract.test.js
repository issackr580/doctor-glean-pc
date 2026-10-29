import test from 'node:test';
import assert from 'node:assert/strict';
import {verificationComplete} from '../scripts/verification-contract.mjs';
const report=()=>({schemaVersion:1,scope:'pc_source_synthetic',before:{sourceSha256:'a'.repeat(64),environmentSha256:'b'.repeat(64)},after:{sourceSha256:'a'.repeat(64),environmentSha256:'b'.repeat(64)},stages:['node','syntax','catalog','automation','credentials','entry','replay'].map(name=>({name,status:'passed',checks:1}))});
test('only a full matching-input verification is complete',()=>{assert.equal(verificationComplete(report()),true);for(const mutate of [r=>r.stages.pop(),r=>{r.stages[0].status='failed';},r=>{r.stages[1].status='skipped';},r=>{r.stages[2].checks=0;},r=>{r.after.sourceSha256='c'.repeat(64);},r=>{r.after.environmentSha256='c'.repeat(64);},r=>{r.stages.push(r.stages[0]);}]){const r=report();mutate(r);assert.equal(verificationComplete(r),false);}});
