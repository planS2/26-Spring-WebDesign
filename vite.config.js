import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  define: {
    CESIUM_BASE_URL: JSON.stringify('/cesium'),
  },
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        { src: 'node_modules/cesium/Build/Cesium/Workers/**/*', dest: 'cesium/Workers', rename: { stripBase: 5 } },
        { src: 'node_modules/cesium/Build/Cesium/ThirdParty/**/*', dest: 'cesium/ThirdParty', rename: { stripBase: 5 } },
        { src: 'node_modules/cesium/Build/Cesium/Assets/**/*', dest: 'cesium/Assets', rename: { stripBase: 5 } },
        { src: 'node_modules/cesium/Build/Cesium/Widgets/**/*', dest: 'cesium/Widgets', rename: { stripBase: 5 } },
      ],
    }),
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
