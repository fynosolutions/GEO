import { cp, mkdir } from 'node:fs/promises';

await mkdir(new URL('../dist/public/', import.meta.url), { recursive: true });
await cp(new URL('../frontend/html/index.html', import.meta.url), new URL('../dist/public/index.html', import.meta.url));
await cp(new URL('../frontend/html/results.html', import.meta.url), new URL('../dist/public/results.html', import.meta.url));
await cp(new URL('../frontend/css/', import.meta.url), new URL('../dist/public/css/', import.meta.url), { recursive: true });
console.log('Build complete: dist/');
