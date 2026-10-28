import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  clean: true,
  // Bundle the workspace package; keep firebase as a runtime dependency.
  noExternal: ['@a-bot/shared'],
  banner: { js: '#!/usr/bin/env node' },
});
