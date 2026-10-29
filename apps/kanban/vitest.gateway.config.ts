import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['src/gateway.integration.ts'], testTimeout: 20_000 } });
