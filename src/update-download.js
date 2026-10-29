import {UPDATE_FEED,verifyUpdateFeed} from './update-trust.js';

export async function limitedResponse(response,limit,{expectedSize,onProgress=()=>{}}={}){
  if(!response.ok||!response.body)throw Error('update_network');
  const declared=response.headers.get('content-length');
  if(declared&&(!/^\d+$/.test(declared)||Number(declared)>limit||expectedSize&&Number(declared)!==expectedSize))throw Error('update_size');
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit||expectedSize&&size>expectedSize)throw Error('update_size');chunks.push(Buffer.from(value));onProgress(size,expectedSize??0);}
  }finally{try{await reader.cancel();}catch{}}
  if(expectedSize&&size!==expectedSize)throw Error('update_size');return Buffer.concat(chunks);
}
export async function fetchUpdateFeed(fetch,channel,options={}){
  if(!['preview','stable'].includes(channel))throw Error('update_manifest');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{
    const response=await fetch(UPDATE_FEED+channel+'.json',{method:'GET',credentials:'omit',redirect:'error',cache:'no-store',signal:controller.signal,headers:{Accept:'application/json'}});
    if(response.redirected)throw Error('update_network');return verifyUpdateFeed(await limitedResponse(response,131072),options);
  }finally{clearTimeout(timer);}
}
export async function downloadUpdate(fetch,target,onProgress){
  if(target.edition!=='distribution')throw Error('update_private');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),120000);let url=target.patch.url;
  try{
    for(let count=0;count<4;count++){
      const response=await fetch(url,{method:'GET',credentials:'omit',redirect:'manual',cache:'no-store',signal:controller.signal,headers:{Accept:'application/octet-stream'}});
      if([301,302,303,307,308].includes(response.status)){
        const next=new URL(response.headers.get('location'),url);
        if(next.protocol!=='https:'||next.username||next.password||next.port||!['release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(next.hostname))throw Error('update_redirect');
        url=next.href;continue;
      }
      if(response.redirected)throw Error('update_redirect');return await limitedResponse(response,target.patch.size,{expectedSize:target.patch.size,onProgress});
    }throw Error('update_redirect');
  }finally{clearTimeout(timer);}
}
