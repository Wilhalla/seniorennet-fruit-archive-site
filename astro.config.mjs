import { defineConfig } from 'astro/config'
import AstroPWA from '@vite-pwa/astro'
import react from '@astrojs/react'
import vercel from '@astrojs/vercel'
import tailwindcss from '@tailwindcss/vite'

const deploymentHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || ''
const siteUrl =
  process.env.PUBLIC_SITE_URL ||
  process.env.SITE_URL ||
  (deploymentHost ? `https://${deploymentHost.replace(/^https?:\/\//i, '')}` : 'https://fruit.janpeterdhalle.com')

export default defineConfig({
  output: 'static',
  adapter: vercel(),
  integrations: [
    react(),
    AstroPWA({
      base: '/',
      scope: '/',
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.png',
        'apple-touch-icon.png',
        'og-default.png',
        'apple-assets/apple-1-160.webp',
        'apple-assets/apple-2-160.webp',
      ],
      manifest: {
        id: '/',
        name: 'Blogarchief Daniël Willaeys',
        short_name: 'Fruitarchief',
        description: 'Bewaarde berichten, foto’s en reacties uit het fruitblogarchief van Daniël Willaeys.',
        lang: 'nl-BE',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
        background_color: '#fdfcfc',
        theme_color: '#fdfcfc',
        categories: ['books', 'education', 'photo'],
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        screenshots: [
          {
            src: 'og-default.png',
            sizes: '1200x630',
            type: 'image/png',
            form_factor: 'wide',
            label: 'Overzicht van het Blogarchief Daniël Willaeys',
          },
        ],
        shortcuts: [
          {
            name: 'Zoeken',
            short_name: 'Zoeken',
            description: 'Zoek door alle bewaarde blogberichten.',
            url: '/search/',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Beeldarchief',
            short_name: 'Beeld',
            description: 'Open de fotogalerij van het archief.',
            url: '/gallery/',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Atlas',
            short_name: 'Atlas',
            description: 'Verken de semantische atlas.',
            url: '/atlas/',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
      },
      workbox: {
        // Avoid precaching the multi-GB archive and large generated pages; runtime caches keep visited pages/data fast.
        navigateFallback: undefined,
        globPatterns: [
          '_astro/**/*.css',
          '_astro/**/*.woff2',
          'favicon.png',
          'apple-touch-icon.png',
          'pwa-*.png',
          'maskable-icon-512x512.png',
          'apple-assets/apple-1-160.webp',
          'apple-assets/apple-2-160.webp',
        ],
        globIgnores: ['**/archive-images/**', '**/generated/**'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'fruit-archive-pages',
              networkTimeoutSeconds: 3,
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 7 * 24 * 60 * 60,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/generated/'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'fruit-archive-data',
              expiration: {
                maxEntries: 40,
                maxAgeSeconds: 7 * 24 * 60 * 60,
                purgeOnQuotaError: true,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: ({ request, url }) => request.destination === 'image' && url.pathname.startsWith('/archive-images/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'fruit-archive-images',
              expiration: {
                maxEntries: 120,
                maxAgeSeconds: 30 * 24 * 60 * 60,
                purgeOnQuotaError: true,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: ({ request }) => ['font', 'script', 'style'].includes(request.destination),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'fruit-archive-static',
              expiration: {
                maxEntries: 80,
                maxAgeSeconds: 30 * 24 * 60 * 60,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      experimental: {
        directoryAndTrailingSlashHandler: true,
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      include: ['minisearch', 'lucide-react'],
    },
  },
  site: siteUrl,
  image: {
    responsiveStyles: true,
  },
})
