import {normalizeCapture,inferPane} from './content.mjs';
export function allowedUrl(value) {
  try {const u=new URL(value);return u.protocol==='https:' && ['www.google.com','google.com','maps.google.com'].includes(u.hostname) && /^\/maps(?:\/|$)/.test(u.pathname);} catch {return false;}
}
const normalize=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
export function listingKey(value) {
  const u=new URL(value);
  const token=[...u.pathname.matchAll(/!1s([^!/?]+)/g)].at(-1)?.[1];
  if (token) return 'maps:'+decodeURIComponent(token);
  if (u.searchParams.get('cid')) return 'cid:'+u.searchParams.get('cid');
  if (u.searchParams.get('query_place_id')) return 'place:'+u.searchParams.get('query_place_id');
  return null;
}
export function addSnapshot(session,snapshot) {
  if (!allowedUrl(snapshot.url) || !snapshot.id || !snapshot.capturedAt || !snapshot.data) throw new Error('采集记录格式无效');
  for (const key of ['name','address','phone','website','description'])
    if(snapshot.data[key] != null && (typeof snapshot.data[key]!=='string' || snapshot.data[key].length>10000))throw new Error('采集字段格式无效或过长');
  if(snapshot.data.dishes != null && (!Array.isArray(snapshot.data.dishes) || snapshot.data.dishes.length>30 || snapshot.data.dishes.some(d=>typeof d!=='string' || d.length>120)))throw new Error('菜名需为每行一个的简短文字，最多 30 项');
  if (!session) {
    if (!snapshot.data.name || !snapshot.data.address) throw new Error('请先进入门店“概览”页采集名称与地址，再采集其他栏目');
    session={schemaVersion:'google-maps.manual-session.v1',id:snapshot.id,restaurant:{name:snapshot.data.name,address:snapshot.data.address,key:listingKey(snapshot.url)},snapshots:[]};
  }
  // Rebuild old session keys from the selected place, never from an earlier region in the URL.
  const existingKeys=[...new Set(session.snapshots.map(s=>listingKey(s.url)).filter(Boolean))];
  if(existingKeys.length>1)throw new Error('旧记录含多个门店标识，请先导出并分开整理');
  if(existingKeys.length)session={...session,restaurant:{...session.restaurant,key:existingKeys[0]}};
  if (session.snapshots.length>=100) throw new Error('本次已达 100 份快照，请先导出再新建采集');
  const a=session.restaurant,b=snapshot.data,key=listingKey(snapshot.url);
  if (a.key && key && a.key!==key) throw new Error('当前页面属于另一门店，请先导出原记录，再新建采集');
  if (!(a.key && key && a.key===key)) {
    if (!b.name || !b.address || normalize(a.name)!==normalize(b.name) || normalize(a.address)!==normalize(b.address))
      throw new Error('当前页面缺少可验证的同店标识，请返回该门店概览页后重试');
  }
  return {...session,restaurant:{...session.restaurant,key:session.restaurant.key || key},snapshots:[...session.snapshots,snapshot]};
}
export function exportSession(session) {
  if (!session?.snapshots?.length) throw new Error('尚未采集任何页面');
  const values={name:session.restaurant.name,address:session.restaurant.address,phone:null,website:null,description:null,dishes:[]};
  const sources={};const conflicts=[],descriptionVariants=[],menuSections=[],attributeSections=[];
  for (const s of session.snapshots) {
    const detected=inferPane(s.url,s.data.selectedTabs);
    const pane=detected==='unknown'?s.pane:detected;
    const data=normalizeCapture(s.data,pane,s.menuCategory||s.data.menuCategory);
    for (const k of ['name','address','phone','website']) {
      const value=data[k];if (!value || (k==='name' && pane!=='overview' && data.evidence?.name==='document.title')) continue;
      if (values[k] && normalize(values[k])!==normalize(value)) conflicts.push({field:k,previous:values[k],observed:value,snapshotId:s.id});
      // Keep different observations visible instead of silently replacing an earlier fact.
      if (!values[k]) values[k]=value;
      if (!sources[k]) sources[k]={snapshotId:s.id,url:s.url,pane,kind:data.evidence?.[k] || 'page_observation'};
    }
    if(data.description){
      const source={snapshotId:s.id,url:s.url,pane,kind:data.descriptionKind||'page_observation'};
      if(!descriptionVariants.some(v=>normalize(v.text)===normalize(data.description)))descriptionVariants.push({text:data.description,source});
      if(!values.description || data.evidence?.description==='human_selection'){
        values.description=data.description;sources.description=source;
      }
    }
    if(data.menu){
      let section=menuSections.find(g=>normalize(g.category)===normalize(data.menu.category));
      if(!section){section={category:data.menu.category,items:[],observations:[]};menuSections.push(section);}
      section.observations.push({snapshotId:s.id,url:s.url,rawText:data.menu.rawText,parseStatus:data.menu.parseStatus});
      for(const item of data.menu.items){
        // Match parsed values explicitly; source metadata differs on every capture.
        const prior=section.items.find(v=>v.name===item.name && v.description===item.description && v.price===item.price);
        if(prior){if(!prior.sources.includes(s.id))prior.sources.push(s.id);}
        else section.items.push({...item,sources:[s.id]});
      }
    }
    for(const group of data.attributes?.sections||[]){
      let section=attributeSections.find(g=>normalize(g.category)===normalize(group.category));
      if(!section){section={category:group.category,items:[]};attributeSections.push(section);}
      for(const item of group.items)if(!section.items.some(v=>v.text===item.text && v.availability===item.availability))section.items.push({...item,snapshotId:s.id});
    }
    for (const d of data.dishes || []) {
      if (!values.dishes.includes(d)) values.dishes.push(d);
    }
    if (data.dishes?.length) (sources.dishes ||= []).push({snapshotId:s.id,url:s.url,pane,kind:data.dishKind || 'platform_featured_dishes'});
  }
  const field=(v,source)=>({value:Array.isArray(v) ? v.length ? v : null : v || null,status:(Array.isArray(v) ? v.length : v) ? 'observed' : 'not_collected',source:source || null});
  const fields={name:field(values.name,sources.name),address:field(values.address,sources.address),
    contact:field(values.phone || values.website ? {phone:values.phone,website:values.website} : null,{phone:sources.phone || null,website:sources.website || null}),
    description:field(values.description,sources.description),specialties:field(values.dishes,sources.dishes),
    menu:field(menuSections.length?menuSections:null,menuSections.flatMap(g=>g.observations.map(o=>o.snapshotId))),
    attributes:field(attributeSections.length?attributeSections:null,attributeSections.flatMap(g=>g.items.map(i=>i.snapshotId)))};
  const key=listingKey(session.snapshots[0].url);
  return {schemaVersion:'google-maps.manual.v2',method:'human_navigation_extension_capture',exportedAt:new Date().toISOString(),
    restaurant:{...session.restaurant,key:key||session.restaurant.key},platforms:{google_maps:{fields}},conflicts,descriptionVariants,
    completeness:Object.values(fields).every(f=>f.status==='observed') ? 'complete' : 'partial',snapshots:session.snapshots};
}
