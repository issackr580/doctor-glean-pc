// No diagnostic recorder, extra IPC handlers or developer preload is shipped.
export function createDeveloperTools(){return Object.freeze({available:false,preloadName:'preload.cjs',register(){},event(){},observe(){},status(){return undefined;},close(){}});}
