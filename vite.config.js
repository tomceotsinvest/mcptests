import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const BRIDGE_PORT = process.env.JARVIS_PORT ?? '8787'

// `/api` is proxied to the local Claude bridge so the browser stays
// same-origin and the Anthropic key never reaches the client bundle.
const proxy = {
  '/api': {
    target: `http://127.0.0.1:${BRIDGE_PORT}`,
    changeOrigin: false,
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { proxy },
  preview: { proxy },
  test: {
    environment: 'node',
    include: ['src/**/*.test.js', 'server/**/*.test.js'],
  },
})
