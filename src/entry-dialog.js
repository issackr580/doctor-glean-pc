// Site alerts are obstacles, never authorization. Raw messages are not retained.
// Also injected as a standalone predicate into the read-only catalog document.
export function loginNoticeStatus(message){
 if(typeof message!=='string'||message.length>4000)return '';
 const text=message.replace(/\s+/g,'');
 if(/보안문자|보안확인|인증번호|자동입력방지|추가인증|본인인증|비밀번호.*(?:오류|불일치|틀렸)|중복로그인|다른기기|captcha|verifyyouarehuman|accessdenied/i.test(text))return 'blocked';
 if(/로그인(?:이)?필요|로그인(?:을)?(?:해|하여|하셔야)|로그인후(?:이용|입장|시청|신청)|먼저로그인|로그인정보가없|(?:로그인(?:정보|상태|시간|세션)?|세션|인증시간)(?:이|가|은|는)?만료|로그인(?:이)?(?:되어있지않|되지않|안되어|안돼있|상태가아닙)|다시로그인(?:해|하|바랍)|자동(?:으로)?로그아웃(?:되었|됐|되엇)|session(?:has)?expired|pleaseloginagain/i.test(text))return 'login';
 return '';
}
export function entryDialogObstacle(message){
 if(typeof message!=='string'||message.length>4000)return {status:'blocked',reason:'manual_confirmation'};
 const text=message.replace(/\s+/g,'');
 const notice=loginNoticeStatus(message);
 if(notice==='blocked')return {status:'blocked',reason:'manual_confirmation'};
 if(notice==='login')return {status:'login',reason:'login_required'};
 if(/(?:수강|강의|세미나)?신청(?:을)?(?:먼저|후|하신후|완료후)|신청하지않|미신청강의/.test(text))return {status:'not_registered',reason:'registration_required'};
 return {status:'blocked',reason:'manual_confirmation'};
}
