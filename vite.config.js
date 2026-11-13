import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  assetsInclude: ['**/*.glb'],
  build: { rollupOptions: { output: { manualChunks(id) {
    if(id.includes('node_modules/three')) return 'three';
    if(id.includes('/vendor/pixelfx/')) return 'pixelfx';
  } } } },
});
