import {copyFile} from 'node:fs/promises';
await copyFile(new URL('../restaurant_collector/extract.mjs',import.meta.url),new URL('../extensions/google-maps-collector/extract.mjs',import.meta.url));
console.log('Chrome 扩展已同步项目的页面抽取器。');
