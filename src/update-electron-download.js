import {net} from 'electron';

// Electron net.fetch cancels manual redirects. Its native request API lets us
// validate every redirect before following, with session cookies disabled.
export function electronPatchDownload(target,onProgress=()=>{}){
  if(target.edition!=='distribution')return Promise.reject(Error('update_private'));
  return new Promise((resolve,reject)=>{
    const request=net.request({method:'GET',url:target.patch.url,redirect:'manual',credentials:'omit',useSessionCookies:false});let done=false,size=0,redirects=0;const chunks=[];
    const timer=setTimeout(()=>finish(Error('update_network')),120000);
    function finish(error){if(done)return;done=true;clearTimeout(timer);if(error){request.abort();reject(error);}else resolve(Buffer.concat(chunks));}
    request.on('redirect',(_status,method,raw)=>{
      try{
        const url=new URL(raw);
        if(++redirects>3||method!=='GET'||url.protocol!=='https:'||url.username||url.password||url.port||!['release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(url.hostname))throw Error('update_redirect');
        request.followRedirect();
      }catch{finish(Error('update_redirect'));}
    });
    request.on('response',response=>{
      response.on('error',()=>finish(Error('update_network')));response.on('aborted',()=>finish(Error('update_network')));
      const header=response.headers['content-length'],declared=Array.isArray(header)?header[0]:header;
      if(response.statusCode!==200||declared&&(!/^\d+$/.test(declared)||Number(declared)!==target.patch.size))return finish(Error('update_size'));
      response.on('data',chunk=>{if(done)return;size+=chunk.length;if(size>target.patch.size)return finish(Error('update_size'));chunks.push(Buffer.from(chunk));onProgress(size,target.patch.size);});
      response.on('end',()=>finish(size===target.patch.size?null:Error('update_size')));
    });request.on('error',()=>finish(Error('update_network')));request.end();
  });
}
