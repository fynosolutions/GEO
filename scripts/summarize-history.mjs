import {readFile,appendFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
const root=resolve(process.argv[2]||'.local/history'),base=process.argv[3]==='schedule'?root:join(root,'manual');
let text='';
try{
 const pointer=JSON.parse(await readFile(join(base,'indexes/latest.json'),'utf8'));
 if(!/^[a-zA-Z0-9_-]+$/.test(pointer.run_id)||pointer.path!=='runs/'+pointer.run_id)throw Error('Invalid index');
 const run=join(base,pointer.path),manifest=JSON.parse(await readFile(join(run,'manifest.json'),'utf8'));
 text='\n## Collection results\n\nRun: `'+pointer.run_id+'`. Inspect per-store coverage; successful workflow execution does not mean every platform was collected.\n\n| Store ID | Data status | Matched platforms | Menu records |\n|---|---|---|---|\n';
 for(const store of manifest.stores){
  const records=JSON.parse(await readFile(join(run,'snapshots',store.id+'.json'),'utf8'));
  let menus='unavailable';try{const d=JSON.parse(await readFile(join(run,'details',store.id+'.json'),'utf8'));menus=String(d.menus.length);}catch{}
  text+=`| ${String(store.id).replaceAll('|','')} | ${store.status} | ${records.filter(r=>r.matched&&r.found).length}/${records.length} | ${menus} |\n`;
 }
 text+='\nLatest result index: `'+(process.argv[3]==='schedule'?'':'manual/')+'indexes/latest.json`. Follow its path to immutable results; date-canonical snapshots may represent an earlier attempt.\n';
}catch{text='\nNo readable completed-run index was available. Inspect collection logs and the recovery artifact; do not infer a successful data collection.\n';}
if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,text);else console.log(text);
