import {readFileSync,statSync,mkdirSync,openSync,writeFileSync,fsyncSync,closeSync,renameSync,unlinkSync} from 'node:fs';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
export function atomicJson(file,data,maxBytes=4_194_304){
 const text=JSON.stringify(data,null,2)+'\n';if(Buffer.byteLength(text)>maxBytes)throw Error('storage_error');
 mkdirSync(dirname(file),{recursive:true,mode:0o700});const temporary=file+'.'+randomUUID()+'.tmp';let fd;
 try{fd=openSync(temporary,'wx',0o600);writeFileSync(fd,text,'utf8');fsyncSync(fd);closeSync(fd);fd=undefined;renameSync(temporary,file);}
 finally{if(fd!==undefined)try{closeSync(fd);}catch{}try{unlinkSync(temporary);}catch{}}
}
export function readJson(file,fallback,valid,maxBytes=4_194_304){
 try{if(statSync(file).size>maxBytes)throw Error();const value=JSON.parse(readFileSync(file,'utf8'));if(!valid(value))throw Error();return value;}
 catch(error){if(error.code==='ENOENT')return structuredClone(fallback);throw Error('storage_error');}
}
