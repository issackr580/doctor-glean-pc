import {randomUUID} from 'node:crypto';
import {kstDate} from './schedule.js';
import {waitFor} from './async-work.js';

// Use the reviewed attendance calendar GET as a read-only server session
// check. Cookie presence, a route change or a cached logout label is not proof.
export async function inspectDocpleSession(page,{signal=page.signal,now=Date.now,sleep=waitFor,allowed=()=>true,nonce=randomUUID().replace(/-/g,'')}={}){
 const url='https://docple-plus.com/offerwall/attendance',version=page.version,date=kstDate(now()),began=now();
 const live=()=>!signal?.aborted&&!page.closed&&allowed()&&page.url===url&&page.version===version&&kstDate(now())===date;
 if(!live())return {status:'unknown'};
 for(let reads=0;reads<24&&live()&&now()-began<8000;reads++){
  const reply=await page.call('credential-docple-session.js',[{site:'docple',mode:'verify',nonce,pageTag:'1:'+Math.max(1,version),expectedUrl:url,kind:'attendance',date,autoClaim:false,attempted:false,checkId:nonce}]);
  if(!live())return {status:'stale'};
  if(reply.status==='authenticated'&&reply.evidence?.authEvidenceSource==='docple_server_calendar')return reply;
  if(reply.status==='login_required'||reply.status==='stale')return {status:reply.status};
  if(reply.status!=='loading')return {status:'unknown'};
  await sleep(350,signal);
 }
 return {status:live()?'unknown':'stale'};
}
