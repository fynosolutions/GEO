import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { setGlobalProxyFromEnv } from 'node:http';
if(existsSync(resolve('.env')))process.loadEnvFile(resolve('.env'));
if(process.env.HTTPS_PROXY||process.env.https_proxy||process.env.HTTP_PROXY||process.env.http_proxy){
 if(!process.env.NO_PROXY&&!process.env.no_proxy)process.env.NO_PROXY='localhost,127.0.0.1,::1';
 setGlobalProxyFromEnv();
}
