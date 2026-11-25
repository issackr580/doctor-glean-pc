import {readFileSync} from 'node:fs';
import {doctorvilleSurveyId} from './survey-policy.js';

const vendor=readFileSync(new URL('../vendor/automation/doctorville-survey.js',import.meta.url),'utf8');

function inspectSurvey(id,url,read,documentId){
 if(location.href!==url||documentId(url)!==id)return null;
 const result=read(id);
 if(!result)return null;
 const {status,reason,minutesLeft,buttonCount,disabled,minuteMismatch}=result;
 if(reason==='survey_login_required')return {site:'doctorville',seminarId:id,status:'unknown',reason};
 const visible=element=>element.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&!element.closest('[aria-hidden="true"],[inert]');
 const challenge=[...document.querySelectorAll('input[autocomplete="one-time-code"],iframe[src*="captcha"],input[type="password"]')].some(visible);
 if(challenge)return {site:'doctorville',seminarId:id,status:'unknown',reason:'survey_login_required'};
 const closed=[...document.querySelectorAll('p,span,strong,div,a,button')].some(element=>visible(element)&&/^(?:설문(?:이| 참여가)?\s*(?:마감|종료)되었습니다\.?|설문 참여 (?:마감|종료))$/.test(element.innerText?.trim()));
 const outcome=closed?(status==='open'?'unknown':'closed'):status;
 return {site:'doctorville',seminarId:id,status:outcome,reason,minutesLeft,buttonCount,disabled,minuteMismatch};
}

export const doctorvilleSurveySource=`(id,url)=>(${inspectSurvey})(id,url,${vendor},(${doctorvilleSurveyId}))`;
