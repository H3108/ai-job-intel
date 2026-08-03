import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// /api 代理到 Express 后端(:3001)，避免开发期跨域
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001'
    }
  }
})
