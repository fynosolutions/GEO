import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {mapItem,mapApify,collectRestaurant,emptyListing} from '../dist/backend/collection.js';
import {validateRecords} from '../dist/backend/weekly/public.js';
import {isListingCandidate} from '../dist/backend/browser.js';

const anchor={title:'Fixture Cafe',address:'123 Main St, New York, NY 10001',phone:'2125550100',url:'https://www.google.com/maps/place/fixture'};
const raw=items=>({status:'unverified',items,collected_at:'2026-11-07T00:00:00Z',note:''});

test('Facebook only converts an explicit Not yet rated to zero',()=>{
 for(const rating of ['Not yet rated','Not yet rated (0 reviews)'])assert.equal(mapItem('facebook',{rating}).rating,0);
 assert.equal(mapItem('facebook',{}).rating,null);
 assert.equal(mapItem('facebook',{rating:'94% recommend (839 Reviews)'}).rating,'94% recommend (839 Reviews)');
 assert.equal(mapItem('yelp',{rating:'Not yet rated'}).rating,'Not yet rated');
});

test('rating_raw preserves original values on listings and is omitted from social profiles',()=>{
 const original={average:4.5,count:10,display_string:' 10 reviews ',extra:{unchanged:true}};
 for(const platform of ['doordash','facebook','yelp']){
  const record=mapItem(platform,{rating:original});assert.deepEqual(record.rating_raw,original);assert.equal(record.rating_raw,original);
 }
 const text='  Not yet rated (0 reviews)  ',facebook=mapItem('facebook',{rating:text});
 assert.equal(facebook.rating,0);assert.deepEqual(facebook.rating_raw,{average:text,count:null});
 const aggregate={ratingValue:'4.50',reviewCount:'10',bestRating:5};
 assert.deepEqual(mapItem('yelp',{aggregateRating:aggregate}).rating_raw,aggregate);
 assert.deepEqual(mapItem('google_maps',{totalScore:0,reviewsCount:0}).rating_raw,{average:0,count:0});
 assert.deepEqual(mapItem('google_maps',{totalScore:4.8,reviewsCount:1163}).rating_raw,{average:4.8,count:1163});
 assert.deepEqual(mapItem('yelp',{rating:'4.50',reviewCount:'84'}).rating_raw,{average:'4.50',count:'84'});
 assert.deepEqual(mapItem('yelp',{reviewCount:24}).rating_raw,{average:null,count:24});
 assert.equal(mapItem('yelp',{}).rating_raw,null);
 assert.equal(mapItem('instagram',{followersCount:10,postsCount:5}).rating_raw,undefined);
 assert.equal(emptyListing('resy','Cancelled.').rating_raw,undefined);
 const rejected=mapApify('resy',raw([{name:'Wrong',address1:'999 Wrong St',rating:original,resyUrl:'https://resy.com/cities/new-york-ny/venues/wrong'}]),{name:anchor.title,address:anchor.address});
 assert.equal(rejected.matched,false);assert.equal(rejected.rating_raw,undefined);
});

test('profile identity evidence is mandatory and profile schemas never leak review fields',()=>{
 const identity={name:anchor.title,address:anchor.address,phone:anchor.phone};
 const instagram={fullName:anchor.title,url:'https://www.instagram.com/fixturecafe/',businessAddress:JSON.stringify({street_address:'123 Main St',city_name:'New York',zip:'10001'}),followersCount:0,postsCount:41,rating:5,reviewsCount:99};
 const result=mapApify('instagram',raw([instagram]),identity);
 assert.equal(result.matched,true);assert.equal(result.followers,0);assert.equal(result.posts,41);
 assert.equal(result.address,instagram.businessAddress);
 for(const record of [result,emptyListing('instagram'),emptyListing('resy')])for(const key of ['rating','review_count','rating_value','review_count_value','rating_raw'])assert.equal(Object.hasOwn(record,key),false);
 assert.equal(mapApify('instagram',raw([{...instagram,businessAddress:null,biography:'A cafe in NYC'}]),identity).matched,false);
 assert.equal(mapApify('instagram',raw([{...instagram,businessAddress:null,biography:'123 Main St, New York, NY 10001\n(212) 555-0100'}]),identity).matched,true);
 assert.equal(mapApify('instagram',raw([{...instagram,businessAddress:'999 Wrong St, New York, NY 10001'}]),identity).matched,false);
 const resy=mapApify('resy',raw([{name:anchor.title,address1:'123 Main St',phone:anchor.phone,resyUrl:'https://resy.com/cities/new-york-ny/venues/fixture-cafe',rating:{score:5,count:20}}]),identity);
 assert.equal(resy.matched,true);assert.equal(resy.followers,null);assert.equal(resy.posts,null);assert.equal(Object.hasOwn(resy,'rating'),false);
 assert.equal(isListingCandidate('https://www.instagram.com/p/fixture/','instagram'),false);
 assert.equal(isListingCandidate('https://www.instagram.com/explore/','instagram'),false);
 assert.equal(isListingCandidate('https://resy.com/cities/new-york-ny','resy'),false);
});

