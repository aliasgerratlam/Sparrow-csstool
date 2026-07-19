import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'

// The live Clerk instance (pk_live) only accepts requests whose Origin is the
// production domain over HTTPS — it rejects http://localhost with a 400
// "Invalid HTTP Origin header". To develop against the live key, we serve over
// HTTPS and let the app be reached at https://trysparrowcss.com:5173 (map that
// host to 127.0.0.1 in your OS hosts file). `allowedHosts` lets Vite answer for
// that Host header.
export default defineConfig({
  plugins: [react(), tailwindcss(), basicSsl()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    https: {},
    host: true,
    allowedHosts: ['trysparrowcss.com', 'www.trysparrowcss.com'],
  },
})
