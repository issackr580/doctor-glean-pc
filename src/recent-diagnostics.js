import {kstDate,kstInstant} from './schedule.js';

export function recentDiagnostics(now,{catalog,workflows,survey}){
 const today=kstDate(now),yesterday=kstDate(kstInstant(today,'00:00')-1);
 return {
  surveySettings:survey.settings(),
  surveyStorageUnavailable:!!survey.failed,
  days:[today,yesterday].map(date=>({
   date,
   sites:catalog.diagnostics(date),
   ...workflows.day(date),
   entries:workflows.entries(date).map(job=>({
    site:job.site,time:job.time,slot:job.slot,status:job.status,attempted:job.entryAttempted,
    ...(job.executionVersion?{executionVersion:job.executionVersion}:{}),
    ...(job.doctorvilleArrival==='waiting_room'||job.doctorvilleArrival==='broadcast_room'?{doctorvilleArrival:job.doctorvilleArrival}:{}),
    ...(job.receipt?{receipt:job.receipt}:{}),
    ...(job.attempts?.length?{attempts:job.attempts}:{}),
   })),
   surveys:survey.snapshot({diagnostics:true,date}),
  })),
 };
}
