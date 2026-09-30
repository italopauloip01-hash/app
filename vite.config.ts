import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png'],
      manifest: {
        name: 'AirTech Pro - Gestão de Serviços',
        short_name: 'AirTech Pro',
        lang: 'pt-BR',
        description: 'Aplicativo de gestão para técnicos e climatização',
        theme_color: '#2563eb',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/apple-touch-icon.png',
            sizes: '180x180',
            type: 'image/png',
            purpose: 'any'
          }
        ]
      }
    })
  ],
  build: {
    // Aumenta o limite de aviso de chunk (evita warnings desnecessários)
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        // Divide o bundle em chunks menores para carregamento mais rápido
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          dexie: ['dexie', 'dexie-react-hooks'],
          ui: ['lucide-react'],
        }
      }
    }
  }
})

