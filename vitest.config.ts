import { defineConfig } from 'vitest/config';
export default defineConfig({test:{include:['tests/**/*.test.ts','packages/**/*.test.ts','apps/api/**/*.test.ts'],testTimeout:20000,hookTimeout:30000,coverage:{reporter:['text','json-summary']}}});
