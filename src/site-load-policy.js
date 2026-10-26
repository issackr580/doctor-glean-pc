import {siteById} from './security.js';
export function manualLoadRecovery(site,url,error,allowFallback=true){
 if(error?.errno===-3||error?.code==='ERR_ABORTED')return 'aborted';
 const known=siteById(site);
 return allowFallback&&site==='dtalks'&&known?.url===url&&known.loginUrl?'login':'error';
}
