import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The browser talks to Vite only (same origin), so the auth cookie just works.
// Origin stays http://localhost:5173, which the backend's CORS/WebSocket check allows.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // API and WebSocket both live under /api on the backend (same layout as production).
    proxy: { '/api': { target: 'http://localhost:8000', ws: true } },
  },
})
