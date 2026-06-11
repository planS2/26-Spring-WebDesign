import { cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function copyCesiumAssets() {
  return {
    name: 'copy-cesium-assets',
    async closeBundle() {
      const source = resolve('node_modules/cesium/Build/Cesium');
      if (!existsSync(source)) return;
      await cp(source, resolve('dist/cesium'), { recursive: true, force: true });
    },
  };
}

export default defineConfig({
  define: {
    CESIUM_BASE_URL: JSON.stringify('/cesium'),
  },
  plugins: [
    react(),
    copyCesiumAssets(),
  ],
  server: {
    proxy: {
      '/terrain-dem': {
        target: 'https://s3.amazonaws.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/terrain-dem/, '/elevation-tiles-prod/terrarium'),
      },
    },
  },
});
