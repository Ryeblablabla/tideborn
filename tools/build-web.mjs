import { build as bundleWorker } from 'esbuild';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build as buildClient } from 'vite';

const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
const client = new URL('client/', dist);
const worker = new URL('server/', dist);

process.env.VITE_PUBLIC_GAME = '1';
await rm(dist, { recursive: true, force: true });
await buildClient({ root: fileURLToPath(root), build: { outDir: 'dist/client' } });
for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) {
  await copyFile(new URL(file, root), new URL(file, client));
}

await bundleWorker({
  absWorkingDir: fileURLToPath(root),
  entryPoints: ['server/worker.js'],
  outfile: 'dist/server/index.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
});

const config = JSON.parse(await readFile(new URL('wrangler.json', root), 'utf8'));
const workerConfig = {
  ...config,
  main: './index.js',
  assets: { ...config.assets, directory: '../client' },
  d1_databases: config.d1_databases.map(database => ({
    ...database,
    migrations_dir: '../../drizzle',
  })),
};
await writeFile(new URL('wrangler.json', worker), `${JSON.stringify(workerConfig, null, 2)}\n`);

const hosting = new URL('.openai/hosting.json', root);
const hostingConfig = await readFile(hosting).catch(error => {
  if (error.code !== 'ENOENT') throw error;
});
if (hostingConfig) {
  await mkdir(new URL('.openai/', dist), { recursive: true });
  await writeFile(new URL('.openai/hosting.json', dist), hostingConfig);
}
