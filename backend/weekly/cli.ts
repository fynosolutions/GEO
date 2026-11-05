import '../config.js';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {storesFrom,runWeekly,menuObservations} from './public.js';
const args=process.argv.slice(2);
try{
 const opts:Record<string,string>={};
 for(let i=0;i<args.length;i+=2){if(!['--stores','--history','--mode','--menus'].includes(args[i])||!args[i+1]||opts[args[i]])throw Error('Usage: collect:weekly --stores stores.json --history .local/history --mode manual|scheduled');opts[args[i]]=args[i+1];}
 const mode=opts['--mode']??'manual';if(mode!=='manual'&&mode!=='scheduled')throw Error('Invalid mode.');
 const stores=storesFrom(JSON.parse(await readFile(opts['--stores']??'stores.json','utf8')));
 const timeout=Number(process.env.WEEKLY_STORE_TIMEOUT_MS??1200000);if(!Number.isFinite(timeout)||timeout<1000||timeout>3600000)throw Error('Store timeout must be 1000–3600000ms.');
 const started=Date.now(),budget=Number(process.env.WEEKLY_BATCH_TIMEOUT_MS??7200000);
 if(!Number.isFinite(budget)||budget<timeout||budget>14400000)throw Error('Batch timeout must cover one store and be <=4 hours.');
 const menus=opts['--menus']?menuObservations(JSON.parse(await readFile(opts['--menus'],'utf8'))):undefined;
 const result=await runWeekly({menus,stores,root:resolve(opts['--history']??'.local/history'),mode,codeSha:process.env.GITHUB_SHA,collect:async store=>{
  const remaining=budget-(Date.now()-started);if(remaining<=0)throw Error('Batch deadline reached.');
  const dir=await mkdtemp(join(tmpdir(),'geo-weekly-'));
  try{
   const output=join(dir,'result.json');
   await new Promise<void>((done,reject)=>{
    const child=spawn(process.execPath,[fileURLToPath(new URL('./worker.js',import.meta.url)),JSON.stringify(store),output],{env:{...process.env,OUTPUT_DIR:join(dir,'out'),COLLECTION_DATA_DIR:join(dir,'diagnostics'),MENU_OUTPUT_DIR:join(dir,'details')},stdio:'ignore'});
    let kill:ReturnType<typeof setTimeout>|undefined;
    const timer=setTimeout(()=>{child.kill('SIGTERM');kill=setTimeout(()=>child.kill('SIGKILL'),15000);},Math.min(timeout,remaining));
    child.on('error',()=>{clearTimeout(timer);reject(Error('Worker failed.'));});
    child.on('close',code=>{clearTimeout(timer);if(kill)clearTimeout(kill);code===0?done():reject(Error('Worker failed.'));});
   });
   return JSON.parse(await readFile(output,'utf8'));
  }finally{await rm(dir,{recursive:true,force:true});}
 }});
 console.log(result.runDir);console.log(result.manifest.stores.map(s=>`${s.id}: ${s.status}`).join('\n'));
 if(result.manifest.stores.some(s=>s.status==='failed'))process.exitCode=2;
}catch(e){console.error(e instanceof Error?e.message:'Weekly collection failed.');process.exitCode=1;}
