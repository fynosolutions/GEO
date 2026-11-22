import '../../../dist/backend/config.js';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';import {resolve,join} from 'node:path';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {configuredMediaSources} from '../../../dist/backend/media/sources.js';import {readManualMedia} from '../../../dist/backend/media/manual.js';
const root=fileURLToPath(new URL('../../../',import.meta.url));process.chdir(root);
const args=process.argv.slice(2),opts={};for(let i=0;i<args.length;i++){if(!['--url','--file','--saved-at'].includes(args[i])||!args[i+1])throw Error('Use --url URL --file saved.html --saved-at ISO_TIME');opts[args[i]]=args[++i];}
const sources=configuredMediaSources(JSON.parse(await readFile('samples/step1-media/urls.json','utf8'))),dir=resolve('samples/step1-media/manual');let manifest;try{manifest=JSON.parse(await readFile(join(dir,'manifest.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;manifest={entries:[]};}
if(opts['--file']){
 const source=sources.find(s=>s.url===opts['--url']);if(!source||!manifest.entries.some(e=>e.url===source.url))throw Error('Only declared failed-source exceptions can be imported.');
 if(!Number.isFinite(Date.parse(opts['--saved-at'])))throw Error('Provide the actual browser save time as --saved-at.');
 const bytes=await readFile(opts['--file']),entry={url:source.url,status:'provided',file:'pages/'+source.id+'.html',saved_at:opts['--saved-at'],sha256:createHash('sha256').update(bytes).digest('hex')};
 // Validate in an isolated staging directory before changing accepted files.
 const {mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os');const stage=await mkdtemp(join(tmpdir(),'geo-manual-'));
 try{await mkdir(join(stage,'pages'));await writeFile(join(stage,entry.file),bytes);await writeFile(join(stage,'manifest.json'),JSON.stringify({entries:[entry]}));await readManualMedia(stage,source);}finally{await rm(stage,{recursive:true,force:true});}
 await mkdir(join(dir,'pages'),{recursive:true});await writeFile(join(dir,entry.file),bytes);manifest.entries=manifest.entries.map(e=>e.url===source.url?{...e,...entry}:e);await writeFile(join(dir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log('Manual source imported: '+source.url);
}else console.log(JSON.stringify(manifest,null,2));
