import {readFile,writeFile} from 'node:fs/promises';import {fileURLToPath} from 'node:url';
import {descriptionAvailability} from '../../../dist/backend/media/public.js';
process.chdir(fileURLToPath(new URL('../../../',import.meta.url)));
const root='samples/step1-media',read=async p=>JSON.parse(await readFile(root+'/'+p,'utf8')),base=await read('current/articles.json'),reddit=await read('candidate-apify/articles.json'),ev=await read('current/evidence.json'),re=await read('candidate-apify/evidence.json'),access=await read('current/access-checks.json');
const articles=base.map(a=>reddit.find(r=>r.url===a.url)??a);
for(let i=0;i<base.length;i++){const at=reddit.findIndex(r=>r.url===base[i].url);if(at<0)continue;ev.sources[i]=re[at];access[i]={...access[i],outcome:'partial',reason:'User-authorized Apify exception; official API application declined; full replies unverified.',retrieval:'apify_candidate',http_status:null,fetched_at:re[at].fetched_at,sha256:re[at].reddit.capture_sha256,entries:reddit[at].restaurants.length,count_verified:false};}
for(const[name,data]of Object.entries({'articles.json':articles,'evidence.json':ev,'access-checks.json':access,'description-availability.json':descriptionAvailability(articles,ev.sources)}))await writeFile(root+'/'+name,JSON.stringify(data,null,2)+'\n');
console.log('Prepared '+articles.length+' sources and '+articles.reduce((n,a)=>n+a.restaurants.length,0)+' entries; source timestamps preserved.');
