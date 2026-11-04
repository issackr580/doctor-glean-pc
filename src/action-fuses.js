import {atomicJson,readJson} from './atomic-json.js';
import {kstDate} from './schedule.js';
const integer=(v,max=1e15)=>Number.isSafeInteger(v)&&v>=0&&v<=max;
const quizId=v=>Number.isSafeInteger(v)&&v>0&&v<=2147483647;
function valid(d){return d?.schemaVersion===1&&Object.keys(d).sort().join('|')==='ckd|quizzes|schemaVersion'&&d.quizzes&&typeof d.quizzes==='object'&&!Array.isArray(d.quizzes)&&Object.keys(d.quizzes).length<=256&&Object.entries(d.quizzes).every(([id,r])=>quizId(Number(id))&&r&&integer(r.spent,2)&&typeof r.pending==='boolean'&&typeof r.closed==='boolean'&&/^[a-zA-Z0-9-]{16,64}$/.test(r.operation))&&(d.ckd===null||d.ckd&&integer(d.ckd.claimedAt)&&integer(d.ckd.updatedAt)&&d.ckd.updatedAt>=d.ckd.claimedAt&&kstDate(d.ckd.claimedAt)===d.ckd.date&&typeof d.ckd.submitted==='boolean'&&['started','authenticated','unavailable','unknown'].includes(d.ckd.outcome));}
// Mandatory action storage, independent of diagnostic history and daily cache.
export class ActionFuses{
 constructor(file,{commit=atomicJson}={}){Object.assign(this,{file,commit});this.failed=false;this.data=readJson(file,{schemaVersion:1,quizzes:{},ckd:null},valid);}
 save(next){if(!valid(next))throw Error('storage_error');try{this.commit(this.file,next);this.data=next;}catch{this.failed=true;throw Error('storage_error');}}
 reserveQuiz(id,server,operation){
  const r=this.data.quizzes[id];if(this.failed||!quizId(id)||!integer(server,1)||r&&(r.pending||r.closed||r.spent>=2||server<r.spent)||!r&&Object.keys(this.data.quizzes).length>=256)return false;
  const next=structuredClone(this.data);next.quizzes[id]={spent:Math.max(server,r?.spent??0)+1,pending:true,closed:false,operation};this.save(next);return true;
 }
 settleQuiz(id,operation,outcome){const r=this.data.quizzes[id];if(!r?.pending||r.operation!==operation||!['complete','wrong'].includes(outcome))return false;const next=structuredClone(this.data);next.quizzes[id]={...r,pending:false,closed:outcome==='complete'};this.save(next);return true;}
 claimCkd(now){if(this.failed||this.data.ckd&&this.data.ckd.date>=kstDate(now))return false;const next=structuredClone(this.data);next.ckd={date:kstDate(now),claimedAt:now,updatedAt:now,outcome:'started',submitted:false};this.save(next);return true;}
 finishCkd(claimedAt,result,now){const r=this.data.ckd;if(r?.claimedAt!==claimedAt||r.outcome!=='started'||kstDate(now)!==r.date)return false;const next=structuredClone(this.data);next.ckd={...r,updatedAt:now,outcome:result.status==='authenticated'&&result.submitted?'authenticated':result.submitted?'unknown':'unavailable',submitted:result.submitted===true};this.save(next);return true;}
 summary(){return {quizRecords:Object.keys(this.data.quizzes).length,pendingQuizzes:Object.values(this.data.quizzes).filter(r=>r.pending).length,ckd:this.data.ckd?{...this.data.ckd}:null};}
}
