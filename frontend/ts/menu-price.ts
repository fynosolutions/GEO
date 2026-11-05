// Display source prices without guessing a currency or choosing a service type.
function scalar(value:unknown):string|null{
 if(typeof value==='string'&&value.trim())return value;
 if(typeof value==='number'&&Number.isFinite(value))return String(value);
 return null;
}
function amount(value:unknown):string|null{
 const plain=scalar(value);if(plain!==null)return plain;
 if(value&&typeof value==='object'&&!Array.isArray(value)){
  const price=value as Record<string,unknown>;return scalar(price.display)??scalar(price.amount);
 }
 return null;
}
export function displayMenuPrice(value:unknown,currency?:unknown):string{
 let text=amount(value);
 if(value&&typeof value==='object'&&!Array.isArray(value)){
  const price=value as Record<string,unknown>;
  // Prefer service-specific prices when present; neither pickup nor delivery is implicit.
  const services=[['pickup','Pickup'],['delivery','Delivery']] as const;
  const present=services.filter(([key])=>Object.hasOwn(price,key));
  if(present.length){
   const available=present.some(([key])=>amount(price[key])!==null);
   text=available?present.map(([key,label])=>`${label}: ${amount(price[key])??'Not available'}`).join(' / '):null;
  }
  currency=scalar(currency)??scalar(price.currency);
 }
 return text===null?'Not available':text+(scalar(currency)?` (${scalar(currency)})`:'');
}
