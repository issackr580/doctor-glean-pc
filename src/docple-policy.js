import {createHash} from 'node:crypto';

// Public observed identity only. Login return queries and watch addresses are
// never converted into an entry permission or persisted as catalog links.
export function docpleId(raw){
 try{const u=new URL(raw);return u.origin==='https://docple-plus.com'&&!u.username&&!u.password&&!u.hash&&[...u.searchParams].every(([k,v])=>['category','categoryAll','mode','liveFilter','period','sort','searchType','keyword','page','view','layout','week','date'].includes(k)&&/^[A-Za-z0-9_-]{0,40}$/.test(v)&&u.searchParams.getAll(k).length===1)?u.pathname.match(/^\/webinar\/([1-9]\d{0,15})\/?$/)?.[1]??'':'';}catch{return '';}
}
export function validDocpleEvent(event){return !!event&&String(event.id)===docpleId(event.url)&&!!docpleId(event.url);}
export function docpleKey(event){
 if(!validDocpleEvent(event))throw Error('invalid_event');
 return createHash('sha256').update('docple|'+event.date+'|'+event.id).digest('hex');
}
