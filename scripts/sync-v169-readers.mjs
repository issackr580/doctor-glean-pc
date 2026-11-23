import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
// Reviewed DOM readers from the v169 handoff, mobile commit 1da46455f74347cb7dcfd4d44066f02cb4a52209.
const expected = {'reader-additional.js': 'b513be4ebaeb6825fdc618275558b897c1e8e3fbd04dadaae30dea74d9b587c2', 'doctorville-channel.js': '2ff9a2b3c3e43eaccf1795bc4076c93d1100a4a514924fd5488d7f63f06a18b4'};
const target = new URL('../vendor/direction169/',import.meta.url);
const files = Object.entries(expected).map(([name,hash])=>{
 const bytes=readFileSync(process.argv[2]?join(process.argv[2],name):new URL(name,target));
 if(createHash('sha256').update(bytes).digest('hex')!==hash)throw Error('Unexpected v169 reader: '+name);
 return [name,bytes];
});
if(process.argv[2]){
 mkdirSync(target,{recursive:true});
 for(const [name,bytes] of files)writeFileSync(new URL(name,target),bytes);
}
