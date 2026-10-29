'use strict';
const {contextBridge,ipcRenderer}=require('electron');
// No generic channel, path, URL, code execution or filesystem capability.
contextBridge.exposeInMainWorld('doctorGlean',Object.freeze({
  state:()=>ipcRenderer.invoke('pc:state'),
  setDate:date=>ipcRenderer.invoke('pc:set-date',date),
  selectSites:ids=>ipcRenderer.invoke('pc:select-sites',ids),
  collect:()=>ipcRenderer.invoke('pc:collect'),
  collectSite:id=>ipcRenderer.invoke('pc:collect-site',id),
  cancelCollection:()=>ipcRenderer.invoke('pc:cancel-collection'),
  copySchedule:()=>ipcRenderer.invoke('pc:copy-schedule'),
  setPaused:value=>ipcRenderer.invoke('pc:pause',value),
  openSite:id=>ipcRenderer.invoke('pc:open-site',id),
  openLogin:id=>ipcRenderer.invoke('pc:open-login',id),
  finishLogin:id=>ipcRenderer.invoke('pc:finish-login',id),
  saveCredential:(site,id,password,automatic)=>ipcRenderer.invoke('pc:credential-save',site,id,password,automatic),
  recoverCredential:site=>ipcRenderer.invoke('pc:credential-recover',site),
  setCredentialAutomatic:(site,value)=>ipcRenderer.invoke('pc:credential-automatic',site,value),
  removeCredential:site=>ipcRenderer.invoke('pc:credential-remove',site),
  cancelCredential:site=>ipcRenderer.invoke('pc:credential-cancel',site),
  setFeature:(key,value)=>ipcRenderer.invoke('pc:set-feature',key,value),
  setEntrySites:ids=>ipcRenderer.invoke('pc:set-entry-sites',ids),
  checkDaily:readOnly=>ipcRenderer.invoke('pc:daily',readOnly),
  quickRun:()=>ipcRenderer.invoke('pc:quick-run'),
  cancelEntry:key=>ipcRenderer.invoke('pc:entry-cancel',key),
  retryEntry:key=>ipcRenderer.invoke('pc:entry-retry',key),
  markManualEntry:key=>ipcRenderer.invoke('pc:entry-manual',key),
  preflightEntry:key=>ipcRenderer.invoke('pc:entry-preflight',key),
  preflightUpcoming:()=>ipcRenderer.invoke('pc:entry-preflight-upcoming'),
  requestRegistration:(source,key)=>ipcRenderer.invoke('pc:registration-request',source,key),
  quit:()=>ipcRenderer.invoke('pc:quit'),
  exportReport:()=>ipcRenderer.invoke('pc:export-report'),
  checkUpdate:()=>ipcRenderer.invoke('pc:update-check'),
  installUpdate:()=>ipcRenderer.invoke('pc:update-install'),
  updateReady:()=>ipcRenderer.invoke('pc:update-ready'),
  openUpdatePage:()=>ipcRenderer.invoke('pc:update-page'),
  onChanged:callback=>{
    if(typeof callback!=='function')return ()=>{};
    const listener=()=>callback();ipcRenderer.on('pc:changed',listener);
    return ()=>ipcRenderer.removeListener('pc:changed',listener);
  },
}));
