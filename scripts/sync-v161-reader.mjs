// Only reviewed, runtime-neutral page readers are inputs. No Android runtime material.
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {readerHashes as files} from './v161-reader-hashes.mjs';
const target=new URL('../vendor/direction161/',import.meta.url);
const inputs=Object.entries(files).map(([name,expected])=>{
 const data=readFileSync(process.argv[2]?join(process.argv[2],name):new URL(name,target));
 if(createHash('sha256').update(data).digest('hex')!==expected)throw Error('v161 reader mismatch '+name);
 return [name,data];
});
if(process.argv[2]){mkdirSync(target,{recursive:true});for(const [name,data] of inputs)writeFileSync(new URL(name,target),data);}
