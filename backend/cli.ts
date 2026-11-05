import { collectRestaurant } from './public.js';
const args=process.argv.slice(2);
try{
 const values:Record<string,string>={};
 for(let i=0;i<args.length;i+=2){if(!['--name','--place-id','--address','--platforms'].includes(args[i])||!args[i+1]||args[i+1].startsWith('--')||values[args[i]])throw Error('Usage: npm run collect -- --name "Restaurant" [--address "Branch address"] [--platforms yelp,facebook] | --place-id ID');values[args[i]]=args[i+1];}
 const result=await collectRestaurant({name:values['--name'],place_id:values['--place-id'],address:values['--address'],platforms:values['--platforms']?.split(',').map(v=>v.trim())});
 console.log(result.output_file);
 if(result.records.every(r=>!r.found))process.exitCode=2;
}catch(e){console.error(e instanceof Error?e.message:'Collection failed.');process.exitCode=1;}
