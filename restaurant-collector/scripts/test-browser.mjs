import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readdirSync} from 'node:fs';

const files=readdirSync('tests').filter(name=>name.endsWith('.test.mjs')).sort().map(name=>`tests/${name}`);
const result=spawnSync(process.execPath,['--test',...files],{
  stdio:'inherit',
  env:{...process.env,GEO_PLAYWRIGHT_MODULE:process.env.GEO_PLAYWRIGHT_MODULE || fileURLToPath(import.meta.resolve('playwright'))},
});
if(result.error)console.error(result.error.message);
process.exitCode=result.status ?? 1;
