import type {MediaSource,MediaArticle,MediaEvidence} from './public.js';

const plain=(s:string)=>s.replace(/【\d+†([^】]*)】/g,'$1').trim();
export function parseIndexedMedia(raw:string,source:MediaSource,fetchedAt:string){
 if(!raw.split('\n')[0].includes('('+source.url+')'))throw Error('Indexed page URL does not match the configured source.');
 const lines=raw.split('\n').flatMap(s=>{const m=s.match(/^L\d+: ?(.*)$/);return m?[m[1]]:[];});
 const article:MediaArticle={url:source.url,site:source.site,title:plain(lines.find(s=>s.startsWith('# '))?.slice(2)??'')||null,published:null,updated:null,restaurants:[]};
 const sourceAge=raw.match(/Crawled: ([^;\n]+)/)?.[1]??'unavailable';
 const issues=[`Search-index snapshot; reported crawl age: ${sourceAge}. Not a fresh direct HTML capture.`,'Full copyrighted descriptions are not included; blurb remains null.'];
 const evidence:MediaEvidence={source_id:source.id,fetched_at:fetchedAt,source_kind:'web_index',source_age:sourceAge,status:'partial',expected_count:null,extracted_count:0,count_verified:false,issues,dates:[]};
 if(source.id==='michelin-dim-sum'){
  const declared=lines.map(plain).map(s=>s.match(/\b(\d+) Restaurants\b/)).find(Boolean);evidence.expected_count=declared?Number(declared[1]):null;
  const end=lines.findIndex(s=>s.startsWith('## Find our other best-of guides'));const body=end>=0?lines.slice(0,end):lines;
  body.forEach((line,i)=>{if(!line.startsWith('##### '))return;const name=plain(line.slice(6));const address=body.slice(i+1).find(s=>s.trim());if(name)article.restaurants.push({name,rank:article.restaurants.length+1,address:address?plain(address):null,blurb:null});});
  const updated=body.find(s=>s.startsWith('Updated on '));if(updated){const value=updated.slice(11),parsed=Date.parse(value+' UTC');if(Number.isFinite(parsed)){article.updated=new Date(parsed).toISOString().slice(0,10);evidence.dates.push({field:'updated',value,source:'visible indexed text'});}}
  evidence.count_verified=evidence.expected_count!==null&&article.restaurants.length===evidence.expected_count;
  if(body.some(s=>/four restaurants/i.test(s))&&evidence.expected_count===3){evidence.count_conflict={introductory:4,displayed:3};issues.push('The introductory prose refers to four restaurants, while the displayed count and cards show three. All three displayed cards are included.');}
 }else if(source.id==='reddit-hot-pot'){
  const start=lines.findIndex(s=>s==='Best'),end=lines.findIndex(s=>s.startsWith('# More posts you may like'));
  if(start<0||end<0)throw Error('Reddit comment boundaries are unavailable in indexed text.');
  const body=lines.slice(start,end).map(plain);
  // Explicit source-observed spellings. Preserve first-occurrence spelling; deduplicate repeats by restaurant identity.
  const patterns=[/\blao\s*jie\b/ig,/\b99\s+favor\s+taste\b/ig,/\bEasy\s+Joy\b/ig,/\bFunny\s+BBQ\b/ig,/\bZao\s+Men\s+Qian\b/ig,/\bK-?pot\b/ig,/\bChon?g?qing\s+Lao\s+zao\b/ig,/\bhou\s+yi\b/ig,/\bHometown\b/ig,/\bMikiya\b/ig,/\bXiang\s+Hot\s+Pot\b/ig,/\bDolar\s+Shop\b/ig];
  const seen=new Set<number>();evidence.mentions=[];
  for(const line of body){const hits=patterns.flatMap((pattern,id)=>Array.from(line.matchAll(pattern),m=>({id,index:m.index!,name:m[0]}))).sort((a,b)=>a.index-b.index);
   for(const hit of hits){if(seen.has(hit.id))continue;seen.add(hit.id);const rank=article.restaurants.length+1;article.restaurants.push({name:hit.name,rank,address:null,blurb:line});evidence.mentions.push({rank,context:line});}
  }
  const unavailable=issues.indexOf('Full copyrighted descriptions are not included; blurb remains null.');if(unavailable>=0)issues.splice(unavailable,1);
  issues.push('Blurb retains the first visible comment paragraph mentioning the restaurant, with rendered link labels. Repeated mentions are not merged.');
  issues.push('Community mentions, not an editorial ranking. First visible mention determines order. Replies are collapsed, so exhaustive coverage is not verified. Location hints are not full branch addresses; none is inferred.');
 }else throw Error('No indexed parser is configured for this source.');
 evidence.extracted_count=article.restaurants.length;
 if(!evidence.count_verified)issues.push('Restaurant completeness has not been verified.');
 return {article,evidence};
}
