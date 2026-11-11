import {kstInstant,kstDate} from './schedule.js';
import {parseOfficialIdentity} from './entry-identity.js';
const fail=()=>{throw Object.assign(Error('invalid_response'),{code:'invalid_response'});};
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const positiveId=v=>typeof v==='string'&&/^[1-9]\d{0,15}$/.test(v)||Number.isSafeInteger(v)&&v>0;
const date=v=>typeof v==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const title=v=>typeof v==='string'&&!!v.trim()&&v.length<=800&&!/[\x00-\x1f\x7f]/.test(v);
function localTime(v){if(typeof v!=='string'||!/^20\d{2}-\d{2}-\d{2}[ T]([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.000)?(?:\+09:00)?$/.test(v)||!date(v.slice(0,10)))return null;return {date:v.slice(0,10),time:v.slice(11,16),instant:kstInstant(v.slice(0,10),v.slice(11,19))};}
export function ckdCatalog(month,day,wanted){
 if(!date(wanted)||!object(month)||Object.keys(month).sort().join('|')!=='edate|ldate|ndate|sdate|today|wbList'||!Array.isArray(month.wbList)||month.wbList.length>500||!Array.isArray(day)||day.length>200)fail();
 const first=wanted.slice(0,7)+'-01',last=new Date(Date.UTC(+wanted.slice(0,4),+wanted.slice(5,7),0)).toISOString().slice(0,10);
 for(const key of ['ndate','sdate','today','ldate','edate'])if(!date(month[key]))fail();
 const start=Date.parse(month.sdate+'T00:00:00Z'),end=Date.parse(month.edate+'T00:00:00Z');
 if(month.ndate!==first||month.ldate!==last||month.sdate>first||month.edate<last||new Date(start).getUTCDay()!==0||new Date(end).getUTCDay()!==6||Date.parse(first+'T00:00:00Z')-start>6*86400000||![34,41].includes((end-start)/86400000))fail();
 const clean=r=>{if(!object(r)||!positiveId(r.WB_SEQ)||!title(r.WB_TITLE)||!localTime(r.WB_STARTDATE)||!['WB','RP','DS'].includes(r.WB_TYPE_CD)||!['Y','N'].includes(r.WB_POINT_YN)||!['Y','N'].includes(r.WB_USE_YN)||!['Y','N'].includes(r.DEL_YN))fail();return {id:String(r.WB_SEQ),title:r.WB_TITLE,start:r.WB_STARTDATE,type:r.WB_TYPE_CD,point:r.WB_POINT_YN,use:r.WB_USE_YN,deleted:r.DEL_YN};};
 const rows=month.wbList.map(clean),daily=day.map(clean);if(rows.some(r=>r.start.slice(0,10)<month.sdate||r.start.slice(0,10)>month.edate)||daily.some(r=>r.start.slice(0,10)!==wanted)||new Set(rows.map(r=>r.id)).size!==rows.length||new Set(daily.map(r=>r.id)).size!==daily.length)fail();
 const selected=rows.filter(r=>r.start.slice(0,10)===wanted),a=new Map(selected.map(r=>[r.id,r]));if(a.size!==daily.length||daily.some(r=>JSON.stringify(a.get(r.id))!==JSON.stringify(r)))fail();
 const events=daily.filter(r=>r.type==='WB'&&r.point==='Y'&&r.use==='Y'&&r.deleted==='N').map(r=>({site:'ckd',date:wanted,time:r.start.slice(11,16),title:r.title,id:r.id,url:'https://www.ckdmediview.com/hcpapp/webinar/webinar.do',advanced:false}));
 return {site:'ckd',status:'review',done:true,coverage:true,events,reason:'read_only',diagnostics:{rows:day.length,totalRows:rows.length,unknown:0,calendarAgreement:true,calendarChecked:true,calendarDate:wanted,calendarMonth:wanted.slice(0,7),calendarStatus:'checked',stopReason:'native_month_day_agreement'}};
}
export function docplePage(body,wanted,previous){
 if(!date(wanted)||!object(body)||body.success!==true||body.code!=='SUCCESS'||typeof body.message!=='string'||!object(body.data))fail();
 const {items,totalCount,totalPages}=body.data;if(!Array.isArray(items)||items.length>6||!Number.isSafeInteger(totalCount)||totalCount<0||totalCount>120||!Number.isSafeInteger(totalPages)||totalPages<0||totalPages>20||totalCount>0&&totalPages!==Math.ceil(totalCount/6)||!totalCount&&![0,1].includes(totalPages))fail();
 if(previous&&(previous.totalCount!==totalCount||previous.totalPages!==totalPages))fail();
 const rows=items.map(r=>{
  if(!object(r)||!positiveId(r.id)||!title(r.title)||typeof r.registered!=='boolean'||!['UPCOMING','OPEN','LIVE','ENDED'].includes(r.status))fail();
  const start=localTime(r.liveStartAt),end=localTime(r.liveEndAt);if(!start||!end||end.instant<=start.instant)fail();
  // Only an explicit original detail link may become a navigation hint.
  // A returned ID never manufactures a detail/player URL.
  const url=r.detailUrl??r.url,id=parseOfficialIdentity('docple',url);if(!id||id.id!==String(r.id))fail();
  return {site:'docple',id:String(r.id),title:r.title,date:start.date,time:start.time,url,lectureIdentity:id,registrationStatus:r.registered?'registered':'not_registered',lectureEnded:r.status==='ENDED'};
 });
 return {rows,totalCount,totalPages};
}
export function completeDocple(pages,wanted){
 if(!pages.length)fail();const first=pages[0],rows=pages.flatMap(p=>p.rows);
 if(pages.length!==Math.max(1,first.totalPages)||rows.length!==first.totalCount||new Set(rows.map(r=>r.id)).size!==rows.length||pages.some((p,i)=>p.totalCount!==first.totalCount||p.totalPages!==first.totalPages||p.rows.length!==(i===pages.length-1?first.totalCount-i*6:6)))fail();
 return {site:'docple',status:'ok',done:true,coverage:true,events:rows.filter(r=>r.date===wanted),reason:'list_read',diagnostics:{rows:rows.length,totalRows:rows.length,unknown:0,pages:pages.length,listStatus:'checked',cardLayout:'docple_live_cards',stopReason:'docple_list_exhausted'}};
}
