(function doctorvilleQuizJourney(input){
 const reply=(status,reason,extra={})=>({status,reason,...extra});
 const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
 const norm=s=>clean(s).normalize('NFKC').replace(/[\s®™]/g,'').toLocaleLowerCase();
 const visible=e=>!!e&&e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none'&&!e.closest('[hidden],header,nav,footer');
 const all=(selector,root=document)=>[...root.querySelectorAll(selector)].filter(visible);
 const text=e=>clean(e?.innerText||e?.textContent);
 const today=()=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]));return p.year+'-'+p.month+'-'+p.day;};
 const route=raw=>{try{const u=new URL(raw,location.href);return u.origin==='https://www.doctorville.co.kr'&&!u.username&&!u.password&&/^\/product\/[a-zA-Z][a-zA-Z0-9/_-]*$/.test(u.pathname)&&!/(?:logout|delete|remove|submit|regist|create|update|answer|claim)/i.test(u.pathname)&&u.href.length<=4096?u.href:null;}catch{return null;}};
 const product=raw=>{try{const u=new URL(raw);return u.pathname==='/product/productView'&&u.searchParams.getAll('pId').length===1&&/^[1-9]\d{0,9}$/.test(u.searchParams.get('pId'));}catch{return false;}};
 if(!input||input.expectedUrl!==location.href||!route(location.href)||window.top!==window.self)return reply('stopped','outside_page');
 if(input.date!==today())return reply('stopped','day_changed');
 if(document.readyState!=='complete'||document.visibilityState!=='visible')return reply('loading','page_not_ready');
 if(all('input[type=password]').length)return reply('stopped','login_required');
 if(/사람인지 확인|로봇이 아닙니다|Verify you are human|Checking your browser/i.test(text(document.body)))return reply('stopped','challenge');
 // A URL must be present in an existing link or a literal site navigation handler.
 // Never synthesize a product ID or evaluate the handler's JavaScript.
 const href=e=>{
  const raw=e.getAttribute('href');if(raw&&!/^(?:#|javascript:)/i.test(raw))return route(raw);
  const handler=e.getAttribute('onclick')||'';if(handler.length>1000)return null;
  const m=handler.match(/^\s*(?:return\s+)?(?:window\.)?(?:open\(\s*|(?:location(?:\.href)?\s*=\s*))(['"])([^'"\r\n]+)\1(?:\s*[,)]|\s*;?\s*$)/);
  return m?route(m[2]):null;
 };
 const links=root=>all('a[href],a[onclick],button[onclick]',root).map(e=>({e,url:href(e)})).filter(x=>x.url);
 const names=root=>all('.name,.product_name,.product_tit,.prod_name,.tit,h2,h3,h4,strong',root).map(text).filter(Boolean);
 const matching=(root,name)=>{
  const found=new Set();
  for(const {e,url} of links(root))if(product(url)&&(norm(text(e))===norm(name)||names(e).some(n=>norm(n)===norm(name))))found.add(url);
  for(const e of all('.name,.product_name,.product_tit,.prod_name,.tit,h2,h3,h4,strong',root)){
   if(norm(text(e))!==norm(name))continue;
   for(let p=e,depth=0;p&&p!==document.body&&depth<5;p=p.parentElement,depth++){
    const urls=new Set(links(p).map(x=>x.url).filter(product));if(urls.size>1)break;
    if(urls.size===1){found.add([...urls][0]);break;}
   }
  }
  return [...found];
 };
 if(input.phase==='today'){
  if(new URL(location.href).pathname!=='/product/main')return reply('stopped','today_page_required');
  const [year,month,day]=input.date.split('-').map(Number);
  const dated=root=>{
   const dates=all('.date,[data-date],time',root).map(e=>e.getAttribute('data-date')||e.getAttribute('datetime')||text(e));
   const own=root.getAttribute('data-date');if(own)dates.push(own);
   const values=dates.map(s=>{let m=s.match(/(20\d{2})\s*[년./-]\s*(\d{1,2})\s*[월./-]\s*(\d{1,2})/);if(m)return [+m[1],+m[2],+m[3]];m=s.match(/(?:^|\D)(\d{1,2})\s*월\s*(\d{1,2})\s*일/);return m?[year,+m[1],+m[2]]:null;}).filter(Boolean);
   return values.length>0&&values.every(v=>v[0]===year&&v[1]===month&&v[2]===day);
  };
  let roots=all('.today_quiz').filter(dated);
  // Calendar fallback requires the displayed year/month and exact today's cell.
  if(!roots.length)roots=all('td.today').filter(e=>{
   const table=e.closest('table');if(!table)return false;
   const caption=text(table.querySelector('caption'))||text(table.parentElement?.querySelector('h2,h3,.month'));
   const m=caption.match(/(20\d{2})\s*[년./-]\s*(\d{1,2})/);
   return m&&+m[1]===year&&+m[2]===month&&+text(e.querySelector('.num'))===day;
  });
  if(!roots.length)return reply('stopped','today_quiz_missing');
  const products=[...new Set(roots.flatMap(root=>all('.name',root).map(text)).filter(s=>s&&s.length<=160))];
  if(products.length!==1)return reply('stopped','today_product_ambiguous');
  const productName=products[0],direct=[...new Set(roots.flatMap(root=>links(root).map(x=>x.url)).filter(product))];
  if(direct.length>1)return reply('stopped','product_link_ambiguous');
  if(direct.length===1)return reply('navigate','today_product_link',{url:direct[0],productName});
  const matches=matching(document,productName);
  if(matches.length>1)return reply('stopped','product_link_ambiguous');
  if(matches.length===1)return reply('navigate','matched_product_link',{url:matches[0],productName});
  let targets=[...new Set(roots.flatMap(root=>links(root).map(x=>x.url)))];
  if(!targets.length)targets=[...new Set(all('a.ico_quiz,a[aria-label],button[onclick]').filter(e=>/^(?:오늘의?\s*)?퀴즈\s*(?:풀기|참여하기|풀고\s*포인트\s*적립)$/.test(text(e)||e.getAttribute('aria-label')||'')).map(href).filter(Boolean))];
  targets=targets.filter(u=>u!==location.href);
  if(targets.length!==1)return reply('stopped',targets.length?'product_link_ambiguous':'today_link_missing');
  return reply('navigate','today_catalog_link',{url:targets[0],productName});
 }
 if(input.phase==='lookup'){
  if(typeof input.productName!=='string'||!input.productName||input.productName.length>160)return reply('stopped','today_product_ambiguous');
  const matches=matching(document,input.productName);
  if(matches.length!==1)return reply('stopped',matches.length?'product_link_ambiguous':'product_not_found');
  return reply('navigate','matched_product_link',{url:matches[0],productName:input.productName});
 }
 return reply('stopped','invalid_request');
})