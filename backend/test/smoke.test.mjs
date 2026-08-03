// backend/test/smoke.test.mjs — 最小 API 冒烟测试（审计 Issue 2 修复）
//
// 用隔离库（JOBS_DB_PATH 指向临时文件）拉起一个真实 backend 实例，
// 断言核心端点结构正确：/api/health、/api/analytics、/api/mastery。
// 不依赖已部署实例，也不触碰真实 data/jobs.db（避免与 3001/3002 抢锁）。
// 零新依赖：Node 22 内置 node:test + fetch + child_process。

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const backendDir = join(__dirname, '..')
const TEST_PORT = 3199
const baseUrl = `http://localhost:${TEST_PORT}`

let server
let tmpDir

async function waitForHealth(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${baseUrl}/api/health`)
      if (r.ok) return true
    } catch {
      /* 服务尚未监听，重试 */
    }
    await new Promise((res) => setTimeout(res, 200))
  }
  return false
}

before(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'p001-smoke-'))
  const dbPath = join(tmpDir, 'jobs.db')
  server = spawn(process.execPath, ['src/index.js'], {
    cwd: backendDir,
    env: { ...process.env, PORT: String(TEST_PORT), JOBS_DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  server.stderr.on('data', (d) => process.stderr.write(`[smoke server] ${d}`))
  const up = await waitForHealth()
  if (!up) {
    server.kill('SIGTERM')
    throw new Error('backend 冒烟实例在超时内未就绪')
  }
})

after(() => {
  if (server) server.kill('SIGTERM')
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true })
})

test('/api/health 结构正确', async () => {
  const r = await fetch(`${baseUrl}/api/health`)
  assert.equal(r.status, 200)
  const j = await r.json()
  assert.equal(j.ok, true)
  assert.equal(typeof j.status, 'string')
  assert.equal(typeof j.total, 'number')
  assert.equal(typeof j.salaryLowConfRed, 'number')
})

test('/api/analytics 结构正确', async () => {
  const r = await fetch(`${baseUrl}/api/analytics`)
  assert.equal(r.status, 200)
  const j = await r.json()
  // 注意：/api/analytics 直接返回聚合对象（无外层 ok）
  assert.equal(typeof j.total, 'number', 'total 应为数字')
  assert.ok(Array.isArray(j.skillRank), 'skillRank 应为数组')
  assert.ok(Array.isArray(j.categoryPriority), 'categoryPriority 应为数组')
  assert.ok(j.personalGap && typeof j.personalGap === 'object', 'personalGap 应为对象')
  assert.ok(Array.isArray(j.titleClusters), 'titleClusters 应为数组')
})

test('/api/mastery 可读写（学习闭环后端打通）', async () => {
  const put = await fetch(`${baseUrl}/api/mastery`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [{ skill: 'React', status: '已掌握' }] }),
  })
  assert.equal(put.status, 200)
  const pr = await put.json()
  assert.equal(pr.ok, true)
  assert.equal(pr.updated, 1)

  const get = await fetch(`${baseUrl}/api/mastery`)
  assert.equal(get.status, 200)
  const g = await get.json()
  assert.equal(g.ok, true)
  assert.ok(Array.isArray(g.items))
  assert.ok(g.items.some((it) => it.skill === 'React' && it.status === '已掌握'))
})

test('/api/jobs 列表分页可用', async () => {
  const r = await fetch(`${baseUrl}/api/jobs?limit=1`)
  assert.equal(r.status, 200)
  const j = await r.json()
  // 注意：/api/jobs 返回 { total, limit, offset, jobs }（无外层 ok）
  assert.ok(Array.isArray(j.jobs), 'jobs 应为数组')
  assert.equal(typeof j.total, 'number', 'total 应为数字')
  assert.equal(typeof j.limit, 'number', 'limit 应为数字')
})
