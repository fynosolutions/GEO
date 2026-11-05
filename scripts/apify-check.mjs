// Read-only preflight. Never launches Actors or prints credentials.
import '../dist/backend/config.js';
import {readFile} from 'node:fs/promises';
const token=process.env.APIFY_TOKEN;
if(!token){console.error('APIFY_TOKEN is missing. Create one in Apify Console > Settings > API & Integrations, then set it in .env.');process.exitCode=1;}
else{
 const auth=await fetch('https://api.apify.com/v2/users/me',{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(20000)}).catch(()=>null);
 console.log(`Token authentication: ${auth?.status??'network error'}`);
 if(!auth?.ok)process.exitCode=1;
 const config=JSON.parse(await readFile(process.env.APIFY_CONFIG_FILE||'config/apify.json','utf8'));
 for(const [key,value] of Object.entries(config)){
  if(!value.actor)continue;
  const response=await fetch(`https://api.apify.com/v2/acts/${value.actor.replace('/','~')}/builds/default`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(20000)}).catch(()=>null);
  console.log(`${key}: ${value.actor} — ${response?.status??'network error'}`);
  if(!response?.ok)process.exitCode=1;
 }
 console.log('Read-only check finished. Actor availability does not prove menu data coverage, credit or runtime entitlement.');
}
