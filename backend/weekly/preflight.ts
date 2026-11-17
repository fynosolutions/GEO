/** Read-only account check: never starts an Actor or exposes response bodies. */
export async function checkWeeklyCredentials(transport:typeof fetch=fetch){
 const token=process.env.APIFY_TOKEN;
 if(!token)throw Error('Weekly preflight: APIFY_TOKEN is missing.');
 let response:Response;
 try{response=await transport('https://api.apify.com/v2/users/me',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)});}
 catch{throw Error('Weekly preflight: Apify account check could not connect; no Actor started.');}
 if(response.status===401)throw Error('Weekly preflight: APIFY_TOKEN is invalid or revoked (HTTP 401); replace the GitHub Actions Secret. No Actor started.');
 if(!response.ok)throw Error(`Weekly preflight: Apify account check failed (HTTP ${response.status}); no Actor started.`);
}
export function safeWorkerFailure(error:unknown):string{
 const text=error instanceof Error?error.message:'';
 const code=text.match(/Apify HTTP (401|402|403|429|500|502|503|504)\b/)?.[1];
 if(code)return `Store worker failed: Apify HTTP ${code}; ${code==='401'?'invalid or revoked credentials':code==='402'?'account usage unavailable':'provider request rejected'}.`;
 if(/disabled or APIFY_TOKEN not configured/.test(text))return 'Store worker failed: Apify credentials missing or collection disabled.';
 if(/Cannot read Apify config/.test(text))return 'Store worker failed: Apify configuration could not be read.';
 return 'Store worker failed; no verified full result was produced.';
}
