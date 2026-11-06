// Test host only: isolated JavaScript worlds do not inherit the provider's
// synthetic Date override. Never import this into application code.
export function syntheticEntryClock(page,now){
 const bind=async()=>{for(const world of [1001,1003])await page.current.webContents.executeJavaScriptInIsolatedWorld(world,[{code:`Date.now=()=>${now()};void 0;`}]);};
 const load=page.load.bind(page),ready=page.ready.bind(page);
 page.load=async(...args)=>{const result=await load(...args);await bind();return result;};
 page.ready=async(...args)=>{const result=await ready(...args);await bind();return result;};return page;
}
