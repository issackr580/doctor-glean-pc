// PC-only fallback for duplicate desktop links. Return an observed URL only;
// never manufacture a product ID, invoke a handler or select distinct products.
export function doctorvilleQuizPage(input){
 const stop=()=>({status:'stopped',reason:'product_link_ambiguous'});
 try{
  if(!input||window.top!==window.self||input.expectedUrl!==location.href||location.origin!=='https://www.doctorville.co.kr')return stop();
  const today=Object.fromEntries(new Intl.DateTimeFormat('en',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
  if(input.date!==today.year+'-'+today.month+'-'+today.day)return stop();
  if(document.readyState!=='complete'||document.visibilityState!=='visible')return {status:'loading',reason:'page_not_ready'};
  const visible=e=>{
   if(!e?.isConnected||!e.getClientRects().length||e.closest('[hidden],[aria-hidden="true"],[inert],template,header,nav,footer'))return false;
   for(let p=e;p;p=p.parentElement){const s=getComputedStyle(p);if(s.display==='none'||s.visibility==='hidden'||s.visibility==='collapse')return false;}return true;
  };
  const all=(selector,root=document)=>[...root.querySelectorAll(selector)].filter(visible);
  const text=e=>String(e?.innerText||e?.textContent||'').replace(/\s+/g,' ').trim();
  const norm=s=>String(s).normalize('NFKC').replace(/[\s®™]/g,'').toLocaleLowerCase();
  if(all('input[type="password"]').length||/사람인지 확인|로봇이 아닙니다|Verify you are human|Checking your browser/i.test(text(document.body)))return stop();
  const link=e=>{
   let raw=e.getAttribute('href');
   if(!raw||/^(?:#|javascript:)/i.test(raw)){
    const handler=e.getAttribute('onclick')||'';if(handler.length>1000)return null;
    raw=handler.match(/^\s*(?:return\s+)?(?:window\.)?(?:open\(\s*|(?:location(?:\.href)?\s*=\s*))(['"])([^'"\r\n]+)\1(?:\s*[,)]|\s*;?\s*$)/)?.[2];
   }
   if(!raw)return null;
   const url=new URL(raw,location.href);
   if(url.origin!=='https://www.doctorville.co.kr'||url.username||url.password||url.port||url.pathname!=='/product/productView'||url.href.length>4096||url.searchParams.getAll('pId').length!==1||!/^[1-9]\d{0,9}$/.test(url.searchParams.get('pId')))return null;
   if([...url.searchParams.keys()].some(k=>/token|auth|session|password|email|ticket/i.test(k)))return null;
   const identity=new URL(url);identity.hash='';
   // These conventional tracking fields do not identify the product. Unknown
   // parameters remain part of identity and cannot be silently discarded.
   for(const key of [...identity.searchParams.keys()])if(/^utm_(source|medium|campaign|content|term|id)$/.test(key))identity.searchParams.delete(key);
   identity.searchParams.sort();return {e,url:url.href,identity:identity.href};
  };
  const links=root=>all('a[href],a[onclick],button[onclick]',root).map(link).filter(Boolean);
  const [year,month,day]=input.date.split('-').map(Number);
  let roots,productName;
  if(input.phase==='today'){
   if(location.pathname!=='/product/main')return stop();
   const dated=root=>{
    const dates=all('.date,[data-date],time',root).map(e=>e.getAttribute('data-date')||e.getAttribute('datetime')||text(e));
    if(root.getAttribute('data-date'))dates.push(root.getAttribute('data-date'));
    const values=dates.map(s=>{let m=s.match(/(20\d{2})\s*[년./-]\s*(\d{1,2})\s*[월./-]\s*(\d{1,2})/);if(m)return [+m[1],+m[2],+m[3]];m=s.match(/(?:^|\D)(\d{1,2})\s*월\s*(\d{1,2})\s*일/);return m?[year,+m[1],+m[2]]:null;}).filter(Boolean);
    return values.length>0&&values.every(v=>v[0]===year&&v[1]===month&&v[2]===day);
   };
   roots=all('.today_quiz').filter(dated);
   if(!roots.length)roots=all('td.today').filter(e=>{
    const table=e.closest('table');if(!table)return false;
    const caption=text(table.querySelector('caption'))||text(table.parentElement?.querySelector('h2,h3,.month'));
    const m=caption.match(/(20\d{2})\s*[년./-]\s*(\d{1,2})/);
    return m&&+m[1]===year&&+m[2]===month&&+text(e.querySelector('.num'))===day;
   });
   const names=[...new Set(roots.flatMap(root=>all('.name',root).map(text)).filter(Boolean))];
   if(names.length!==1||names[0].length>160)return stop();productName=names[0];
  }else if(input.phase==='lookup'){
   if(typeof input.productName!=='string'||!input.productName||input.productName.length>160)return stop();
   productName=input.productName;roots=[document];
  }else return stop();
  let candidates=roots.flatMap(links);
  if(!candidates.length||input.phase==='lookup'||new Set(candidates.map(c=>c.identity)).size>1){
   // Desktop layouts may keep the dated name in the quiz and place its cards
   // elsewhere, just as the original journey's exact-name lookup does.
   const searchRoots=candidates.length?roots:[document];
   const matching=searchRoots.flatMap(links).filter(({e})=>norm(text(e))===norm(productName)||all('.name,.product_name,.product_tit,.prod_name,.tit,h2,h3,h4,strong',e).some(n=>norm(text(n))===norm(productName)));
   // A named card may wrap several equivalent links. Stop at the first parent
   // containing links; do not climb into a sibling product's container.
   for(const root of searchRoots)for(const name of all('.name,.product_name,.product_tit,.prod_name,.tit,h2,h3,h4,strong',root)){
    if(norm(text(name))!==norm(productName))continue;
    for(let p=name,depth=0;p&&p!==document.body&&depth<5;p=p.parentElement,depth++){
     if(root!==document&&p!==root&&!root.contains(p))break;
     const nearby=links(p);if(!nearby.length)continue;
     if(new Set(nearby.map(c=>c.identity)).size===1)matching.push(...nearby);break;
    }
   }
   candidates=matching;
  }
  if(!candidates.length||new Set(candidates.map(c=>c.identity)).size!==1)return stop();
  candidates.sort((a,b)=>a.url.length-b.url.length);
  return {status:'navigate',reason:input.phase==='today'?'today_product_link':'matched_product_link',url:candidates[0].url,productName};
 }catch{return stop();}
}
