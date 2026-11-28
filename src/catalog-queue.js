/** Login completion and the read-only part of a quick check share this queue. */
export class CatalogQueue {
 constructor({start,busy,onChange=()=>{},context=()=>0,resultValid=()=>false,now=Date.now,validDate}){
  Object.assign(this,{start,busy,onChange,context,resultValid,now,validDate});this.running=new Map();this.recent=new Map();this.pending=new Map();this.generation=0;this.automaticGeneration=0;
 }
 request(date,ids,{automatic=false,morningAt,joinRunning=automatic,fullDoctorvilleApplications=false}={}){
  if(this.disposed||!this.validDate(date))return false;
  let queued=false;
  for(const id of ids){
   const scope=this.context(id),current=this.running.get(id),cached=this.recent.get(id),age=this.now()-(cached?.at??0);
   const full=id==='doctorville'&&fullDoctorvilleApplications;
   const runningSame=current?.date===date&&current.scope===scope&&(!full||current.fullDoctorvilleApplications);
   const freshAutomatic=!full&&automatic&&cached?.date===date&&cached.scope===scope&&age>=0&&age<60000&&this.resultValid(date,id);
   if(joinRunning&&runningSame||freshAutomatic)continue;
   queued=true;const old=this.pending.get(id);
   this.pending.set(id,{date,scope,morningAt:morningAt??(old?.date===date?old.morningAt:undefined),retried:false,
    automatic:automatic&&!(old?.date===date&&!old.automatic),fullDoctorvilleApplications:full||old?.date===date&&old.scope===scope&&old.fullDoctorvilleApplications===true});
  }
  this.onChange();this.pump();return queued;
 }
 pump(){
  if(this.disposed||this.starting||this.busy()||!this.pending.size)return;
  for(const [id,item] of this.pending)if(!this.validDate(item.date)||item.automatic&&item.scope!==this.context(id))this.pending.delete(id);
  const date=this.pending.values().next().value?.date;if(!date)return;
  const batch=[...this.pending].filter(([,item])=>item.date===date),generation=this.generation,automaticGeneration=this.automaticGeneration;
  this.starting=true;
  for(const [id,item] of batch){this.pending.delete(id);this.running.set(id,item);this.recent.delete(id);}
  this.onChange();
  const launch=async()=>{
   try{
    const result=await this.start(date,batch.map(([id])=>id),batch.find(([,item])=>item.morningAt)?.[1].morningAt,
     {fullDoctorvilleApplications:batch.some(([,item])=>item.fullDoctorvilleApplications)});
    if(result===false)throw Error('collection_busy');
    if(generation===this.generation)for(const [id,item] of batch)if(item.scope===this.context(id)&&this.resultValid(date,id))this.recent.set(id,{date,scope:item.scope,at:this.now()});
   }catch(error){
    if(error.message==='collection_busy'&&generation===this.generation&&!this.disposed&&this.validDate(date)){
     for(const [id,item] of batch)if(!item.retried&&!this.pending.has(id)&&(!item.automatic||automaticGeneration===this.automaticGeneration))this.pending.set(id,{...item,retried:true});
    }
   }finally{
    this.running.clear();this.starting=false;this.onChange();
    if(this.pending.size&&!this.disposed){clearTimeout(this.timer);this.timer=setTimeout(()=>this.pump(),250);this.timer.unref?.();}
   }
  };
  void launch();
 }
 invalidateAutomatic(){this.automaticGeneration++;for(const [id,item] of this.pending)if(item.automatic)this.pending.delete(id);this.onChange();}
 clear({keepRunning=false}={}){this.recent.clear();if(!keepRunning)this.running.clear();this.generation++;clearTimeout(this.timer);this.pending.clear();this.onChange();}
 snapshot(){return [...this.pending].map(([site,{date}])=>({site,date}));}
 close(){this.disposed=true;this.clear();}
}
