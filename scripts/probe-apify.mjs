import '../dist/backend/config.js';
import {collectApify} from '../dist/backend/apify.js';
import {mkdir,writeFile} from 'node:fs/promises';import{resolve,join}from'node:path';
if(!process.env.APIFY_TOKEN){console.log('APIFY_TOKEN is missing. Add it to the local .env; no paid run was started.');process.exitCode=1;}
else{
 const key=process.argv[2]||'yelp';const urls={yelp:'https://www.yelp.com/biz/easy-joy-dim-sum-and-ayce-hot-pot-new-york',tripadvisor:'https://www.tripadvisor.com/Restaurant_Review-g60763-d34291343-Reviews-Easy_Joy_Dim_Sum_AYCE_Hot_Pot-New_York_City_New_York.html',google_maps:''};
 if(!(key in urls))throw new Error('Probe supports yelp, tripadvisor or google_maps.');
 const dir=resolve('.local',`apify-easyjoy-${Date.now()}`);await mkdir(dir,{recursive:true});
 const result=await collectApify(key,{name:'Easy Joy Dim Sum & AYCE Hot Pot',address:'145 Mulberry St, New York, NY 10013',website_url:'https://www.easyjoybuffet.com/',listing_url:urls[key]});
 await writeFile(join(dir,key+'.apify.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify({status:result.status,records:result.items.length,note:result.note,directory:dir}));
}
