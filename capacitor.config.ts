import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.airtech.pro',
  appName: 'AirTech Pro',
  webDir: 'dist',
  server: {
    // Permite o app rodar corretamente como app nativo (não como servidor local)
    androidScheme: 'https',
    // Necessário para o Supabase e chamadas de rede funcionarem
    allowNavigation: ['*.supabase.co'],
    cleartext: true,
  },
  android: {
    // Permite conteúdo misto (HTTP + HTTPS) necessário para alguns recursos
    allowMixedContent: true,
    // Captura cliques de volta do Android nativamente
    captureInput: true,
    // Desabilita overscroll (efeito "borracha" que parece não-nativo)
    overScrollMode: 'never',
  },
  plugins: {
    // Configuração do Filesystem para o backup funcionar
    Filesystem: {
      iosScheme: 'ionic'
    }
  }
};

export default config;

