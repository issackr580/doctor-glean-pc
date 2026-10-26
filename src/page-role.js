export function pageRole(raw){
 try{
  const u=new URL(raw);
  if(u.protocol!=='https:')return 'other';
  if(u.hostname==='mims-account.shop.co.kr')return 'provider';
  if(/\/(?:auth\/)?(?:login|intro|sign-?in)(?:[/.]|$)/i.test(u.pathname))return 'login';
  if(/symposium|webinar|websim|\/seminar\/main|\/meditv\/live/i.test(u.pathname))return 'catalog';
  if(/attendance|\/event\/attend|offerwall\/attendance/.test(u.pathname))return 'daily';
  if(u.pathname==='/drlounge')return 'lounge';
  if(u.pathname.startsWith('/brandhall'))return 'brand';
  if(u.pathname.startsWith('/product/'))return 'quiz';
  if(u.pathname==='/'||/\/home\.|\/hcp\/main/.test(u.pathname))return 'home';
  return 'other';
 }catch{return 'other';}
}
