import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The browser talks only to Vite; Vite forwards /api to the backend, which
// listens on this computer only. Same origin, so the backend needs no CORS.
const apiProxy = {
  '/api': 'http://127.0.0.1:5001',
};

export default defineConfig({
  plugins: [react()],
  server: {
    // Same port as before (Create React App), and open the browser on start
    port: 3000,
    strictPort: true,
    open: true,
    proxy: apiProxy,
  },
  preview: {
    port: 3000,
    proxy: apiProxy,
  },
  build: {
    // Keep the old output folder name (already gitignored)
    outDir: 'build',
  },
});
