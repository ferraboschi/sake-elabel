import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/',
  // Injected at build time — used by main.jsx as cache-bust version.
  // Changes on every build, so the index bundle hash always changes
  // and the GitHub Pages CDN can't serve a stale index.
  define: {
    __BUILD_VERSION__: JSON.stringify(new Date().toISOString().replace(/[:.]/g, '-')),
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        // Split stable vendors into separate cacheable chunks
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'i18n-vendor': ['i18next', 'react-i18next', 'i18next-browser-languagedetector'],
        },
      },
    },
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
