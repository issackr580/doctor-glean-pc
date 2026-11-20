// webRequest.id identifies one Chromium request across its server redirects.
// The outgoing method is known at onBeforeRequest (a 303 can change POST to GET).
export class CatalogRedirects {
 constructor(allowed){this.allowed=allowed;this.chains=new Map();this.stopped=false;}
 redirect(d){
  if(this.stopped||d.resourceType!=='mainFrame'||d.method!=='GET'||!this.allowed(d.redirectURL))return;
  const chain=this.chains.get(d.id)??{total:0,visits:new Map()};
  chain.pending=new URL(d.redirectURL);chain.pending.hash='';this.chains.set(d.id,chain);
 }
 block(d){
  if(this.stopped)return true;
  const chain=this.chains.get(d.id);
  if(!chain?.pending||d.resourceType!=='mainFrame'||d.method!=='GET')return false;
  const url=new URL(d.url);url.hash='';
  const expected=chain.pending.href;delete chain.pending;
  if(url.href!==expected||!this.allowed(d.url))return false;
  const count=chain.visits.get(expected)??0;
  if(chain.total>=8||count>=2){this.stopped=true;this.chains.clear();return true;}
  chain.total++;chain.visits.set(expected,count+1);return false;
 }
 finish(id){this.chains.delete(id);}
}
