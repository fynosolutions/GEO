// Keep exported failures short; complete provider responses stay in diagnostics.
export function conciseError(value:unknown):string{
 const text=(value instanceof Error?value.message:typeof value==='string'?value:'Collection failed.').replace(/\s+/g,' ').trim();
 if(!text)return 'Collection failed.';
 if(/^(?:No public listing|No matching public listing|No verified listing)/i.test(text))return 'No matching public listing was found.';
 if(/Ambiguous branch|Multiple candidate listings/i.test(text))return 'matched:false; multiple listings match the target.';
 if(/street.number conflict|conflicting street number/i.test(text))return 'matched:false; the candidate has a conflicting street number.';
 if(/Candidate listing found/i.test(text)){
  const matched=text.match(/fields match \(([^)]+)\)/)?.[1];
  const missing=text.match(/Unavailable identity fields: ([^.]+)/)?.[1];
  return `Candidate found but matched:false${matched?`; only ${matched} matches`:''}${missing?` (missing: ${missing})`:''}.`;
 }
 // Do not repeat a paragraph of raw provider errors in the public output.
 const sentence=text.split(/(?<=[.!?])\s+(?=[A-Z])/)[0];
 return sentence.length<=180?sentence:'Collection failed; check the saved provider diagnostics.';
}

export function preferredFailure(reasons:Iterable<string>,fallback:string):string{
 const values=[...reasons];
 return conciseError(values.find(v=>/matched:false/i.test(v))||values.find(v=>!/No matching public listing/i.test(v))||values[0]||fallback);
}
