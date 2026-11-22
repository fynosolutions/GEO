import {spawnSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';import {join} from 'node:path';
const root=fileURLToPath(new URL('../../../',import.meta.url));process.chdir(root);
const args=process.argv.slice(2),flags=[],opts={};for(let i=0;i<args.length;i++){if(['--offline-html','--apify-candidate'].includes(args[i]))flags.push(args[i]);else if(['--out','--urls'].includes(args[i])&&args[i+1])opts[args[i]]=args[++i];else throw Error('Use --offline-html, --apify-candidate, --out DIR, --urls FILE.');}
// Build from source so the entry does not silently use stale compiled adapters.
const build=spawnSync('npm',['run','build'],{stdio:'inherit'});if(build.status!==0)process.exit(build.status??1);
const out=opts['--out']??'samples/step1-media';
const collect=spawnSync(process.execPath,['dist/backend/media/cli.js','--out',out,'--manual','samples/step1-media/manual',...(opts['--urls']?['--urls',opts['--urls']]:[]),...(flags.includes('--offline-html')?['--offline-html']:[])],{stdio:'inherit'});if(![0,2].includes(collect.status))process.exit(collect.status??1);
if(flags.includes('--apify-candidate')){
 const dir='samples/step1-media/candidate-apify',candidate=JSON.parse(await readFile(join(dir,'articles.json'),'utf8')),base=JSON.parse(await readFile(join(out,'articles.json'),'utf8')),candidateEvidence=JSON.parse(await readFile(join(dir,'evidence.json'),'utf8')),baseEvidence=JSON.parse(await readFile(join(out,'evidence.json'),'utf8'));
 if(candidateEvidence.some(e=>!Number.isFinite(Date.parse(e.fetched_at))||Date.now()-Date.parse(e.fetched_at)>24*3600000||Date.parse(e.fetched_at)>Date.now()+60000))throw Error('Candidate capture is expired or invalid; refresh or remove it before sharing.');
 if(candidate.length!==2||candidate.some(a=>!base.some(b=>b.url===a.url)))throw Error('Candidate sources do not match the current manifest.');
 const merged=base.map(a=>candidate.find(c=>c.url===a.url)??a),output='samples/step1-media/candidate-all';await mkdir(output,{recursive:true});
 await writeFile(join(output,'articles.json'),JSON.stringify(merged,null,2)+'\n');
 await writeFile(join(output,'evidence.json'),JSON.stringify({base:baseEvidence,candidate:candidateEvidence},null,2)+'\n');
 await writeFile(join(output,'acceptance.json'),JSON.stringify({candidate_only:true,ready_for_delivery:false,official_api_requirement_met:false,sources:merged.length,entries:merged.reduce((n,a)=>n+a.restaurants.length,0),comment_tree_verified:false,base_acceptance:JSON.parse(await readFile(join(out,'acceptance.json'),'utf8'))},null,2)+'\n');
 console.log('Candidate combined output: '+output+'/articles.json');
}
process.exitCode=2;
