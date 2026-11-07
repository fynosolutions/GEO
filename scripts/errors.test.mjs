import test from 'node:test';import assert from 'node:assert/strict';
import {conciseError,preferredFailure} from '../dist/backend/errors.js';
test('exported reasons are one short English sentence while preserving the relevant failure',()=>{
 assert.equal(conciseError('No public listing for the target restaurant was found in the returned search results. This does not confirm whether the restaurant has registered an account on this platform.'),'No matching public listing was found.');
 assert.equal(conciseError('Candidate listing found, but matched:false. Identity check: 1/3 fields match (name). Unavailable identity fields: address, phone. At least two matching fields are required.'),'Candidate found but matched:false; only name matches (missing: address, phone).');
 const reason=preferredFailure(['No matching public listing was found.','Candidate found but matched:false; only name matches (missing: address, phone).'],'Collection failed.');
 assert.match(reason,/only name matches/);assert.equal(reason.split(/(?<=[.!?])\s+/).length,1);
 assert.equal(conciseError('Platform request timed out. Retry later.'),'Platform request timed out.');
});
