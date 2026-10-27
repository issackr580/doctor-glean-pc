import {readFileSync} from 'node:fs';
const metadata=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
export const BUILD_INFO=Object.freeze({version:metadata.version,sourceCommit:/^[a-f0-9]{40}$/.test(metadata.sourceCommit??'')?metadata.sourceCommit:null});
export function executionEvent(emit,input){
 try{emit?.({...input,appVersion:BUILD_INFO.version,...(BUILD_INFO.sourceCommit?{sourceCommit:BUILD_INFO.sourceCommit}:{})});}catch{}
}
