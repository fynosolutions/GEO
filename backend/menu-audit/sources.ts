export const platformDomains:Record<string,string>={'google.com':'google_maps','yelp.com':'yelp','opentable.com':'opentable','resy.com':'resy','doordash.com':'doordash','ubereats.com':'uber_eats','grubhub.com':'grubhub','facebook.com':'facebook','instagram.com':'instagram'};
export const canonicalPlatform=(value:string)=>platformDomains[value]||value;
export function validMenuCandidate(url:string,platform:string){
 try{
  const u=new URL(url);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return false;
  const path=u.pathname.toLowerCase();
  if(platform==='yelp')return /^(www\.|m\.)?yelp\.com$/i.test(u.hostname)&&/^\/(biz|menu|biz_photos)\/[^/]+\/?$/.test(path);
  if(platform==='facebook')return !/^\/(groups|watch|reel|share|search)(\/|$)/.test(path)&&!path.includes('/videos/');
  if(platform==='instagram')return !/^\/(explore|reels|accounts)(\/|$)/.test(path);
  return true;
 }catch{return false;}
}
export function summarizePlatforms(selected:string[],attempts:any[],menus:any[],supported:(p:string)=>boolean){
 return selected.map(platform=>{
  const sources=attempts.filter(a=>canonicalPlatform(a.platform)===platform),found=menus.some(m=>canonicalPlatform(m.platform)===platform);
  const failed=sources.some(a=>['error','unverified','not_checked'].includes(a.status));
  return {platform,found,status:!supported(platform)?'unsupported':found?'found':failed?'incomplete':sources.length?'not_found':'not_checked',attempts:sources.length};
 });
}

// Canonical comparison only: preserve meaningful query parameters and source evidence.
export function menuUrlKey(value:string):string{
 try{const url=new URL(value);if(!orderingProvider(value))url.hash='';
 for(const key of [...url.searchParams.keys()])if(/^utm_/i.test(key)||['srsltid','gclid','fbclid','msclkid'].includes(key.toLowerCase()))url.searchParams.delete(key);
 url.searchParams.sort();return url.href;}catch{return value;}
}

// Public ordering destinations may be linked from a verified official website.
export function orderingProvider(value:string):'mealkeyway'|'chowbus'|null {
 try {const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
 if(u.hostname==='order.mealkeyway.com'&&u.pathname==='/customer/release/index'&&u.searchParams.has('mid'))return 'mealkeyway';
 if(u.hostname==='pos.chowbus.com'&&/^\/online-ordering\/store\/[^/]+\/\d+\/?$/.test(u.pathname))return 'chowbus';
 }catch{}return null;
}
export function yelpMenuUrl(value:string):string|null {
 try {const u=new URL(value);if(!/^(www\.|m\.)?yelp\.com$/.test(u.hostname)||!/^\/biz\/[^/]+\/?$/.test(u.pathname))return null;
 u.protocol='https:';u.hostname='www.yelp.com';u.pathname=u.pathname.replace('/biz/','/menu/');u.search='';u.hash='';return u.href;
 }catch{return null;}
}
