import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'esbuild'
  },
  server: {
    port: 3000,
    strictPort: false,
    proxy: {
      '/shopify-api': {
        target: `https://${process.env.VITE_SHOPIFY_STORE || 'sake-company.myshopify.com'}`,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/shopify-api/, ''),
        headers: {
          'X-Shopify-Access-Token': process.env.VITE_SHOPIFY_TOKEN || '',
        },
      },
    },
  }
})
