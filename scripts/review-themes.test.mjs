import test from'node:test';import assert from'node:assert/strict';import{reviewTexts,summarizeApifyReviews}from'../dist/backend/apify-reviews.js';
test('review summary uses actual review samples, never tags or merchant copy',async()=>{
 const result={items:[{description:'Best food',reviewTags:[{text:'fresh'}],reviewSamples:[{reviewText:'The soup was tasty.'}]}]};assert.deepEqual(reviewTexts(result.items),['The soup was tasty.']);
 await summarizeApifyReviews(result,async payload=>{assert.ok(payload.instructions.includes('in English'));assert.ok(!payload.input.includes('Best food'));return{status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({value:'Individual feedback praises the soup.',quotes:['soup was tasty.','invented']})}]}]};});
 assert.equal(result.review_themes.sample_size,1);assert.deepEqual(result.review_themes.quotes,['soup was tasty.']);
});
test('tags only do not trigger a summary API call',async()=>{await summarizeApifyReviews({items:[{reviewTags:['great']} ]},()=>{throw Error('Unexpected call');});});
