// Current-process bounded counters. No URL, account, headers or body retained.
const KEYS=['apiRequests','apiBodyBytes','apiCompleted','apiFallbacks','pagesCreated','hiddenPagesCreated','mainFrameLoads','mediaGetBlocked','browserRequests','browserEncodedBytes','entryDispatches','entryWindowLifetimeMs'];
const counts=Object.fromEntries(KEYS.map(k=>[k,0]));
const pages=new WeakSet(),hidden=new WeakSet();
export function trackPage(contents,role){
 if(!pages.has(contents)){pages.add(contents);resourceCount('pagesCreated');contents.on('did-start-navigation',(event,_url,inPlace,main)=>{if((main??event.isMainFrame)&&!(inPlace??event.isInPlace))resourceCount('mainFrameLoads');});}
 if(role==='hidden'&&!hidden.has(contents)){hidden.add(contents);resourceCount('hiddenPagesCreated');}
}
export function resourceCount(key,value=1){if(KEYS.includes(key)&&Number.isSafeInteger(value)&&value>=0)counts[key]=Math.min(Number.MAX_SAFE_INTEGER,counts[key]+value);}
export function resourceUse(){return {scope:'current_process_api_body_and_owned_chromium_observations',...counts,osNetworkBytes:null,fullNetworkMeasured:false,playbackDurationMs:null,playbackDurationMeasured:false,encodedBytesIncludeCacheAndCrossOriginLimits:true};}
