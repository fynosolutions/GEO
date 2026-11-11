import type {MediaArticle,MediaEvidence} from './public.js';
export type MediaTarget={id:string;name:string;address:string;aliases:string[]};
const norm=(s:string)=>s.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g,'');
const street=(s:string)=>norm(s.split(',')[0].replace(/\b(street|avenue)\b/gi,w=>w.toLowerCase()==='street'?'St':'Ave').replace(/\bthird\b/gi,'3rd'));
const cell=(s:string)=>s.replace(/\|/g,'\\|').replace(/[\r\n]+/g,' ');
export function mediaMembershipReport(articles:MediaArticle[],evidence:MediaEvidence[],targets:MediaTarget[]){
 if(targets.length!==6||new Set(targets.map(t=>t.id)).size!==6)throw Error('Expected six unique media target branches.');
 const link=(a:MediaArticle)=>`[${cell(a.title??a.site)}](${a.url})`;
 const rows=targets.map(target=>{
  const matches=articles.flatMap((article,index)=>article.restaurants.filter(r=>target.aliases.some(alias=>norm(r.name)===norm(alias))).map(r=>({article,r,evidence:evidence[index]})));
  const confirmed=matches.filter(m=>m.evidence.source_id!=='reddit-hot-pot'&&m.r.address&&street(m.r.address)===street(target.address)&&m.evidence.count_verified&&['direct_html','browser_dom','user_saved_html'].includes(m.evidence.source_kind??''));
  const urls=new Set(confirmed.map(m=>m.article.url));
  return {target,matches,confirmed:[...urls].map(url=>confirmed.find(m=>m.article.url===url)!),other:matches.filter(m=>!confirmed.includes(m))};
 });
 const lines=['# 六家店上榜表','','统计对象为下列具体分店。主表只计入名称、门牌与街道相符，且条目数量核对通过的直接采集页面；目录单列。社区提及、地址不详和其他分店不计入已确认榜单。','', '| 店 | 地址 | 已确认媒体榜单 | 哪几篇 | 目录收录 |','|---|---|---:|---|---|'];
 for(const row of rows){const editorial=row.confirmed.filter(m=>m.evidence.source_id!=='infatuation-hot-pot-directory'),directory=row.confirmed.filter(m=>m.evidence.source_id==='infatuation-hot-pot-directory');lines.push(`| ${cell(row.target.name)} | ${cell(row.target.address)} | ${editorial.length} | ${editorial.map(m=>link(m.article)).join('；')||'未在本次已核对的榜单条目中确认'} | ${directory.map(m=>link(m.article)).join('；')||'未确认'} |`);}
 lines.push('','## 同名、品牌及社区提及','','| 店 | 来源 | 原文店名 | 页面地址 | 处理 |','|---|---|---|---|---|');
 for(const row of rows)for(const m of row.other)lines.push(`| ${cell(row.target.name)} | ${link(m.article)} | ${cell(m.r.name)} | ${cell(m.r.address??'未提供')} | ${!m.r.address?'地址不足，保留提及，不确认分店':street(m.r.address)!==street(row.target.address)?'地址不同，未计入目标分店':!m.evidence.count_verified?'条目完整性未核实，未计入已确认榜单':'仅有索引或间接证据，未计入已确认榜单'} |`);
 lines.push('','## 核对范围','','| 来源 | 条目数 | 数量与顺序 | 读取方式 |','|---|---:|---|---|');
 articles.forEach((a,i)=>lines.push(`| ${link(a)} | ${a.restaurants.length} | ${evidence[i].count_verified?'通过':'未验证完整性'} | ${evidence[i].source_kind==='web_index'?'搜索索引快照':evidence[i].source_kind==='user_saved_html'?'用户保存的原站HTML':evidence[i].source_kind==='browser_dom'?'原站浏览器DOM':'直接页面'} |`));
 lines.push('','0 表示在本次已核对的媒体榜单中未确认该分店上榜，不代表从未被报道。火锅目录为分类收录；Reddit 为社区讨论，其评论覆盖和删除状态见 evidence.json，不计入媒体榜单数。米其林读取方式见上表；页面显示三家，介绍段落仍写四家。已获得的原文保留；缺失 blurb 为 null。具体原因、时间及日期冲突见 evidence.json。','');
 return lines.join('\n');
}
