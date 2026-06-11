import { cp, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, normalize, resolve, sep } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const CESIUM_SOURCE_DIR = resolve('node_modules/cesium/Build/Cesium');
const CESIUM_PUBLIC_BASE = '/cesium/';

const mimeTypes = {
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ktx2': 'image/ktx2',
  '.webp': 'image/webp',
};

function isInsideCesiumSource(filePath) {
  const normalizedSource = normalize(CESIUM_SOURCE_DIR + sep);
  return normalize(filePath).startsWith(normalizedSource);
}

function cesiumAssetsPlugin() {
  return {
    name: 'cesium-assets',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = request.url?.split('?')[0] ?? '';
        if (!url.startsWith(CESIUM_PUBLIC_BASE)) {
          next();
          return;
        }
        if (!existsSync(CESIUM_SOURCE_DIR)) {
          response.statusCode = 404;
          response.end('Cesium package is not installed. Run npm install.');
          return;
        }
        const relativePath = decodeURIComponent(url.slice(CESIUM_PUBLIC_BASE.length));
        const filePath = resolve(CESIUM_SOURCE_DIR, relativePath);
        if (!isInsideCesiumSource(filePath)) {
          response.statusCode = 403;
          response.end('Forbidden');
          return;
        }
        try {
          const fileStat = await stat(filePath);
          if (!fileStat.isFile()) {
            next();
            return;
          }
          const contentType = mimeTypes[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
          response.setHeader('Content-Type', contentType);
          response.end(await readFile(filePath));
        } catch {
          next();
        }
      });
    },
    async closeBundle() {
      if (!existsSync(CESIUM_SOURCE_DIR)) return;
      await cp(CESIUM_SOURCE_DIR, resolve('dist/cesium'), { recursive: true, force: true });
    },
  };
}

export default defineConfig({
  define: {
    CESIUM_BASE_URL: JSON.stringify(CESIUM_PUBLIC_BASE),
  },
  plugins: [
    react(),
    cesiumAssetsPlugin(),
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
