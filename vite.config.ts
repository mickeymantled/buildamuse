/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    // UI tests opt in to jsdom per file with a `@vitest-environment jsdom` docblock.
    include: ['test/**/*.test.{ts,tsx}'],
  },
});
