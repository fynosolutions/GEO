export const platformDomains:Record<string,string>={'google.com':'google_maps','yelp.com':'yelp','opentable.com':'opentable','resy.com':'resy','doordash.com':'doordash','ubereats.com':'uber_eats','grubhub.com':'grubhub','facebook.com':'facebook','instagram.com':'instagram'};
export const canonicalPlatform=(value:string)=>platformDomains[value]||value;
export function validMenuCandidate(url:string,platform:string){
 try{
  const u=new URL(url);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return false;
  const path=u.pathname.toLowerCase();
  if(platform==='yelp')return /^\/(biz|menu)\/[^/]+\/?$/.test(path);
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
