// Site alerts are obstacles, never authorization. Raw messages are not retained.
export function entryDialogObstacle(message){
 if(typeof message!=='string'||message.length>4000)return {status:'blocked',reason:'manual_confirmation'};
 const text=message.replace(/\s+/g,'');
 if(/보안문자|자동입력방지|추가인증|captcha|Verifyyouarehuman/i.test(text))return {status:'blocked',reason:'manual_confirmation'};
 if(/로그인(?:이)?필요|로그인(?:을)?(?:해|하여|하셔야|해주세요)|로그인후(?:이용|입장|시청|신청)|먼저로그인|로그인정보가없|세션이만료/.test(text))return {status:'login',reason:'login_required'};
 if(/(?:수강|강의|세미나)?신청(?:을)?(?:먼저|후|하신후|완료후)|신청하지않|미신청강의/.test(text))return {status:'not_registered',reason:'registration_required'};
 return {status:'blocked',reason:'manual_confirmation'};
}