test('selected profile platforms use Google identity and write only the new category fields',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'geo-profiles-'));
 const old={OUTPUT_DIR:process.env.OUTPUT_DIR,COLLECTION_DATA_DIR:process.env.COLLECTION_DATA_DIR};
 Object.assign(process.env,{OUTPUT_DIR:join(dir,'out'),COLLECTION_DATA_DIR:join(dir,'data')});
 try{
  const calls=[];
  const apify=async(platform,target)=>{
   calls.push(platform);
   if(platform==='google_maps')return raw([anchor]);
   if(platform==='_discovery')return raw([{organicResults:[{url:'https://www.instagram.com/fixturecafe/'},{url:'https://resy.com/cities/new-york-ny/venues/fixture'}]}]);
   if(platform==='instagram')return raw([{fullName:anchor.title,url:target.listing_url,businessAddress:anchor.address,followersCount:1234,postsCount:30}]);
   if(platform==='resy')return raw([{name:anchor.title,resyUrl:target.listing_url,address1:'123 Main St',phone:anchor.phone}]);
   throw Error('Unselected platform invoked');
  };
  const result=await collectRestaurant({name:anchor.title,platforms:['resy','instagram']},undefined,undefined,{apify});
  assert.deepEqual(calls,['google_maps','_discovery','resy','instagram']);
  const output=JSON.parse(await readFile(result.output_file,'utf8'));
  assert.deepEqual(output.map(r=>r.platform),['resy','instagram']);assert.ok(output.every(r=>r.matched));
  assert.equal(output[1].followers,1234);assert.match(output[0].error,/followers, posts/);
 }finally{for(const [k,v] of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v;await rm(dir,{recursive:true,force:true});}
});

test('weekly history accepts legacy eight-platform snapshots alongside the ten-platform schema',()=>{
 const legacy=['google_maps','yelp','tripadvisor','opentable','doordash','uber_eats','grubhub','facebook'].map(p=>emptyListing(p));
 assert.equal(validateRecords(legacy).length,8);
 assert.equal(validateRecords([...legacy,emptyListing('resy'),emptyListing('instagram')]).length,10);
 assert.throws(()=>validateRecords([...legacy,{...emptyListing('resy'),rating:null},emptyListing('instagram')]));
});

test('not-found reasons separate insufficient identity, wrong branches, no results and provider failures',()=>{
 const identity={name:anchor.title,address:anchor.address,phone:anchor.phone};
 const sameName=mapApify('instagram',raw([{fullName:anchor.title,url:'https://www.instagram.com/fixturecafe/',followersCount:791,postsCount:42}]),identity);
 assert.equal(sameName.found,false);assert.equal(sameName.matched,false);
 assert.match(sameName.error,/Candidate found but matched:false/);
 assert.match(sameName.error,/only name matches/);
 assert.match(sameName.error,/missing: address, phone/);
 assert.equal(sameName.followers,null);assert.equal(sameName.name,null);
 const wrong=mapApify('resy',raw([{name:'Other Cafe',address1:'999 Elsewhere St',phone:'6465559999',resyUrl:'https://resy.com/cities/new-york-ny/venues/other'}]),identity);
 assert.equal(wrong.error,'No matching public listing was found.');
 assert.ok(!wrong.error.includes('registered'));
 for(const status of ['unverified','empty']){
  const empty=mapApify('resy',{...raw([]),status},identity);assert.equal(empty.matched,false);assert.match(empty.error,/No matching public listing/);
 }
 const blocked=mapApify('instagram',{...raw([]),status:'error',note:'Apify HTTP 403: Actor access denied.'},identity);
 assert.match(blocked.error,/Apify HTTP 403/);assert.ok(!blocked.error.includes('No public listing'));
 const conflict=mapApify('resy',raw([{name:anchor.title,address1:'999 Wrong St',phone:anchor.phone,resyUrl:'https://resy.com/cities/new-york-ny/venues/wrong'}]),identity);
 assert.equal(conflict.error,'matched:false; the candidate has a conflicting street number.');
});
