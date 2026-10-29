import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['browser/*.test.mjs'], testTimeout: 30_000, hookTimeout: 30_000 } });
