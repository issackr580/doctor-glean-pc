import test from 'node:test';
import assert from 'node:assert/strict';
import {allowedNavigation, allowedPopup, siteById, remotePreferences, trustedControl} from '../src/security.js';
import {kstDate, kstInstant, hmpSlots, nextLoungePreparation, eligibleNow} from '../src/schedule.js';
import {CREDENTIAL_SITES} from '../src/credential-policy.js';
import {doctorvilleDetailNavigation} from '../src/automation-policy.js';

test('every manual login entry is a reviewed credential route within its existing site boundary',()=>{
 for(const policy of CREDENTIAL_SITES){
  const entry=siteById(policy.id).loginUrl;
  assert.equal(allowedNavigation(policy.id,entry),true,policy.id);
  const actual=new URL(entry),expected=new URL(policy.url);
  assert.equal(actual.origin,expected.origin);assert.equal(actual.pathname,expected.pathname);
  assert.deepEqual([...actual.searchParams],[...expected.searchParams]);
 }
});
test('Doctorville detail reads are limited to one observed identifier on the fixed list and detail paths',()=>{
 const from='https://www.doctorville.co.kr/seminar/main',target='https://www.doctorville.co.kr/seminar/seminarDetail?seminarId=17';
 assert.equal(doctorvilleDetailNavigation(from,target),true);
 for(const raw of [target+'&seminarId=18',target+'&token=PRIVATE',target.replace('seminarId=17','seminarId=x'),target.replace('www.doctorville.co.kr','evil.invalid'),target.replace('https:','http:'),target+'#play',target.replace('/seminar/seminarDetail','/seminar/entry')])assert.equal(doctorvilleDetailNavigation(from,raw),false,raw);
 assert.equal(doctorvilleDetailNavigation(target,target),false);assert.equal(doctorvilleDetailNavigation(from+'?redirect=1',target),false);
});

test('fixed sites reject injected IDs and cross-site top-level navigation', () => {
  assert.equal(siteById('__proto__'), null);
  assert.equal(siteById('keymedi;whoami'), null);
  for (const bad of [
    'http://www.keymedi.com/drlounge', 'https://www.keymedi.com.evil.test/',
    'https://www.keymedi.com@evil.test/', 'https://evil.test@www.keymedi.com/',
    'https://www.keymedi.com:444/', 'file:///C:/secret.txt', 'javascript:alert(1)',
    'https://evil.keymedi.com/', 'https://www.hmp.co.kr/',
  ]) assert.equal(allowedNavigation('keymedi', bad), false, bad);
  assert.equal(allowedNavigation('keymedi','https://www.keymedi.com/drlounge'), true);
});

test('website renderer gets no control preload or Node bridge', () => {
  const p = remotePreferences('hmp');
  assert.equal(p.nodeIntegration, false);
  assert.equal(p.nodeIntegrationInSubFrames, false);
  assert.equal(p.contextIsolation, true);
  assert.equal(p.sandbox, true);
  assert.equal(p.webSecurity, true);
  assert.equal(p.webviewTag, false);
  assert.equal(p.preload, undefined);
  assert.equal(p.partition, remotePreferences('hmp').partition);
  assert.notEqual(p.partition, remotePreferences('keymedi').partition);
});

test('Doctorville external login permits only the reviewed provider callback',()=>{
 assert.equal(allowedNavigation('doctorville','https://mims-account.shop.co.kr/login?cb=https%3A%2F%2Fwww.doctorville.co.kr%2Fmims%2FdirectLogin'),true);
 assert.equal(allowedNavigation('keymedi','https://mims-account.shop.co.kr/login?cb=https://www.doctorville.co.kr/mims/directLogin'),false);
 assert.equal(allowedNavigation('doctorville','https://mims-account.shop.co.kr/login?cb=https://evil.test/'),false);
 assert.equal(allowedNavigation('doctorville','https://mims-account.shop.co.kr/login?cb=https://www.doctorville.co.kr/mims/directLogin&cb=https://evil.test/'),false);
});

test('blank login popups require a reviewed parent and retain the navigation boundary',()=>{
 assert.equal(allowedPopup('doctorville','about:blank','https://www.doctorville.co.kr/seminar/main'),true);
 assert.equal(allowedPopup('doctorville','about:blank','https://outside.invalid/'),false);
 assert.equal(allowedPopup('doctorville','data:text/html,<h1>login</h1>','https://www.doctorville.co.kr/'),false);
 assert.equal(allowedNavigation('doctorville','about:blank'),false);
 assert.equal(allowedNavigation('doctorville','https://outside.invalid/'),false);
});

test('IPC accepts only the exact control window main frame and file', () => {
  const url='file:///app/ui/index.html';
  const frame={url}; const contents={mainFrame:frame};
  const control={webContents:contents,isDestroyed:()=>false};
  assert.equal(trustedControl({sender:contents,senderFrame:frame},control,url),true);
  assert.equal(trustedControl({sender:{mainFrame:frame},senderFrame:frame},control,url),false);
  assert.equal(trustedControl({sender:contents,senderFrame:{url}},control,url),false);
  frame.url='https://www.keymedi.com/';
  assert.equal(trustedControl({sender:contents,senderFrame:frame},control,url),false);
  assert.equal(trustedControl({},null,url),false);
});

test('KST day and scheduling are independent of computer timezone', () => {
  assert.equal(kstDate(Date.parse('2026-10-25T15:00:00Z')),'2026-10-26');
  assert.equal(kstInstant('2026-10-26','00:01:02'),Date.parse('2026-10-25T15:01:02Z'));
  assert.throws(()=>kstInstant('2026-02-30','00:00'));
  assert.throws(()=>kstInstant('2026-10-26','24:00'));
});

test('Hanmi slots follow registered start time, never a hardcoded lunch slot', () => {
  const slots=hmpSlots('2026-10-26','18:00');
  assert.equal(slots.length,5);
  assert.equal(slots[0].dueAt,kstInstant('2026-10-26','18:00'));
  assert.equal(slots[4].dueAt,kstInstant('2026-10-26','18:40'));
  assert.equal(hmpSlots('2026-10-26','13:10')[4].dueAt,kstInstant('2026-10-26','13:50'));
  assert.equal(hmpSlots('2026-10-26','18:00',kstInstant('2026-10-26','18:25')).length,3);
});

test('weekday lounge preparation skips passed preparation and weekends', () => {
  assert.equal(nextLoungePreparation(kstInstant('2026-10-23','23:00')),kstInstant('2026-10-26','00:00:02'));
  assert.equal(nextLoungePreparation(kstInstant('2026-10-26','00:00:03')),kstInstant('2026-10-27','00:00:02'));
});

test('expired jobs and jobs from another Korean day cannot execute after resume', () => {
  const job={date:'2026-10-26',dueAt:kstInstant('2026-10-26','18:00'),deadline:kstInstant('2026-10-26','18:10')};
  assert.equal(eligibleNow(job,kstInstant('2026-10-26','17:59')),false);
  assert.equal(eligibleNow(job,kstInstant('2026-10-26','18:00')),true);
  assert.equal(eligibleNow(job,kstInstant('2026-10-26','18:11')),false);
  assert.equal(eligibleNow(job,kstInstant('2026-10-27','18:00')),false);
});
