export const PC_REPOSITORY='https://github.com/issackr580/doctor-glean-pc';
export const PC_RELEASES=PC_REPOSITORY+'/releases';
export const PC_METADATA='https://api.github.com/repos/issackr580/doctor-glean-pc/releases';
export function pcVersion(value){
 if(typeof value!=='string')return null;const m=value.match(/^(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})(?:-preview\.(0|[1-9]\d{0,5}))?$/);return m?[+m[1],+m[2],+m[3],m[4]===undefined?Infinity:+m[4]]:null;
}
const compare=(a,b)=>{for(let i=0;i<a.length;i++)if(a[i]!==b[i])return a[i]>b[i]?1:-1;return 0;};
function candidate(release,channel,now){
 if(!release||release.draft!==false||release.prerelease!==(channel==='preview')||typeof release.tag_name!=='string')return null;
 const value=release.tag_name.replace(/^pc-v/,''),version=pcVersion(value);if(!version||release.tag_name!=='pc-v'+value||(channel==='preview')!==value.includes('-preview.'))return null;
 if(typeof release.published_at!=='string')return null;
 const page=PC_RELEASES+'/tag/'+release.tag_name,date=Date.parse(release.published_at);
 if(release.html_url!==page||!Number.isFinite(date)||date>now||!Array.isArray(release.assets)||release.assets.length<3||release.assets.length>7)return null;
 const full='doctor-glean-pc-v'+value+'-windows-x64.zip',source='doctor-glean-pc-source-v'+value+'.zip',names=new Set();let patches=0;
 for(const asset of release.assets){
  const name=asset?.name;if(typeof name!=='string'||names.has(name))return null;names.add(name);
  const patch=name.match(/^doctor-glean-pc-patch-v(.+)-to-v(.+)-windows-x64\.zip$/);
  if(patch){if(!pcVersion(patch[1])||patch[2]!==value||++patches>1)return null;}
  else if(![full,source,'SHA256SUMS.txt','SOURCE_SHA256SUMS.txt','PATCH_SHA256SUMS.txt','RELEASE_NOTES.txt'].includes(name))return null;
  if(asset.state!=='uploaded'||!Number.isSafeInteger(asset.size)||asset.size<1||asset.size>1073741824||typeof asset.digest!=='string'||!/^sha256:[a-f0-9]{64}$/.test(asset.digest)||asset.browser_download_url!==PC_REPOSITORY+'/releases/download/'+release.tag_name+'/'+name)return null;
 }
 if(![full,'SHA256SUMS.txt','RELEASE_NOTES.txt'].every(n=>names.has(n))||names.has(source)!==names.has('SOURCE_SHA256SUMS.txt')||Boolean(patches)!==names.has('PATCH_SHA256SUMS.txt'))return null;
 return {version:value,parsed:version,page};
}
export function selectPcUpdate({pages,complete,currentVersion,edition,platform,arch,channel,now=Date.now()}){
 if(edition==='developer')return {status:'private_delivery',page:PC_RELEASES};
 const current=pcVersion(currentVersion);
 if(edition!=='distribution'||platform!=='win32'||arch!=='x64'||!['preview','stable'].includes(channel)||!current||!complete||!Array.isArray(pages)||!pages.length||pages.length>3||pages.some(page=>!Array.isArray(page)||page.length>30))return {status:'unknown'};
 const rows=pages.flat();
 if(rows.some(row=>row?.draft===false&&row.prerelease===(channel==='preview')&&/^pc-v\d/.test(row.tag_name??'')&&!candidate(row,channel,now)))return {status:'unknown'};
 const candidates=rows.map(row=>candidate(row,channel,now)).filter(Boolean).sort((a,b)=>compare(b.parsed,a.parsed));
 if(!candidates.length)return {status:'unknown'};
 const latest=candidates[0];return {status:compare(latest.parsed,current)>0?'available':'current',version:latest.version,page:latest.page,channel,metadataOnly:true,signatureVerified:false};
}
export async function checkPcUpdate({fetch,edition,currentVersion,platform,arch,channel}){
 if(edition==='developer')return {status:'private_delivery',page:PC_RELEASES};
 if(edition!=='distribution'||platform!=='win32'||arch!=='x64')return {status:'unknown'};
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000),pages=[];let complete=false;
 try{
  for(let page=1;page<=3;page++){
   const response=await fetch(PC_METADATA+'?per_page=30&page='+page,{method:'GET',credentials:'omit',redirect:'error',cache:'no-store',signal:controller.signal,headers:{Accept:'application/vnd.github+json'}});
   if(!response.ok||response.redirected)throw Error('metadata_unavailable');
   const reader=response.body.getReader();let length=0;const chunks=[];
   try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>1048576)throw Error('metadata_limit');chunks.push(Buffer.from(value));}}finally{try{await reader.cancel();}catch{}}
   const rows=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!Array.isArray(rows)||rows.length>30)throw Error('metadata_invalid');pages.push(rows);if(rows.length<30){complete=true;break;}
  }
  return selectPcUpdate({pages,complete,currentVersion,edition,platform,arch,channel});
 }catch{return {status:'unknown'};}finally{clearTimeout(timer);}
}
