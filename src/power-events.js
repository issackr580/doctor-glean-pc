// All application windows share the main process scheduler and durable ledger.
export function bindPowerEvents(monitor,{collector,automation,onSuspend,onResume}){
 monitor.on('suspend',()=>{collector.suspend();automation.suspended();onSuspend();});
 monitor.on('resume',()=>{collector.resume();automation.resumed();onResume();});
}
