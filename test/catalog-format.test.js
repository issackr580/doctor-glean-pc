import test from 'node:test';
import assert from 'node:assert/strict';
import {formatPcSchedule} from '../src/catalog-format.js';
const date='2026-10-26';
test('copy includes only selected sites and never certifies failed empty pages',()=>{
 const text=formatPcSchedule(date,['doctorville'],{doctorville:{status:'login',coverage:false,events:[]}});
 assert.match(text,/미확인: 닥터빌/);assert.doesNotMatch(text,/한미|^조건에 맞는 강의 없음$|^강의 없음:/m);
});
test('compact schedule retains Hanmi grouping and manual registration status',()=>{
 const result={hmp:{status:'review',coverage:false,events:[
  {site:'hmp',date,time:'13:10',title:'미신청 강의',registrationStatus:'not_registered'},
  {site:'hmp',date,time:'13:10',title:'신청 강의',registrationStatus:'registered'},
 ]}};
 const text=formatPcSchedule(date,['hmp'],result);assert.match(text,/1310 한미\n/);assert.doesNotMatch(text,/한미2|미신청/);
});
test('stale lecture rows remain visible with an explicit saved-list warning',()=>{
 const result={doctorville:{status:'login',coverage:false,stale:true,events:[{site:'doctorville',date,time:'13:00',title:'저장 강의'}]}};
 const text=formatPcSchedule(date,['doctorville'],result);assert.match(text,/1300 닥빌/);assert.match(text,/저장된 목록: 닥터빌/);assert.match(text,/확인 완료 0\/1/);
});
test('the copied schedule distinguishes checked dates and current lists from unread or failed sites',()=>{
 const text=formatPcSchedule(date,['doctorville','hmp','whodadoc'],{doctorville:{status:'review',coverage:true,scope:'list_checked',events:[]},hmp:{status:'review',coverage:false,scope:'current_list_checked',events:[]},whodadoc:{status:'login',coverage:false,events:[]}});
 assert.match(text,/목록·날짜 확인 1곳.*현재 목록만 확인 1곳.*로그인 필요 1곳/);
 assert.match(text,/범위 확인: 닥터빌/);assert.match(text,/미확인: 후다닥/);assert.doesNotMatch(text,/미확인: 닥터빌/);
});
