import { defineConfig } from 'vite';
export default defineConfig({
  root: 'apps/performer',
  build: { outDir: '../../dist', emptyOutDir: true, target: 'es2022' },
  server: { allowedHosts: ['localhost', '127.0.0.1'], fs: { allow: ['../..'] } },
});
