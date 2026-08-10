import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// 锁定 root 为 frontend 目录，避免从仓库根目录调用时被误判为项目根，
// 进而把 backend/test/*.mjs（node:test）也当 vitest 用例扫进来。
const root = path.dirname(fileURLToPath(import.meta.url))

// 前端单测（Vitest，node 环境，跑纯函数/工具，无需 jsdom）。
// 覆盖 lib/ 下的纯逻辑（权重、主分类派生、cn 等），作为回归护栏。
export default defineConfig({
  root,
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'backend/**', '**/*.mjs'],
  },
})
