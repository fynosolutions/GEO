import { rm } from 'node:fs/promises';
// Only generated compiler output; remove stale JS/routes from previous versions.
await rm(new URL('../dist/',import.meta.url),{recursive:true,force:true});
