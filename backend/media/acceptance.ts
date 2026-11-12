import type {MediaArticle,MediaEvidence,MediaSource} from './public.js';
import type {descriptionAvailability} from './descriptions.js';

export function evaluateMediaAcceptance(articles:MediaArticle[],sources:MediaEvidence[],required:MediaSource[]){
 if(articles.length!==sources.length)throw Error('Article/evidence lengths differ.');
 const evidence=structuredClone(sources);
 const checks=articles.map((article,index)=>{
  const source=evidence[index],reasons:string[]=[];
  const missing=article.restaurants.filter(r=>typeof r.blurb!=='string'||!r.blurb.trim());
  if(!article.title)reasons.push('Article title unavailable.');
  if(!source.fetched_at||!Number.isFinite(Date.parse(source.fetched_at)))reasons.push('Capture time unavailable.');
  if(!article.restaurants.length)reasons.push('No verified restaurant entries.');
  if(!source.count_verified)reasons.push('Restaurant count/order completeness is not verified.');
  if(source.extracted_count!==article.restaurants.length)reasons.push('Evidence count does not match output.');
  if(source.source_kind==='web_index')reasons.push('Only a search-index snapshot is available; live-page completeness is unverified.');
  if(source.count_conflict&&!source.count_verified)reasons.push('Source introductory count and displayed cards disagree without verified card coverage.');
  if(missing.length)reasons.push(`${missing.length} original descriptions not exported.`);
  const complete=reasons.length===0;
  source.status=complete?'complete':article.restaurants.length?'partial':'failed';
  return {source_id:source.source_id,url:article.url,status:source.status,complete,restaurants:article.restaurants.length,descriptions:article.restaurants.length-missing.length,missing_descriptions:missing.length,blocking_reasons:reasons,warnings:source.issues};
 });
 const present=new Set(articles.map(a=>a.url));
 const missingSources=required.filter(s=>!present.has(s.url)).map(s=>s.id);
 const complete=checks.length>0&&checks.every(c=>c.complete);
 return {evidence,acceptance:{complete,ready_for_delivery:complete&&!missingSources.length,scope:missingSources.length?'selected_sources':'all_required_sources',missing_sources:missingSources,source_count:checks.length,restaurant_count:checks.reduce((n,c)=>n+c.restaurants,0),descriptions_available:checks.reduce((n,c)=>n+c.descriptions,0),descriptions_missing:checks.reduce((n,c)=>n+c.missing_descriptions,0),sources:checks}};
}

export function missingDescriptions(articles:MediaArticle[]){
 return articles.flatMap(a=>{const restaurants=a.restaurants.filter(r=>!r.blurb?.trim()).map(r=>({rank:r.rank,name:r.name,blurb:''}));return restaurants.length?[{url:a.url,restaurants}]:[];});
}

export function mediaAcceptanceReport(result:ReturnType<typeof evaluateMediaAcceptance>['acceptance'],availability?:ReturnType<typeof descriptionAvailability>){
 const cell=(s:unknown)=>String(s??'—').replace(/\|/g,'\\|').replace(/[\r\n]/g,' ');
 const lines=['# Issue #15 验收报告','',`范围：${result.scope}；当前范围完成：${result.complete}；全部来源完整数据：${result.ready_for_delivery}。`,`来源 ${result.source_count} 个；餐厅条目 ${result.restaurant_count} 个；原文已导出 ${result.descriptions_available} 条，未导出 ${result.descriptions_missing} 条。`,'','| 来源 | 状态 | 条目 | 未导出原文 | 待解决 |','|---|---|---:|---:|---|'];
 for(const s of result.sources)lines.push('| '+[s.source_id,s.status,s.restaurants,s.missing_descriptions,s.blocking_reasons.join('；')].map(cell).join(' | ')+' |');
 if(availability)lines.push('',`现有输入核验：原文存在 ${availability.present} 条；已确认空介绍 ${availability.confirmed_absent} 条；状态未知 ${availability.unknown} 条。`,`未导出原因：未选择导出 ${availability.counts.not_selected} 条，解析未成功 ${availability.counts.parse_failed} 条，未核验 ${availability.counts.not_checked} 条。逐条证据见 description-availability.json。`);
 lines.push('','## 字段限制与来源说明','', '地址缺失、来源未标日期或日期冲突均保留 null 并说明，不自动判定为零上榜或猜测补全。索引快照的条目数量核对不等于实时页面完整性核验。');
 for(const s of result.sources)for(const warning of s.warnings)lines.push(`- ${cell(s.source_id)}：${cell(warning)}`);
 lines.push('','尚未导出的条目已列入 supplied-texts.template.json；这不表示来源没有原文。填写可使用的原文后导入；未填写的条目需移除，不能以占位文本通过验收。','');
 return lines.join('\n');
}
