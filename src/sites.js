// Fixed public entry points. Authentication values never belong in this table.
export const SITES = Object.freeze([
  {id:'doctorville',name:'닥터빌',url:'https://www.doctorville.co.kr/seminar/main',loginUrl:'https://mims-account.shop.co.kr/login?cb=https%3A%2F%2Fwww.doctorville.co.kr%2Fmims%2FdirectLogin',hosts:['www.doctorville.co.kr','doctorville.co.kr'],login:{origin:'https://mims-account.shop.co.kr',path:'/login',callback:'https://www.doctorville.co.kr/mims/directLogin'}},
  {id:'keymedi',name:'키메디',url:'https://www.keymedi.com/meditv/live',hosts:['www.keymedi.com','keymedi.com']},
  {id:'hmp',name:'한미 HMP',url:'https://www.hmp.co.kr/symposium/schedulerequest/scheduleList.hm',hosts:['www.hmp.co.kr','hmp.co.kr']},
  {id:'intermd',name:'인터엠디',url:'https://www.intermd.co.kr/webinar/list.do',hosts:['www.intermd.co.kr','intermd.co.kr','moa.intermd.co.kr']},
  {id:'whodadoc',name:'후다닥의사',url:'https://hcp.whodadoc.com/hcp/main',loginUrl:'https://hcp.whodadoc.com/auth/login',hosts:['hcp.whodadoc.com','www.whodadoc.com','whodadoc.com']},
  {id:'medigate',name:'메디게이트',url:'https://new.medigate.net/symposium',hosts:['new.medigate.net','www.medigate.net','m.medigate.net','medigate.net']},
  {id:'ckd',name:'종근당',url:'https://www.ckdmediview.com/hcpapp/webinar/webinar.do',hosts:['www.ckdmediview.com','ckdmediview.com']},
  {id:'bluepharm',name:'블루팜',url:'https://bluepharmkorea.co.kr/',hosts:['bluepharmkorea.co.kr','www.bluepharmkorea.co.kr']},
  {id:'dtalks',name:'디톡스',url:'https://www.dtalks.kr/websim/vodList.do',loginUrl:'https://www.dtalks.kr/login.do',hosts:['www.dtalks.kr','dtalks.kr']},
  {id:'docple',name:'닥플 플러스',url:'https://docple-plus.com/offerwall/attendance',hosts:['docple-plus.com','www.docple-plus.com']},
].map(site=>Object.freeze({...site,hosts:Object.freeze(site.hosts)})));
