import { defineConfig } from 'astro/config'
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
  integrations: [react()],
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
