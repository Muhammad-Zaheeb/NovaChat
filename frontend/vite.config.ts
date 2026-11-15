import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The browser talks to Vite only (same origin), so the auth cookie just works.
// Origin stays http://localhost:5173, which the backend's CORS/WebSocket check allows.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/ws': { target: 'ws://localhost:8000', ws: true },
    },
  },
})
