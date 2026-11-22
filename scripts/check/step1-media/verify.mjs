import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('../../../',import.meta.url)));
const result=spawnSync(process.execPath,['scripts/verify-media-current.mjs',process.argv[2]??'samples/step1-media'],{stdio:'inherit'});process.exit(result.status??1);
