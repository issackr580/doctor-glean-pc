/** Login completion and the read-only part of a quick check share this queue. */
export class CatalogQueue {
 constructor({start,busy,onChange=()=>{},validDate}){
  Object.assign(this,{start,busy,onChange,validDate});this.pending=new Map();this.generation=0;this.automaticGeneration=0;
 }
 request(date,ids,{automatic=false}={}){
  if(this.disposed||!this.validDate(date))return false;
  for(const id of ids){
   const old=this.pending.get(id);
   this.pending.set(id,{date,retried:false,automatic:automatic&&!(old?.date===date&&!old.automatic)});
  }
  this.onChange();this.pump();return true;
 }
 pump(){
  if(this.disposed||this.starting||this.busy()||!this.pending.size)return;
  for(const [id,item] of this.pending)if(!this.validDate(item.date))this.pending.delete(id);
  const date=this.pending.values().next().value?.date;if(!date)return;
  const batch=[...this.pending].filter(([,item])=>item.date===date),generation=this.generation,automaticGeneration=this.automaticGeneration;
  this.starting=true;
  for(const [id] of batch)this.pending.delete(id);
  this.onChange();
  const launch=async()=>{
   try{
    const result=await this.start(date,batch.map(([id])=>id));
    if(result===false)throw Error('collection_busy');
   }catch(error){
    if(error.message==='collection_busy'&&generation===this.generation&&!this.disposed&&this.validDate(date)){
     for(const [id,item] of batch)if(!item.retried&&!this.pending.has(id)&&(!item.automatic||automaticGeneration===this.automaticGeneration))this.pending.set(id,{...item,retried:true});
    }
   }finally{
    this.starting=false;this.onChange();
    if(this.pending.size&&!this.disposed){clearTimeout(this.timer);this.timer=setTimeout(()=>this.pump(),250);this.timer.unref?.();}
   }
  };
  void launch();
 }
 invalidateAutomatic(){this.automaticGeneration++;for(const [id,item] of this.pending)if(item.automatic)this.pending.delete(id);this.onChange();}
 clear(){this.generation++;clearTimeout(this.timer);this.pending.clear();this.onChange();}
 snapshot(){return [...this.pending].map(([site,{date}])=>({site,date}));}
 close(){this.disposed=true;this.clear();}
}
