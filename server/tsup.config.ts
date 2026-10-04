import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  // Bundle the workspace package (it ships TS source); keep real npm deps external.
  noExternal: ['@budget/shared'],
  clean: true,
  sourcemap: true,
});
