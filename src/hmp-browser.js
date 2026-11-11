import {browserHmpCheckpoint} from './hmp-policy.js';
// Retain the reviewed DOM reader. Only its private wire checkpoint namespace
// changes; host reservation keys, IDs, ledgers and historical rows do not.
export function hmpEntrySource(original){return `(function(job,mode='inspect'){
 const valid=(${browserHmpCheckpoint.toString()});if(!valid(job))return {status:'blocked',reason:'policy_rejected'};
 const preparation=job.hmpPreparation===true;
 if(preparation&&(mode!=='inspect'||Date.now()<job.start-600000||Date.now()>=job.start))return {status:'blocked',reason:'policy_rejected'};
 return (${original})({...job,key:'hmp:2:'+job.key,hmpRepeatSchema:1,...(preparation?{due:job.start-600000,deadline:job.start-1}:{})},mode);
})`;}
