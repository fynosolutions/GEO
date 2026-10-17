import {extractDocument} from './extract.mjs';
import {allowedUrl,addSnapshot,exportSession} from './session.mjs';
import {inferPane,normalizeCapture,canonicalJson} from './content.mjs';
let session=null;
const $=id=>document.getElementById(id);
function status(message,error=false){$('status').textContent=message;$('status').className=error ? 'error' : '';}
function render(){
  $('preview').replaceChildren();$('download').disabled=!session;
  if(!session)return;
  const result=exportSession(session),f=result.platforms.google_maps.fields;
  for(const [label,value] of [['门店',session.restaurant.name],['地址',session.restaurant.address],['联系方式',f.contact.value ? [f.contact.value.phone,f.contact.value.website].filter(Boolean).join(' · ') : null],['简介',f.description.value],['特色/热门菜',f.specialties.value?.join('、')]]){
    const heading=document.createElement('strong'),text=document.createElement('span');heading.textContent=label;text.textContent=value || '未采集到';$('preview').append(heading,text);
  }
  for(const group of f.menu.value || []){
    const section=document.createElement('section');section.className='menu-group';
    const title=document.createElement('strong');title.textContent=`菜单 · ${group.category}（${group.items.length} 项）`;section.append(title);
    for(const item of group.items){const p=document.createElement('p');p.className='menu-item';p.textContent=`${item.name} ${item.price || ''}${item.description?' — '+item.description:''}${item.parseStatus==='needs_review'?'（待复核）':''}`;section.append(p);}
    if(!group.items.length){const p=document.createElement('p');p.textContent='已保存菜单原文，待结构化识别';section.append(p);}
    $('preview').append(section);
  }
  if(f.attributes.value?.length){
    const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent=`About 设施与服务（${f.attributes.value.length} 组）`;details.append(summary);
    for(const group of f.attributes.value){const p=document.createElement('p');p.textContent=`${group.category}：${group.items.map(i=>i.text+(i.availability==='no'?'（不提供）':'')).join('；')}`;details.append(p);}
    $('preview').append(details);
  }
  status(`已保存 ${session.snapshots.length} 份页面观察。${result.conflicts.length ? `有 ${result.conflicts.length} 项基础字段差异待复核。` : ''}`);
}
async function readPage(){
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(!tab?.id || !allowedUrl(tab.url))throw new Error('请先打开 google.com/maps 的指定餐厅详情');
  const [{result:data}]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:extractDocument,args:['google_maps']});
  const [{result:meta}]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>({url:location.href,title:document.title,selection:window.getSelection()?.toString() || ''})});
  if(!allowedUrl(meta.url))throw new Error('页面已跳转，请返回门店后重试');
  if(!data.name){data.name=meta.title.replace(/\s*[-–]\s*Google Maps\s*$/i,'').trim();data.evidence.name='document.title';}
  const detected=inferPane(meta.url,data.selectedTabs || []);
  const pane=$('pane').value==='auto' ? detected==='unknown' && data.address?'overview':detected : $('pane').value;
  $('detected').textContent=`识别栏目：${{overview:'概览',about:'About 设施与服务',menu:'Menu 分类菜单',reviews:'评价',unknown:'未知，请手动选择'}[pane]}`;
  $('menu-category-field').hidden=pane!=='menu';
  if(pane!=='menu')$('menu-category').value='';
  else if(!$('menu-category').value && data.menuCategory && !/^(about|简介|关于)(?:\s|$)/i.test(data.menuCategory))$('menu-category').value=data.menuCategory;
  const list=$('category-options');
  for(const category of data.menuCategories || [])if(![...list.options].some(o=>o.value===category)){const option=document.createElement('option');option.value=category;list.append(option);}
  return {data,meta,pane};
}
async function capture(selection=false){
  $('capture').disabled=true;$('selection').disabled=true;
  try{
    const {data,meta,pane}=await readPage();
    if(pane==='unknown' || pane==='reviews')throw new Error('请进入概览、About 或 Menu，或者手动选择正确栏目');
    let text='';
    if(selection){
      text=meta.selection.trim();if(!text)throw new Error('未选中文字。请关闭弹窗，在页面选中内容，再点击此按钮');
      if(text.length>40000)throw new Error('选中文字过长，请分菜单子分类采集');
    }
    const category=pane==='menu' ? $('menu-category').value.trim() : '';
    const snapshot={id:crypto.randomUUID(),url:meta.url,capturedAt:new Date().toISOString(),pane,menuCategory:category,
      data:normalizeCapture(data,pane,category,text,$('selection-kind').value),hashAlgorithm:'sha256-canonical-json-v1'};
    const bytes=new TextEncoder().encode(canonicalJson(snapshot));
    snapshot.sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
    const next=addSnapshot(session,snapshot);
    await chrome.storage.local.set({session:next});session=next;render();
  }catch(e){status(e.message,true);}finally{$('capture').disabled=false;$('selection').disabled=false;}
}
$('capture').addEventListener('click',()=>capture());
$('pane').addEventListener('change',()=>readPage().catch(e=>status(e.message,true)));
$('selection').addEventListener('click',()=>capture(true));
$('download').addEventListener('click',()=>{
  try{const result=exportSession(session),blob=new Blob([JSON.stringify(result,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=`google-maps-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
  }catch(e){status(e.message,true);}
});
$('reset').addEventListener('click',async()=>{
  if(session && !confirm('开始新餐厅采集会清除当前浏览器内的记录，请先导出。是否继续？'))return;
  await chrome.storage.local.remove('session');session=null;render();status('请先在门店概览页采集名称与地址。');
});
try{session=(await chrome.storage.local.get('session')).session || null;render();if(!session)status('请先进入门店概览页，点击“采集当前页”。');}
catch(e){status(e.message,true);}
try{await readPage();}catch(e){$('detected').textContent=e.message;}
