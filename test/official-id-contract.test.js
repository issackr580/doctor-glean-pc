import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluate} from '../scripts/id-policy-adapter.mjs';
const corpus=JSON.parse(readFileSync(new URL('./fixtures/official-id-v148.synthetic.json',import.meta.url)));
function match(expected,actual,path){
 if(expected!==null&&typeof expected==='object'){
  assert.ok(actual!==null&&typeof actual==='object',path);
  if(Array.isArray(expected)){assert.ok(Array.isArray(actual),path);assert.equal(actual.length,expected.length,path);}
  for(const [k,v] of Object.entries(expected))match(v,actual[k],path+'/'+k);
 }else assert.equal(actual,expected,path);
}
function exists(obj,pointer){for(const part of pointer.slice(1).split('/').map(p=>p.replace(/~1/g,'/').replace(/~0/g,'~'))){if(obj===null||typeof obj!=='object'||!Object.hasOwn(obj,part))return false;obj=obj[part];}return true;}
for(const c of corpus.cases)test('v148 reference contract / '+c.id,async()=>{
 const actual=await evaluate(structuredClone(c.input));match(c.expected,actual,c.id);
 for(const p of c.absent??[])assert.equal(exists(actual,p),false,c.id+p);
});
