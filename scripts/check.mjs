import {readdirSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
function check(directory){for(const item of readdirSync(directory,{withFileTypes:true})){
  const name=item.name;if(item.isDirectory()){check(join(directory,name));continue;}
  if(!/\.(?:c?js|mjs)$/.test(name))continue;
  const file=join(directory,name);
  const result=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});
  if(result.status!==0)process.exit(result.status??1);
}}
for(const directory of ['src','ui','scripts','test','editions'])check(directory);
console.log('JavaScript syntax checks passed.');
