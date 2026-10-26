import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveEdition} from '../src/edition.js';
import {remotePreferences} from '../src/security.js';
import {createDeveloperTools as distributionTools} from '../editions/distribution/developer-tools.js';
test('editions have separate names, app IDs, data directories and browser partitions',()=>{
 const developer=resolveEdition('developer'),distribution=resolveEdition('distribution');
 for(const key of ['name','appId','directory','executable'])assert.notEqual(developer[key],distribution[key]);
 assert.notEqual(remotePreferences('keymedi','developer').partition,remotePreferences('keymedi','distribution').partition);
 assert.throws(()=>resolveEdition('__proto__'));assert.throws(()=>resolveEdition('unknown'));
});
test('distribution does not register developer IPC or access diagnostic storage',()=>{
 let touched=0;const tool=distributionTools({register(){touched++;},save(){touched++;},directory:'/does-not-exist'});
 tool.register();tool.event({area:'process',phase:'start'});tool.observe({running:true});
 assert.equal(tool.status(),undefined);assert.equal(tool.available,false);assert.equal(tool.preloadName,'preload.cjs');assert.equal(touched,0);
});
