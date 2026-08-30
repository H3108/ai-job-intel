import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const backendDir = join(__dirname, '..')
const TEST_PORT = 5281
const baseUrl = `http://localhost:${TEST_PORT}`

let server
let tmpDir

async function waitForReady(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${baseUrl}/api/jobs/stats`)
      if (r.ok) return true
    } catch {
      // not ready yet
    }
    await new Promise((res) => setTimeout(res, 300))
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
  const up = await waitForReady()
  if (!up) {
    server.kill('SIGTERM')
    throw new Error('backend 冒烟实例在超时内未就绪')
  }
})

after(() => {
  if (server) server.kill('SIGTERM')
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true })
})

test('/api/jobs/stats 结构正确', async () => {
  const r = await fetch(`${baseUrl}/api/jobs/stats`)
  assert.equal(r.status, 200)
  const j = await r.json()
  assert.equal(typeof j.total, 'number', 'total 应为数字')
  assert.ok(Array.isArray(j.cities), 'cities 应为数组')
  assert.ok(Array.isArray(j.roles), 'roles 应为数组')
})

test('/api/jobs 列表分页可用', async () => {
  const r = await fetch(`${baseUrl}/api/jobs?limit=1`)
  assert.equal(r.status, 200)
  const j = await r.json()
  assert.ok(Array.isArray(j.jobs), 'jobs 应为数组')
  assert.equal(typeof j.total, 'number', 'total 应为数字')
  assert.equal(typeof j.limit, 'number', 'limit 应为数字')
})

test('/api/scopes 可读取', async () => {
  const r = await fetch(`${baseUrl}/api/scopes`)
  assert.equal(r.status, 200)
  const j = await r.json()
  assert.equal(typeof j.ok, 'boolean')
  assert.ok(Array.isArray(j.cities))
  assert.ok(Array.isArray(j.roles))
})

test('/api/export/jobs 可导出', async () => {
  const r = await fetch(`${baseUrl}/api/export/jobs`)
  assert.equal(r.status, 200)
  const j = await r.json()
  assert.equal(j.schema_version, 'jobintel.jobs.v1')
  assert.ok(Array.isArray(j.jobs))
})

test('/api/intelligence/latest 空结果降级正常', async () => {
  const r = await fetch(`${baseUrl}/api/intelligence/latest`)
  assert.equal(r.status, 200)
  const j = await r.json()
  assert.ok(typeof j.generated_at === 'string')
  assert.ok(typeof j.types === 'object')
})
