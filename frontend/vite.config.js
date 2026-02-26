import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',          // relative paths → works on GitHub Pages and locally
  build: {
    outDir: '..',      // output to repo root (where stock.json lives)
    emptyOutDir: false, // CRITICAL: do NOT delete other files in root
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
      }
    }
  },
})
