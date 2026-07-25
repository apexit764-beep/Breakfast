import { defineConfig } from 'vite';
import { resolve } from 'path';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [viteSingleFile()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@types': resolve(__dirname, 'src/types'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        plugin: resolve(__dirname, 'src/plugin/main.ts'),
        ui: resolve(__dirname, 'src/ui/index.html'),
      },
      output: {
        entryFileNames: '[name]/main.js',
      },
    },
  },
});
