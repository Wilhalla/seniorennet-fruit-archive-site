import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      include: ['minisearch', 'lucide-react'],
    },
  },
  site: 'http://localhost:4321',
  image: {
    responsiveStyles: true,
  },
})
