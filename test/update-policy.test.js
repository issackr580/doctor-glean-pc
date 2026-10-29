import test from 'node:test';
import assert from 'node:assert/strict';
import {selectPcUpdate,checkPcUpdate,PC_REPOSITORY,PC_RELEASES} from '../src/update-policy.js';
const version='0.1.0-preview.22',tag='pc-v'+version,full='doctor-glean-pc-v'+version+'-windows-x64.zip';
function release(){return {tag_name:tag,draft:false,prerelease:true,published_at:'2026-10-28T00:00:00Z',html_url:PC_RELEASES+'/tag/'+tag,assets:[full,'RELEASE_NOTES.txt','SHA256SUMS.txt'].map(name=>({name,size:1000,state:'uploaded',digest:'sha256:'+'a'.repeat(64),browser_download_url:PC_REPOSITORY+'/releases/download/'+tag+'/'+name}))};}
const select=(rows,options={})=>selectPcUpdate({pages:[rows],complete:true,currentVersion:'0.1.0-preview.21',edition:'distribution',platform:'win32',arch:'x64',channel:'preview',...options});
test('PC update accepts only its published channel and exact Windows asset metadata',()=>{const result=select([release()]);assert.equal(result.status,'available');assert.equal(result.signatureVerified,false);assert.equal(result.page,PC_RELEASES+'/tag/'+tag);assert.equal(select([release()],{currentVersion:version}).status,'current');});
test('draft, Android, other edition, wrong origin, incomplete assets and stable channel are never offered',()=>{
 const cases=[r=>{r.draft=true;},r=>{r.tag_name='v0.7.119';},r=>{r.assets[0].name='doctor-glean-pc-developer-v'+version+'-windows-x64.zip';},r=>{r.html_url='https://foreign.invalid/';},r=>{r.assets.pop();},r=>{r.assets[0].digest='missing';},r=>{r.assets[0].digest=[r.assets[0].digest];},r=>{r.published_at=[r.published_at];},r=>{r.assets[0].size='1000';},r=>{r.assets[0].browser_download_url='https://foreign.invalid/x.zip';},r=>{r.assets.push({...r.assets[0]});}];
 for(const change of cases){const row=release();change(row);assert.equal(select([row]).status,'unknown');}
 assert.equal(select([release()],{channel:'stable'}).status,'unknown');assert.equal(select([release()],{complete:false}).status,'unknown');assert.equal(select([]).status,'unknown');assert.equal(select([release()],{platform:'linux'}).status,'unknown');
});
test('incomplete newer metadata cannot become a current-version conclusion',()=>{const good=release(),bad=release();bad.assets=[];assert.equal(select([good,bad],{currentVersion:version}).status,'unknown');});
test('developer update requires private delivery and never performs metadata requests',async()=>{let calls=0;const result=await checkPcUpdate({edition:'developer',fetch(){calls++;}});assert.equal(calls,0);assert.equal(result.status,'private_delivery');assert.equal(result.page,PC_RELEASES);});
test('metadata uses bounded official GETs without credentials and failures stay unknown',async()=>{
 const options={edition:'distribution',platform:'win32',arch:'x64',currentVersion:'0.1.0-preview.21',channel:'preview'};let calls=0;
 const result=await checkPcUpdate({...options,fetch:async(url,init)=>{calls++;assert.match(url,/^https:\/\/api.github.com\/repos\/issackr580\/doctor-glean-pc\/releases\?per_page=30&page=1$/);assert.equal(init.credentials,'omit');assert.equal(init.redirect,'error');return new Response(JSON.stringify([release()]));}});assert.equal(result.status,'available');assert.equal(calls,1);
 assert.equal((await checkPcUpdate({...options,fetch:async()=>{throw Error('offline');}})).status,'unknown');
 assert.equal((await checkPcUpdate({...options,fetch:async()=>new Response('x'.repeat(1048577))})).status,'unknown');
});
test('a failed later page or exhausted page budget never reports current',async()=>{
 const options={edition:'distribution',platform:'win32',arch:'x64',currentVersion:version,channel:'preview'};let calls=0;
 const result=await checkPcUpdate({...options,fetch:async()=>++calls===1?new Response(JSON.stringify(Array(30).fill(release()))):new Response('unavailable',{status:503})});assert.equal(calls,2);assert.equal(result.status,'unknown');
 calls=0;const bounded=await checkPcUpdate({...options,fetch:async()=>{calls++;return new Response(JSON.stringify(Array(30).fill(release())));}});assert.equal(calls,3);assert.equal(bounded.status,'unknown');
});
