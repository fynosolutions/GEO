import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export async function createBatchOutputDirectory(root: string, task: 'Collect Information' | 'Collect Introduction') {
  const parent = resolve(root);
  await mkdir(parent, { recursive: true });
  let time = Date.now();
  while (true) {
    const timestamp = new Date(time).toISOString().replace(/[:.]/g, '-');
    const directory = join(parent, `${timestamp} - ${task}`);
    try {
      await mkdir(directory);
      return directory;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      time++;
    }
  }
}
