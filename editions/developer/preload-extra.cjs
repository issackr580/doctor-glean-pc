// Appended to the common sandboxed preload only for the developer edition.
contextBridge.exposeInMainWorld('doctorGleanDeveloper',Object.freeze({
  status:()=>ipcRenderer.invoke('pc-dev:status'),
  setEnabled:value=>ipcRenderer.invoke('pc-dev:enabled',value),
  clear:()=>ipcRenderer.invoke('pc-dev:clear'),
  export:()=>ipcRenderer.invoke('pc-dev:export'),
  policyCheck:()=>ipcRenderer.invoke('pc-dev:policy-check'),
  entryList:()=>ipcRenderer.invoke('pc-dev:entry-list'),
  entryPreview:id=>ipcRenderer.invoke('pc-dev:entry-preview',id),
  entrySave:token=>ipcRenderer.invoke('pc-dev:entry-save',token),
  entryCopy:token=>ipcRenderer.invoke('pc-dev:entry-copy',token),
}));
