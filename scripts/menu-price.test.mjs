import test from 'node:test';
import assert from 'node:assert/strict';
import {displayMenuPrice} from '../dist/public/js/menu-price.js';
test('menu prices distinguish pickup and delivery without assuming a currency',()=>{
 assert.equal(displayMenuPrice({pickup:22,delivery:22}),'Pickup: 22 / Delivery: 22');
 assert.equal(displayMenuPrice({pickup:17.6,delivery:19},'USD'),'Pickup: 17.6 / Delivery: 19 (USD)');
 assert.equal(displayMenuPrice({pickup:0,delivery:null}),'Pickup: 0 / Delivery: Not available');
 assert.equal(displayMenuPrice({delivery:12.5}),'Delivery: 12.5');
 assert.equal(displayMenuPrice({pickup:null,delivery:null},'USD'),'Not available');
 assert.equal(displayMenuPrice({pickup:{display:'$12.50'},delivery:{amount:14},currency:'USD'}),'Pickup: $12.50 / Delivery: 14 (USD)');
});
test('menu prices preserve scalar and display values, including zero and missing prices',()=>{
 assert.equal(displayMenuPrice({display:'$13.20',amount:13.2,currency:'USD'}),'$13.20 (USD)');
 assert.equal(displayMenuPrice({display:'',amount:0},'USD'),'0 (USD)');
 assert.equal(displayMenuPrice('12.50','USD'),'12.50 (USD)');
 assert.equal(displayMenuPrice(0),'0');
 for(const price of [null,undefined,false,[],{},NaN,{amount:false},{other:22}])assert.equal(displayMenuPrice(price),'Not available');
});
