import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 预览专用配置：独立端口(5174) + 代理到独立后端(3002)，
// 不与样式任务的 5173/3001 开发预览相互干扰。
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://localhost:3002'
    }
  }
})
