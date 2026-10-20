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
    // proxy/function.ts imports the SDK by its Bun version-pinned specifier; tests use the devDependency.
    alias: { '@anthropic-ai/sdk@0.135.0': '@anthropic-ai/sdk' },
  },
});
