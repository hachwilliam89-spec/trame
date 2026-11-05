import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  test: {
    name: 'images',
    globals: true,
    environment: 'node',
    include: ['src/**/*.images.spec.ts'],
    fileParallelism: false,
    hookTimeout: 900_000,
    testTimeout: 90_000,
  },
});
