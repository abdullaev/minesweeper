import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      // Let a new version wait until all game windows have closed.
      registerType: 'prompt',
      injectRegister: 'script',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        id: './',
        name: 'Сапёр',
        short_name: 'Сапёр',
        description: 'Классический сапёр: три уровня сложности и игра без интернета.',
        lang: 'ru',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#f6f5f0',
        theme_color: '#f6f5f0',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // Preload even lazy media so the first offline game has sound and effects.
        globPatterns: ['**/*.{html,js,css,svg,png,gif,mp3,woff,woff2,webmanifest}'],
        // The bundled explosion GIF is approximately 13 MB.
        maximumFileSizeToCacheInBytes: 16 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
      },
    }),
  ],
});
