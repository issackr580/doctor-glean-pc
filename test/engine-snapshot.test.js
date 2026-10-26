import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';

test('packaged engine outputs match the recorded Android source snapshot',async()=>{
  const root=new URL('../vendor/engine/',import.meta.url);
  const manifest=JSON.parse(readFileSync(new URL('manifest.json',root),'utf8'));
  assert.equal(manifest.schemaVersion,1);
  assert.equal(manifest.sourceVersion,'0.7.113');
  assert.equal(Object.keys(manifest.outputs).length,10);
  for(const [name,expected] of Object.entries(manifest.outputs)){
    assert.match(name,/^[a-z-]+\.(?:js|json)$/);
    const source=readFileSync(new URL(name,root));
    assert.equal(createHash('sha256').update(source).digest('hex'),expected,name);
    if(name==='core.js')assert.equal((await import(new URL(name,root))).SITES.length,9);
    else if(name.endsWith('.js'))assert.equal(typeof new vm.Script(source.toString()).runInNewContext(),'function',name);
    else assert.equal(JSON.parse(source).length,9);
  }
});

test('automation assets remain identical to the recorded standalone Android snapshot',()=>{
 const root=new URL('../vendor/automation/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('manifest.json',root),'utf8'));
 assert.equal(manifest.sourceVersion,'0.7.113');assert.equal(Object.keys(manifest.outputs).length,6);
 for(const [name,expected] of Object.entries(manifest.outputs)){
  assert.match(name,/^[a-z-]+\.js$/);const source=readFileSync(new URL(name,root));
  assert.equal(createHash('sha256').update(source).digest('hex'),expected);
  assert.equal(typeof new vm.Script(source.toString()).runInNewContext(),'function');
 }
});

test('credential helpers and exact routes match the immutable Android source snapshot',()=>{
 const root=new URL('../vendor/credentials/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('manifest.json',root),'utf8'));assert.equal(manifest.sourceVersion,'0.7.113');assert.equal(Object.keys(manifest.outputs).length,4);
 for(const [name,expected] of Object.entries(manifest.outputs)){const bytes=readFileSync(new URL(name,root));assert.equal(createHash('sha256').update(bytes).digest('hex'),expected);if(name.endsWith('.js'))assert.equal(typeof new vm.Script(bytes.toString()).runInNewContext(),'function');else assert.equal(JSON.parse(bytes).length,10);}
});
