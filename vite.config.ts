/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

// Deployed at https://gdg-ntust.github.io/spin/ (project site → base = /<repo>/)
export default defineConfig({
  base: '/spin/',
  test: {
    include: ['tests/**/*.test.ts'],
    passWithNoTests: true,
  },
});
