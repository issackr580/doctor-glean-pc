import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {spawnSync} from 'node:child_process';
import {RuntimeFaults,safeRuntimeFault,faultNotice} from '../src/runtime-faults.js';

test('runtime faults export only a fixed code and a known app source position',()=>{
 const faults=new RuntimeFaults({now:()=>1000}),error=Error('Object has been destroyed: SYNTHETIC_PRIVATE_ACCOUNT https://private.invalid/?token=SECRET');
 error.stack='Error: private\n    at task ('+new URL('../src/automation-page.js',import.meta.url).href+':45:7)\n    at C:\\Users\\SYNTHETIC_PRIVATE\\secret.js:9:2';
 faults.record('uncaught_exception',error);
 assert.deepEqual(faults.snapshot().events,[{at:1000,origin:'uncaught_exception',code:'object_destroyed',source:'src/automation-page.js',line:45,column:7}]);
 assert.doesNotMatch(JSON.stringify(faults.snapshot()),/PRIVATE|private|SECRET|https:|file:|Users|workspace/);
});
test('unknown errors and hostile properties stay bounded without leaking strings',()=>{
 const faults=new RuntimeFaults({onFault:row=>{row.code='PRIVATE';throw Error('sink unavailable');}});
 const error={get message(){throw Error('private');},get stack(){throw Error('private');},code:'PRIVATE',name:'PRIVATE'};
 for(let i=0;i<25;i++)faults.record('control',error);
 const result=faults.snapshot();assert.equal(result.total,25);assert.equal(result.events.length,10);
 assert.ok(result.events.every(row=>row.code==='runtime_error'&&row.source==='unknown'));
 result.events[0].code='PRIVATE';assert.equal(faults.snapshot().events[0].code,'runtime_error');
 assert.equal(safeRuntimeFault({origin:'control',code:'PRIVATE'}),null);
 assert.deepEqual(safeRuntimeFault({origin:'control',code:'type_error',source:'C:/private.js',line:3,message:'private'}),{origin:'control',code:'type_error',source:'unknown'});
});
test('monitor does not replace Electron exception handling or add a rejection handler',()=>{
 const target=new EventEmitter(),faults=new RuntimeFaults();let defaultCalls=0;
 target.on('uncaughtException',()=>defaultCalls++);faults.install(target);faults.install(target);
 assert.equal(target.listenerCount('uncaughtExceptionMonitor'),1);assert.equal(target.listenerCount('uncaughtException'),1);assert.equal(target.listenerCount('unhandledRejection'),0);
 target.emit('uncaughtExceptionMonitor',new TypeError('private'),'unhandledRejection');target.emit('uncaughtException',Error('private'));
 assert.equal(defaultCalls,1);assert.equal(faults.snapshot().events[0].origin,'unhandled_rejection');assert.equal(faults.snapshot().events[0].code,'type_error');
 faults.close();assert.equal(target.listenerCount('uncaughtExceptionMonitor'),0);assert.equal(target.listenerCount('uncaughtException'),1);
});
test('a real fatal exception is still fatal while its safe monitor row is recorded',()=>{
 const result=spawnSync(process.execPath,['--input-type=module','-e',`
  import {RuntimeFaults} from ${JSON.stringify(new URL('../src/runtime-faults.js',import.meta.url).href)};
  new RuntimeFaults({onFault:row=>console.log(JSON.stringify(row))}).install();
  setImmediate(()=>{throw TypeError('SYNTHETIC_PRIVATE');});
 `],{encoding:'utf8'});
 assert.ifError(result.error);assert.equal(result.status,1,result.stderr);const row=JSON.parse(result.stdout.trim());assert.equal(row.code,'type_error');assert.equal(row.origin,'uncaught_exception');assert.doesNotMatch(result.stdout,/PRIVATE/);
});
test('notices distinguish real storage failures from other runtime errors',()=>{
 const faults=new RuntimeFaults();
 const storage=faults.record('automation',Error('state_unavailable')),other=faults.record('automation',TypeError('private')),disk=faults.record('startup',Object.assign(Error('private'),{code:'ENOSPC'}));
 assert.equal(faultNotice(storage).title,'저장 확인 필요');assert.equal(faultNotice(other).title,'자동 실행 확인 필요');assert.equal(disk.code,'disk_full');
 assert.match(faultNotice(other).message,/type_error/);assert.doesNotMatch(faultNotice(other).message,/private|저장 공간/);
});
