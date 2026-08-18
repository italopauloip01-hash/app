import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // OBRIGATÓRIO para o Capacitor Android carregar os assets corretamente
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'AirTech Pro - Gestão de Serviços',
        short_name: 'AirTech Pro',
        description: 'Aplicativo para técnicos de ar condicionado',
        theme_color: '#ffffff',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
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

