/** Login completion requests wait their turn; opening another site is not a cancel. */
export class CatalogQueue{
 constructor({start,busy,onChange=()=>{},validDate}){Object.assign(this,{start,busy,onChange,validDate});this.pending=new Map();this.disposed=false;}
 request(date,ids){
  if(this.disposed||!this.validDate(date))return false;
  for(const id of ids)this.pending.set(id,date);this.onChange();this.pump();return true;
 }
 pump(){
  if(this.disposed||this.busy()||!this.pending.size)return;
  for(const [id,date] of this.pending)if(!this.validDate(date))this.pending.delete(id);
  const date=this.pending.values().next().value;if(!date)return;
  const ids=[...this.pending].filter(([,day])=>day===date).map(([id])=>id);
  for(const id of ids)this.pending.delete(id);this.onChange();
  Promise.resolve(this.start(date,ids)).catch(()=>{}).finally(()=>queueMicrotask(()=>this.pump()));
 }
 clear(){this.pending.clear();this.onChange();}
 snapshot(){return [...this.pending].map(([site,date])=>({site,date}));}
 close(){this.disposed=true;this.clear();}
}
