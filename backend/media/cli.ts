import '../config.js';
import {readFile,mkdir,writeFile,copyFile,stat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import type {MediaArticle,MediaEvidence,MediaSource} from './public.js';
import {mediaSources,parseMediaArticle,parseIndexedMedia,mediaMembershipReport,applySuppliedTexts,evaluateMediaAcceptance,missingDescriptions,mediaAcceptanceReport,parseSavedMediaPage,descriptionAvailability} from './public.js';

const args=process.argv.slice(2);
if(args.includes('--help')){console.log('collect:media [--cache DIR] [--out DIR] [--source ID] [--targets FILE] [--fetch-missing] [--refresh] [--supplied-texts FILE] [--supplied-pages DIR] [--descriptions full|supplied-only]\nDefault: offline replay. Exit 0: selected scope complete; 2: partial; 1: invalid input/fatal failure.');process.exit(0);}
const value=(flag:string,fallback:string)=>{const i=args.indexOf(flag);if(i<0)return fallback;if(!args[i+1]||args[i+1].startsWith('--'))throw Error('Missing value for '+flag);return args[i+1];};
try{
 const allowed=new Set(['--cache','--out','--source','--fetch-missing','--refresh','--targets','--supplied-texts','--supplied-pages','--descriptions']),seen=new Set<string>();
 for(let i=0;i<args.length;i++){if(!allowed.has(args[i])||seen.has(args[i]))throw Error('Unknown or duplicate option: '+args[i]);seen.add(args[i]);if(!['--fetch-missing','--refresh'].includes(args[i])){value(args[i],'');i++;}}
 const cache=resolve(value('--cache','.local/issue15/pages')),out=resolve(value('--out','.local/issue15/parsed')),id=value('--source','');
 const descriptionPolicy=value('--descriptions','full');if(!['full','supplied-only'].includes(descriptionPolicy))throw Error('Invalid description export policy.');
 const sources=id?mediaSources.filter(s=>s.id===id):mediaSources;if(!sources.length)throw Error('Unknown media source: '+id);
 let articles:MediaArticle[]=[],evidence:MediaEvidence[]=[];
 const textPath=value('--supplied-texts',''),pagesPath=value('--supplied-pages','');
 const savedPages=pagesPath?JSON.parse(await readFile(join(resolve(pagesPath),'manifest.json'),'utf8')):[];
 if(!Array.isArray(savedPages)||savedPages.some((p:any)=>!p||typeof p.source_id!=='string'||typeof p.file!=='string'||p.file.includes('..')||/[\\/]/.test(p.file)||p.reviewed!==undefined&&typeof p.reviewed!=='boolean')||new Set(savedPages.map((p:any)=>p.source_id)).size!==savedPages.length)throw Error('Invalid saved-page manifest.');
 for(const p of savedPages)if(!sources.some(s=>s.id===p.source_id))throw Error('Saved-page source is outside the selected scope.');
 const supplied=textPath?JSON.parse(await readFile(resolve(textPath),'utf8')):null;
 const targets=JSON.parse(await readFile(resolve(value('--targets','backend/media/targets.json')),'utf8'));
 // Validate target configuration before network requests or replacing output files.
 mediaMembershipReport([],[],targets);
 await mkdir(cache,{recursive:true});
 const capture=async(source:MediaSource)=>{
  const archive=join(cache,'previous',new Date().toISOString().replace(/[:.]/g,'-'));
  for(const ext of ['html','json'])try{await mkdir(archive,{recursive:true});await copyFile(join(cache,source.id+'.'+ext),join(archive,source.id+'.'+ext));}catch(error:any){if(error.code!=='ENOENT')throw error;}
  let html='',meta:any={url:source.url,fetched_at:new Date().toISOString()};
  try{const response=await fetch(source.url,{signal:AbortSignal.timeout(30000),headers:{'User-Agent':'GEO-Research/1.0'}});html=await response.text();meta={...meta,final_url:response.url,status:response.status};}
  catch(error:any){meta={...meta,status:null,error:String(error.message)};}
  await writeFile(join(cache,source.id+'.html'),html);await writeFile(join(cache,source.id+'.json'),JSON.stringify(meta,null,2)+'\n');
 };
 for(const source of sources){
  let meta:any;
  try{
   const saved=savedPages.find((p:any)=>p.source_id===source.id);
   if(saved){
    const file=join(resolve(pagesPath),saved.file),html=await readFile(file,'utf8'),savedAt=(await stat(file)).mtime.toISOString();
    if(saved.reviewed===true&&saved.reviewed_sha256!==createHash('sha256').update(html).digest('hex'))throw Error('Reviewed saved-page hash does not match the file.');
    const result=parseSavedMediaPage(html,source,savedAt,saved.reviewed===true);
    articles.push(result.article);evidence.push(result.evidence);continue;
   }
   let direct:{html:string;meta:any}|null=null;
   try{direct={html:await readFile(join(cache,source.id+'.html'),'utf8'),meta:JSON.parse(await readFile(join(cache,source.id+'.json'),'utf8'))};}catch(error:any){if(error.code!=='ENOENT')throw error;}
   if(args.includes('--refresh')||!direct&&args.includes('--fetch-missing')){await capture(source);direct={html:await readFile(join(cache,source.id+'.html'),'utf8'),meta:JSON.parse(await readFile(join(cache,source.id+'.json'),'utf8'))};}
   const validate=(m:any)=>{if(m.url!==source.url||!Number.isFinite(Date.parse(m.fetched_at)))throw Error('Cache identity or fetch timestamp is invalid.');};
   let result:ReturnType<typeof parseMediaArticle>|undefined;
   if(direct){meta=direct.meta;validate(meta);if(meta.status===200||meta.retrieval==='browser_dom'&&meta.rendered===true){result=parseMediaArticle(direct.html,source,meta.fetched_at,{includeDescriptions:descriptionPolicy==='full'});if(meta.retrieval==='browser_dom')result.evidence.source_kind='browser_dom';if(!result.article.restaurants.length)result=undefined;}}
   // Fresh valid direct HTML wins over an older index; failed access never upgrades an index to live evidence.
   if(!result){
    let raw:string;
    try{raw=await readFile(join(cache,source.id+'.web.txt'),'utf8');meta=JSON.parse(await readFile(join(cache,source.id+'.web.json'),'utf8'));}
    catch(error:any){if(error.code==='ENOENT'&&direct)throw Error(direct.meta.error??('HTTP '+direct.meta.status+' or unsupported direct page; cached response retained.'));throw error;}
    validate(meta);if(meta.retrieval!=='web_index')throw Error('Invalid indexed-cache retrieval marker.');
    result=parseIndexedMedia(raw,source,meta.fetched_at);
    if(direct)result.evidence.issues.push('Latest direct capture: '+(direct.meta.error??('HTTP '+direct.meta.status))+'; captured at '+direct.meta.fetched_at+'.');
    if(meta.source_age)result.evidence.source_age=meta.source_age;
   }
   articles.push(result.article);evidence.push(result.evidence);
  }catch(error:any){
   articles.push({url:source.url,site:source.site,title:null,published:null,updated:null,restaurants:[]});
   evidence.push({source_id:source.id,status:'failed',expected_count:null,extracted_count:0,dates:[],fetched_at:meta?.fetched_at??null,issues:[error.code==='ENOENT'?'Source not fetched; offline cache entry is unavailable.':String(error.message)],count_verified:false});
  }
 }
 if(textPath)({articles,evidence}=applySuppliedTexts(articles,evidence,supplied));
 const evaluated=evaluateMediaAcceptance(articles,evidence,mediaSources);evidence=evaluated.evidence;
 const table=mediaMembershipReport(articles,evidence,targets);
 const cacheManifest=[];
 for(const source of sources)for(const ext of ['html','json','web.txt','web.json'])try{const path=source.id+'.'+ext,bytes=await readFile(join(cache,path));cacheManifest.push({source_id:source.id,path,sha256:createHash('sha256').update(bytes).digest('hex')});}catch(error:any){if(error.code!=='ENOENT')throw error;}
 for(const p of savedPages){const bytes=await readFile(join(resolve(pagesPath),p.file));cacheManifest.push({source_id:p.source_id,path:'user-supplied/'+p.file,sha256:createHash('sha256').update(bytes).digest('hex')});}
 if(pagesPath){const bytes=await readFile(join(resolve(pagesPath),'manifest.json'));cacheManifest.push({source_id:'saved-page-manifest',path:'user-supplied/manifest.json',sha256:createHash('sha256').update(bytes).digest('hex')});}
 const outputs:Record<string,unknown>={'articles.json':articles,'evidence.json':{apify_runs:0,apify_cost_usd:0,descriptions_available:evaluated.acceptance.descriptions_available,sources:evidence},'acceptance.json':evaluated.acceptance,'supplied-texts.template.json':missingDescriptions(articles),'cache-manifest.json':cacheManifest,'description-availability.json':descriptionAvailability(articles,evidence)};
 await mkdir(out,{recursive:true});
 for(const [name,data] of Object.entries(outputs))await writeFile(join(out,name),JSON.stringify(data,null,2)+'\n');
 await writeFile(join(out,'上榜表.md'),table);await writeFile(join(out,'验收报告.md'),mediaAcceptanceReport(evaluated.acceptance,descriptionAvailability(articles,evidence)));
 console.log(JSON.stringify({out,articles:articles.length,restaurants:evaluated.acceptance.restaurant_count,descriptions_available:evaluated.acceptance.descriptions_available,descriptions_missing:evaluated.acceptance.descriptions_missing,complete:evaluated.acceptance.complete,ready_for_delivery:evaluated.acceptance.ready_for_delivery,apify_cost_usd:0}));
 process.exitCode=evaluated.acceptance.complete?0:2;
}catch(error:any){console.error(error.message);process.exitCode=1;}
