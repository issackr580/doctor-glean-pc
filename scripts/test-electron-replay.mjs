// Synthetic PC cases authored here; no user DOM, account or mobile source.
import {app,BrowserWindow,session} from 'electron';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {pcEntryPage} from '../src/entry-page.js';
import {remotePreferences} from '../src/security.js';
import {kstDate} from '../src/schedule.js';
const directory=mkdtempSync(join(tmpdir(),'pc-replay-'));app.setPath('userData',directory);
app.on('window-all-closed',()=>{});
const checks=[],check=(label,ok)=>{assert.ok(ok,label);checks.push(label);};
const date=kstDate(),now=Date.now(),title='PC synthetic seminar',job={site:'medigate',key:'e'.repeat(64),date,title,time:'18:00',due:now-60000,deadline:now+60000,slot:0};
const card=(controls='<button>입장하기</button>',time='18:00',heading=title)=>`<article><h2>${heading}</h2><p class="date">${date} ${time}</p>${controls}</article>`;
const fixtures=[
 {id:'single',html:card(),status:'ready'},
 {id:'duplicates',html:card()+card(),status:'ambiguous'},
 {id:'two_controls',html:card('<button>입장하기</button><button>입장하기</button>'),status:'ambiguous'},
 {id:'registration',html:card('<button>입장하기</button><button>신청하기</button>'),status:'not_registered'},
 {id:'hidden',html:card()+'<div hidden>'+card()+'</div>',status:'ready'},
 {id:'display_none',html:card()+'<div style="display:none">'+card()+'</div>',status:'ready'},
 {id:'other_time',html:card()+card(undefined,'19:00'),status:'ready'},
 {id:'other_title',html:card(undefined,undefined,'Different PC seminar'),status:'target_missing'},
 {id:'password',html:'<input type="password">'+card(),status:'login'},
 {id:'modal',html:card()+'<div role="dialog" aria-modal="true">Synthetic notice</div>',status:'blocked'},
 {id:'disabled',html:card('<button disabled>입장하기</button>'),status:'not_open'},
 {id:'loading',html:'<div aria-busy="true">Loading</div>'+card(),status:'not_open'},
 {id:'foreign_action',html:card('<a href="https://foreign.invalid/player">입장하기</a>'),status:'blocked'},
 {id:'before_due',html:card(),status:'not_open',due:now+60000},
 {id:'foreign_document',html:card(),status:'blocked',origin:'https://foreign.invalid'},
 {id:'changed',html:card(),status:'ready',changed:card()+card()},
 {id:'once',html:card(),status:'ready',once:true},
];
let window,body,posts=0,requests=0;
async function run(){try{
 await app.whenReady();const profile=session.fromPartition('pc-synthetic-replay');
 profile.setPermissionRequestHandler((_c,_p,cb)=>cb(false));
 profile.protocol.handle('https',request=>{requests++;if(request.method==='POST'){posts++;return new Response('ok');}return new Response('<!doctype html><meta charset="utf-8">'+body,{headers:{'content-type':'text/html; charset=utf-8'}});});
 for(const width of [360,1240])for(const fixture of fixtures){
  posts=0;body=fixture.html;window=new BrowserWindow({show:false,width,height:1000,webPreferences:{...remotePreferences('medigate'),session:profile}});
  await window.loadURL((fixture.origin??'https://www.medigate.net')+'/symposium');
  const input={...job,due:fixture.due??job.due};
  await window.webContents.executeJavaScript(`Date.now=()=>${now};window.syntheticClicks=0;document.addEventListener('click',e=>{if(e.target.closest('button,a'))window.syntheticClicks++;});`);
  const call=mode=>window.webContents.executeJavaScript(`(${pcEntryPage.toString()})(${JSON.stringify(input)},${JSON.stringify(mode)})`);
  const inspected=await call('inspect');check(width+' '+fixture.id+' PC inspect '+JSON.stringify({inspected,input,location:await window.webContents.executeJavaScript('location.href')}),inspected.status===fixture.status);
  check(width+' '+fixture.id+' inspection zero clicks',await window.webContents.executeJavaScript('window.syntheticClicks===0')&&posts===0);
  if(fixture.changed)await window.webContents.executeJavaScript('document.body.innerHTML='+JSON.stringify(fixture.changed));
  if(fixture.once){const first=await call('click'),second=await call('click');check(width+' one original handler invocation',first.status==='clicked'&&second.status==='already_attempted'&&await window.webContents.executeJavaScript('window.syntheticClicks===1'));}
  else{const result=await call('click');check(width+' '+fixture.id+' safe click decision',fixture.changed?result.status==='ambiguous'&&await window.webContents.executeJavaScript('window.syntheticClicks===0'):fixture.status==='ready'?result.status==='clicked':result.status!=='clicked'&&await window.webContents.executeJavaScript('window.syntheticClicks===0'));}
  check(width+' '+fixture.id+' no product bridge',await window.webContents.executeJavaScript('typeof require==="undefined"&&typeof doctorGlean==="undefined"'));window.destroy();window=null;
 }
 mkdirSync(new URL('../verification/',import.meta.url),{recursive:true});writeFileSync(new URL('../verification/electron-replay.json',import.meta.url),JSON.stringify({runtime:{platform:process.platform,electron:process.versions.electron,chromium:process.versions.chrome},environment:process.platform+' Electron '+process.versions.electron,scenarios:fixtures.length*2,checks:checks.length,passed:checks,requests,syntheticOnly:true,windowsVerified:false,actualProviderVerified:false},null,2)+'\n');
 console.log('ELECTRON_REPLAY_PASS:'+checks.length);
}catch(error){console.error(error);process.exitCode=1;}finally{window?.destroy();rmSync(directory,{recursive:true,force:true});app.exit(process.exitCode??0);}}
run().catch(error=>{console.error(error);app.exit(1);});
