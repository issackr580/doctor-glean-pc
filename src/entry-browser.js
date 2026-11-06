import {readLectureIdentity,entryIdentityScope,observedLectureUrl} from '../vendor/identity/lecture-identity.js';
// Serialized with every actual PC entry/registration injection, never just
// imported in Node. These functions confer target identity, not authorization.
export function browserIdentityContext(job,selector){
 let expected=readLectureIdentity(job.site,job.url),here=readLectureIdentity(job.site,location.href);const m=job.lectureIdentity;
 if(!expected&&job.site==='hmp'&&m?.schemaVersion===1&&m.kind==='schedule'&&m.source==='hmp_go_detail'&&/^[1-9]\d{0,9}$/.test(m.id))expected=m;
 if(m&&(!expected||m.schemaVersion!==1||m.id!==expected.id||m.kind!==expected.kind||m.source!==expected.source))return {invalid:true};
 if(!expected)return null;
 const same=id=>id?.id===expected.id&&id?.kind===expected.kind;
 if(here&&!same(here))return {invalid:true};
 const scope=entryIdentityScope(job,selector);if(!scope)return {invalid:true};
 return {...scope,expected,heading:e=>scope.heading(e)||job.site==='doctorville'&&same(here)&&e.matches('strong,b,em')&&/[A-Za-z가-힣]{2}/.test(e.innerText||'')&&!e.closest('nav,footer,aside,[role="dialog"]')};
}
export function bindEntryControl(job,mode,button){
 const known=job.lectureIdentity||readLectureIdentity(job.site,job.url);if(!known)return true;
 const selectors={doctorville:'a.list_detail',medigate:'article',keymedi:'[data-gtm-event-name="content_click"]',hmp:'.area',whodadoc:'.webinarItem--live,.webinarItem--main,.webinarItem--brand,.webinarItem--home,.webinar__boxLink,.mWebinar__item',docple:'[data-testid="webinar-card"],article'};
 const root=button.closest(selectors[job.site]||'article')||button.parentElement;
 const fingerprint=JSON.stringify([button,root].map(e=>['href','onclick','formaction','type','aria-label'].map(a=>e?.getAttribute(a))));
 const key=[job.site,job.key,job.slot].join('|'),map=window.__pcEntryControls??=new Map();
 if(mode!=='click'){map.set(key,{button,root,fingerprint});if(map.size>16)map.delete(map.keys().next().value);return true;}
 const prior=map.get(key);return !!prior&&prior.button===button&&prior.root===root&&button.isConnected&&prior.fingerprint===fingerprint;
}
export function identityPrelude(){return `const readLectureIdentity=(${readLectureIdentity.toString()});const observedLectureUrl=(${observedLectureUrl.toString()});const entryIdentityScope=(${entryIdentityScope.toString()});const browserIdentityContext=(${browserIdentityContext.toString()});const bindEntryControl=(${bindEntryControl.toString()});`;}
export function withIdentity(fn){return `(function(){${identityPrelude()}return (${fn.toString()});})()`;}
