import '../config.js';import {readFile} from 'node:fs/promises';import {resolve} from 'node:path';import {createHash} from 'node:crypto';
const args=process.argv.slice(2);
if(args.includes('--legacy')){
 process.argv.splice(process.argv.indexOf('--legacy'),1);await import('./legacy-cli.js');
}else if(args.includes('--help')){
 console.log('collect:media [--urls FILE] [--out DIR] [--cache DIR] [--offline | --offline-html] [--reddit-review FILE] [--manual DIR]\nDefault: fresh HTTP collection of samples/step1-media/urls.json, output .local/issue20/current. --offline replays exact URL captures; Reddit uses approved OAuth credentials; --offline-html reuses only HTML and fetches Reddit live. --legacy runs the historical #15 interface. Exit 2 means partial.');
}else try{
 const opts:Record<string,string>={};let offline=false,offlineHtml=false;
 for(let i=0;i<args.length;i++){
  const flag=args[i];if(flag==='--offline'){if(offline||offlineHtml)throw Error('Choose one offline mode.');offline=true;continue;}
  if(flag==='--offline-html'){if(offlineHtml||offline)throw Error('Choose one offline mode.');offlineHtml=true;continue;}
  if(!['--urls','--out','--cache','--reddit-review','--manual'].includes(flag)||opts[flag]||!args[i+1]||args[i+1].startsWith('--'))throw Error('Usage: collect:media [--urls FILE] [--out DIR] [--cache DIR] [--offline | --offline-html] [--reddit-review FILE] [--manual DIR]');opts[flag]=args[++i];
 }
 const {collectConfiguredMedia,writeConfiguredMedia}=await import('./current.js');
 const file=resolve(opts['--urls']??'samples/step1-media/urls.json'),bytes=await readFile(file),config=JSON.parse(bytes.toString('utf8'));
 const targets=JSON.parse(await readFile('backend/media/targets.json','utf8'));
 const reviews=opts['--reddit-review']?JSON.parse(await readFile(opts['--reddit-review'],'utf8')).threads:undefined;
 if(reviews!==undefined&&(!Array.isArray(reviews)||reviews.some((r:any)=>typeof r?.url!=='string'||!Array.isArray(r.comments))))throw Error('Expected Reddit review {threads:[...]} file.');
 const result=await collectConfiguredMedia(config,{cache:resolve(opts['--cache']??'.local/issue20/pages'),offline,offlineHtml,targets,manualDir:opts['--manual'],redditReviews:reviews,onProgress:value=>console.log(JSON.stringify(value))});
 const out=resolve(opts['--out']??'.local/issue20/current');await writeConfiguredMedia(out,result,{urls_file:opts['--urls']??'samples/step1-media/urls.json',sha256:createHash('sha256').update(bytes).digest('hex')});
 console.log(JSON.stringify({out,sources:result.sources.length,restaurants:result.acceptance.restaurant_count,access_counts:result.acceptance.access_counts,phase:3,phase3_complete:result.acceptance.phase3_complete,ready_for_delivery:false,paid_calls:result.acceptance.paid_calls,reddit_api_calls:result.acceptance.reddit_api_calls}));process.exitCode=result.acceptance.complete?0:2;
}catch(e){console.error(e instanceof Error?e.message:'Media collection failed.');process.exitCode=1;}
