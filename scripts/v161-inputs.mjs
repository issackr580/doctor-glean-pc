import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {readerHashes} from './v161-reader-hashes.mjs';
export function verifyHandoffInputs(read=readFileSync){
 const expected={'test/fixtures/bluepharm-collection-v1.json':'78cabc11ab6cb4833d508dba2615ef64a6fa7572b45b52ba4c57af2ac1096f2a',...Object.fromEntries(Object.entries(readerHashes).map(([name,hash])=>['vendor/direction161/'+name,hash]))};
 for(const [file,hash] of Object.entries(expected)){
  if(createHash('sha256').update(read(new URL('../'+file,import.meta.url))).digest('hex')!==hash)throw Error('invalid_candidate_input '+file);
 }
 return Object.keys(expected).length;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log('Verified inputs '+verifyHandoffInputs());
