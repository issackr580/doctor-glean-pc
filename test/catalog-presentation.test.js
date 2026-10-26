import test from 'node:test';
import assert from 'node:assert/strict';
import {resultGroup,siteLabel,collectionSummary} from '../src/catalog-presentation.js';
const partial=count=>({status:'review',reason:'list_unconfirmed',coverage:false,stale:false,events:Array(count).fill({})});
test('the reported eight sites are split into six partial reads and two failures',()=>{
 const results={doctorville:partial(4),hmp:partial(2),medigate:partial(1),intermd:partial(0),ckd:partial(0),bluepharm:partial(0),keymedi:{status:'ok',coverage:true,events:[{}]},whodadoc:{status:'review',reason:'network_error',events:[]},dtalks:{status:'review',reason:'network_error',events:[]}};
 assert.equal(collectionSummary(results,Object.keys(results)),'조회 완료 1곳 · 전체 범위 미확인 6곳 · 조회 실패 2곳');
 assert.match(siteLabel(results.doctorville),/강의 4개 조회됨/);
 assert.doesNotMatch(siteLabel(results.intermd),/강의 없음|로그인 필요/);
});
test('a stale cached list cannot become a current complete result',()=>{
 const stale={status:'login',reason:'login_required',coverage:false,stale:true,events:[{}]};
 assert.equal(resultGroup(stale),'login');assert.match(siteLabel(stale),/저장된 목록.*로그인/);
 assert.equal(resultGroup({status:'ok',reason:'list_read',coverage:true,stale:true,events:[{}]}),'partial');
});
test('only selected sites contribute to the summary and a manual window stays actionable',()=>{
 assert.equal(collectionSummary({hmp:{status:'busy',events:[]}},['hmp']),'사이트 창 열림 1곳');
 assert.equal(collectionSummary({},['doctorville']),'미조회 1곳');
});
test('an engine review with checked list evidence is distinguished from an unconfirmed list',()=>{
 const read={...partial(4),coverage:true,scope:'list_checked'};
 assert.equal(resultGroup(read),'read');assert.match(siteLabel(read),/현재 목록 끝 확인/);
 assert.equal(resultGroup({...read,scope:'unconfirmed'}),'partial');
 assert.equal(resultGroup({...read,coverage:false}),'partial');
});
