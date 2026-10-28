// The renderer also runs as a plain web app (handy for development and for a hosted web version).
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  envDir: __dirname,
  envPrefix: 'A_BOT_PUBLIC_',
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  build: { outDir: resolve(__dirname, 'out/web'), emptyOutDir: true },
});
