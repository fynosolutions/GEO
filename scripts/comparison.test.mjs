import test from 'node:test';import assert from 'node:assert/strict';
import{candidates,hasCoreData,versionCandidates}from'../dist/public/js/comparison.js';
test('two versions never backfill one another and nested delivery fields map correctly',()=>{
 const p={values:{rating:'4.0',review_themes:'Website sample'},apify:{items:[{restaurant:{rating:{average:4.5,count:10},location:{address:{display_address:'Raw address'}}}}]}};
 assert.equal(versionCandidates(p,'rating','multi')[0].value,'4.0');assert.equal(versionCandidates(p,'rating','apify')[0].value,4.5);assert.equal(versionCandidates(p,'review_themes','apify').length,0);
 assert.equal(versionCandidates(p,'review_count','apify')[0].value,10);assert.equal(versionCandidates(p,'address','apify')[0].value,'Raw address');
});
test('mismatched provider fields do not appear in either comparison selection',()=>{const p={values:{},apify:{status:'location_mismatch',items:[{name:'Wrong restaurant',rating:5}]}};assert.equal(versionCandidates(p,'name','apify').length,0);assert.equal(hasCoreData(p),false);});
test('canonical fields align aliases, preserve raw values and avoid unrelated meanings',()=>{
 const p={values:{rating:'4.8',address:'Other path address'},apify:{items:[{title:'Original name',totalScore:4.8,reviewsCount:1165,address:'Raw address',website:'http://example.com',url:'https://platform.example/listing',reviewsTags:['food'],category:'restaurant',cuisines:['Chinese','Asian']}]}};
 assert.deepEqual(candidates(p,'rating'),[{value:4.8,source:'Apify',key:'totalScore'}]);assert.equal(candidates(p,'review_count')[0].value,1165);
 assert.equal(candidates(p,'name')[0].value,'Original name');assert.equal(candidates(p,'address').length,2);
 assert.equal(candidates(p,'official_website')[0].value,'http://example.com');assert.equal(candidates(p,'review_themes').length,0);
 assert.deepEqual(candidates(p,'cuisines')[0].value,['Chinese','Asian']);
});
test('multiple provider records are not silently blended into a branch',()=>{
 const p={values:{},apify:{items:[{name:'Branch A'},{name:'Branch B'}]}};assert.equal(hasCoreData(p),false);assert.equal(candidates(p,'name').length,0);
});
test('ambiguous numeric weekday ranges do not replace visible hours',()=>{
 const p={values:{opening_hours:'Sunday 10:00 AM - 10:30 PM'},apify:{items:[{hours:{weekRanges:[[{open:600,close:1350}]]}}]}};
 assert.equal(candidates(p,'opening_hours')[0].source,'Website / search');assert.equal(candidates(p,'opening_hours')[1].source,'Apify');
});
