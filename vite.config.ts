/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Relative asset paths, so the build works under any path (a share link keeps the page's own path).
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    // tools/check-bundle.ts reads the manifest to see what the entry chunk imports.
    manifest: true,
  },
  test: {
    // UI tests opt in to jsdom per file with a `@vitest-environment jsdom` docblock.
    include: ['test/**/*.test.{ts,tsx}'],
  },
});
