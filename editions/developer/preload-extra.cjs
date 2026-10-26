// Appended to the common sandboxed preload only for the developer edition.
contextBridge.exposeInMainWorld('doctorGleanDeveloper',Object.freeze({
  status:()=>ipcRenderer.invoke('pc-dev:status'),
  setEnabled:value=>ipcRenderer.invoke('pc-dev:enabled',value),
  clear:()=>ipcRenderer.invoke('pc-dev:clear'),
  export:()=>ipcRenderer.invoke('pc-dev:export'),
  policyCheck:()=>ipcRenderer.invoke('pc-dev:policy-check'),
}));
