export const ABOUT_HEADINGS=['Accessibility','Service options','Highlights','Popular for','Offerings','Dining options','Amenities','Atmosphere','Crowd','Planning','Payments','Parking','Children','Pets','From the business','无障碍设施','服务选项','特色','热门','提供','用餐选项','设施','氛围','客群','规划','付款','停车','儿童','宠物'];
const clean=s=>String(s||'').replace(/[\uE000-\uF8FF]/g,'').replace(/\u00a0/g,' ').trim();
const norm=s=>clean(s).normalize('NFKC').toLowerCase().replace(/\s+/g,' ');
export function inferPane(url,selectedTabs=[]){
  // Maps can update the selected tab before updating the URL. Explicit primary
  // tabs take precedence; Overview alone may be a nested menu category.
  for(const [pane,re] of [['about',/^(about|简介|关于)(?:\s|$)/i],['reviews',/^(reviews|评价|评论)(?:\s|$)/i],['menu',/^(menu|菜单)(?:\s|$)/i]])
    if(selectedTabs.some(t=>re.test(clean(t))))return pane;
  const modes=[...String(url).matchAll(/!10e(\d+)(?=!|\?|&|$)/g)];
  const mode=modes.at(-1)?.[1];
  if(mode==='9')return 'menu';
  if(mode==='1')return 'about';
  if(mode==='3')return 'reviews';
  for(const [pane,re] of [['menu',/^(menu|菜单)(?:\s|$)/i],['about',/^(about|简介|关于)(?:\s|$)/i],['reviews',/^(reviews|评价|评论)(?:\s|$)/i]])
    if(selectedTabs.some(t=>re.test(t)))return pane;
  if(selectedTabs.some(t=>/^(overview|概览)(?:\s|$)/i.test(t)))return 'overview';
  return 'unknown';
}
export function parseAboutText(raw){
  const sections=[];let current=null,mark='unknown';
  for(const line of String(raw||'').split(/\n/)){
    if(line.includes('\ue5ca'))mark='yes';else if(line.includes('\ue5cd'))mark='no';
    const value=clean(line);if(!value)continue;
    const heading=ABOUT_HEADINGS.find(h=>norm(h)===norm(value));
    if(heading){current={category:heading,items:[]};sections.push(current);mark='unknown';continue;}
    if(current && !/^(sign in|see more|about this data|you're seeing a limited view|登录)$/i.test(value)){
      current.items.push({text:value,availability:mark});mark='unknown';
    }
  }
  return {sections:sections.filter(s=>s.items.length),rawText:String(raw||'')};
}
export function parseMenuText(raw,{category='未标注分类',skipLabels=[]}={}){
  const skip=new Set(['menu','overview','about','reviews','菜单','概览'].map(norm));
  // Match whole UI labels, never substrings: a dish description mentioning
  // reservations or tables must remain intact.
  const pageControls=new Set(['Secure your spot','See tables and times','Reserve a table',
    'Find a table','Book a table','Make a reservation','Sort','Search menu','See all','View menu',
    '预订餐桌','预订座位','查找餐桌','查看菜单','搜索菜单','查看全部'].map(norm));
  const navigation=new Set([category,...skipLabels].map(norm));
  const lines=String(raw||'').split(/\n/).map(clean).filter(Boolean);
  const items=[];let block=[];
  for(const line of lines){
    if(/^(?:US\s*)?\$\s*\d[\d,]*(?:\.\d{1,2})?(?:\s*[-–]\s*\$?\s*\d[\d,]*(?:\.\d{1,2})?)?$/.test(line)){
      const content=block.filter(s=>!skip.has(norm(s)) && !pageControls.has(norm(s)));
      while(content.length>2 && navigation.has(norm(content[0])))content.shift();
      if(content.length)items.push({name:content[0],description:content.slice(1).join('\n') || null,price:line,
        parseStatus:content.length<=3?'parsed':'needs_review',rawText:[...content,line].join('\n')});
      block=[];
    }else block.push(line);
  }
  return {category:clean(category)||'未标注分类',items,rawText:String(raw||''),parseStatus:items.length?'price_delimited':'raw_only'};
}
export function normalizeCapture(data,pane,category='',selection='',target='auto'){
  const result={...data,evidence:{...data.evidence}};
  const menuCategory=clean(category||data.menuCategory)||'未标注分类';
  if(pane==='menu'){
    if(result.description){result.menuText ||= result.description;result.description='';result.descriptionKind=null;result.evidence.description=null;}
    // Reparse previously saved menus with the current filter. A selected-text
    // capture owns its rawText, so do not replace it with the full page text.
    const menuRaw=result.menu?.rawText ?? result.menuText;
    if(menuRaw)result.menu=parseMenuText(menuRaw,{category:clean(result.menu?.category)||menuCategory,skipLabels:[data.name,...(data.menuCategories||[])]});
  }
  if(pane==='about'){
    delete result.menu;delete result.menuText;delete result.menuCategory;
    const about=parseAboutText(result.aboutText || result.description || '');
    if(about.sections.length){
      result.attributes ||= about;
      if(parseAboutText(result.description).sections.length){result.description='';result.descriptionKind=null;result.evidence.description=null;}
    }
  }
  if(selection){
    let kind=target==='auto' ? pane==='menu'?'menu':pane==='about'?'about':'description' : target;
    if(kind==='menu'){result.menu=parseMenuText(selection,{category:menuCategory});result.evidence.menu='human_selection';}
    else if(kind==='about'){
      const about=parseAboutText(selection);
      if(about.sections.length){result.attributes=about;result.evidence.attributes='human_selection';}
      else{result.description=selection;result.descriptionKind='human_selected_page_text';result.evidence.description='human_selection';}
    }else if(kind==='dishes'){
      result.dishes=selection.split(/\n+/).map(clean).filter(Boolean);result.dishKind='human_selected_dish_names';result.evidence.specialties='human_selection';
    }else{result.description=selection;result.descriptionKind='human_selected_page_text';result.evidence.description='human_selection';}
  }
  return result;
}
export function canonicalJson(value){
  if(value===null || typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(canonicalJson).join(',')+']';
  return '{'+Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonicalJson(value[k])).join(',')+'}';
}
export function hashInputs(snapshot){
  const {sha256,...payload}=snapshot;
  if(snapshot.hashAlgorithm==='sha256-canonical-json-v1')return [canonicalJson(payload)];
  return [JSON.stringify(payload),JSON.stringify({id:snapshot.id,url:snapshot.url,capturedAt:snapshot.capturedAt,pane:snapshot.pane,data:snapshot.data})];
}
