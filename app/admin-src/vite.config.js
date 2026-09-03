import { defineConfig } from 'vite'
export default defineConfig({
  base: '/help/admin/',
  build: { outDir: '../public/admin', emptyOutDir: true },
})
