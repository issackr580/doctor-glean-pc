import {existsSync,unlinkSync} from 'node:fs';
import {atomicJson,readJson} from './atomic-json.js';
const modes=['always','wifi','off'];

// Chromium's network service and the native updater have no verified Windows
// interface binding. Wi-Fi mode therefore withholds all remote capabilities.
export class DataAccess{
 constructor(file,write=atomicJson){
  this.file=file;this.write=write;this.pending=file+'.pending';this.controller=new AbortController();
  try{
   if(existsSync(this.pending))throw Error();
   const saved=readJson(file,{mode:'always'},v=>v&&modes.includes(v.mode)&&(v.enabledAt===undefined||Number.isSafeInteger(v.enabledAt)&&v.enabledAt>=0));
   this.mode=saved.mode;this.enabledAt=saved.enabledAt??0;
  }catch{this.failed=true;this.mode='off';}
 }
 allowed(){return !this.failed&&this.mode==='always';}
 snapshot(){return {mode:this.mode,allowed:this.allowed(),reason:this.failed?'storage_error':this.mode==='wifi'?'wifi_route_unverified':this.mode==='off'?'data_off':''};}
 set(mode){
  if(!modes.includes(mode))throw Error('invalid_setting');
  if(mode===this.mode&&!this.failed)return;
  this.mode='off';this.controller.abort();this.controller=new AbortController();
  try{atomicJson(this.pending,{changing:true});const enabledAt=mode==='always'?Date.now():0;this.write(this.file,{mode,enabledAt});unlinkSync(this.pending);this.enabledAt=enabledAt;this.mode=mode;this.failed=false;}
  catch{this.failed=true;throw Error('storage_error');}
 }
 require(){if(!this.allowed())throw Error('data_blocked');}
}
