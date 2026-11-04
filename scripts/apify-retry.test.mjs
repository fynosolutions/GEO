import test from 'node:test';
import assert from 'node:assert/strict';
import {collectApify} from '../dist/backend/apify.js';
const target={name:'Fixture Cafe',address:'1 Main St',website_url:'',listing_url:'https://www.yelp.com/biz/fixture'};
async function tokenTest(fn){const old=process.env.APIFY_TOKEN;process.env.APIFY_TOKEN='fixture';try{await fn();}finally{if(old===undefined)delete process.env.APIFY_TOKEN;else process.env.APIFY_TOKEN=old;}}
test('transient run-status and dataset failures recover without restarting or aborting the Actor',()=>tokenTest(async()=>{
 let starts=0,polls=0,reads=0,aborts=0;
 const r=await collectApify('yelp',target,undefined,async(url,options)=>{
  if(url.endsWith('/abort')){aborts++;return Response.json({data:{}});}
  if(options.method==='POST'){starts++;return Response.json({data:{id:'run',status:'RUNNING'}});}
  if(url.includes('actor-runs'))return ++polls===1?new Response('',{status:502}):Response.json({data:{id:'run',status:'SUCCEEDED',defaultDatasetId:'dataset'}});
  return ++reads===1?new Response('',{status:503}):Response.json([{name:'Fixture Cafe'}]);
 });
 assert.equal(r.status,'unverified');assert.equal(starts,1);assert.equal(aborts,0);assert.equal(polls,2);assert.equal(reads,2);
}));
test('Actor launch is not retried on 502, preventing duplicate paid runs',()=>tokenTest(async()=>{
 let calls=0;const r=await collectApify('yelp',target,undefined,async()=>{calls++;return new Response('',{status:502});});
 assert.equal(calls,1);assert.equal(r.status,'error');assert.match(r.note,/502.*Stage: start/);
}));
test('authentication errors are not retried and temporary reads stop after three attempts',()=>tokenTest(async()=>{
 for(const status of [401,502]){
  let reads=0;const r=await collectApify('yelp',target,undefined,async(url,opts)=>{
   if(opts.method==='POST')return Response.json({data:{id:'run',status:'SUCCEEDED',defaultDatasetId:'dataset'}});
   reads++;return new Response('',{status});
  });
  assert.equal(reads,status===401?1:3);assert.equal(r.status,'error');assert.match(r.note,new RegExp(`HTTP ${status}`));
 }
}));

test('an interrupted or malformed dataset body is retried as a read, not a new run',()=>tokenTest(async()=>{
 let starts=0,reads=0;
 const r=await collectApify('yelp',target,undefined,async(url,opts)=>{
  if(opts.method==='POST'){starts++;return Response.json({data:{id:'run',status:'SUCCEEDED',defaultDatasetId:'dataset'}});}
  return ++reads===1?new Response('incomplete json'):Response.json([{name:'Fixture Cafe'}]);
 });
 assert.equal(r.status,'unverified');assert.equal(starts,1);assert.equal(reads,2);
}));
