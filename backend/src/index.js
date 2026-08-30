// backend/src/index.js — JobIntel v2
// 职责：采集/解析/存储/查询/导出/展示 岗位数据与用户画像。
// AI 分析能力全部移入 Hush AI OS，本服务禁止调用 LLM。

import express from 'express'
import { DatabaseSync } from 'node:sqlite'
import { createGzip } from 'node:zlib'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdirSync, readFileSync, existsSync, readdirSync, statSync, unlinkSync, rmdirSync } from 'node:fs'
import { spawn } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..', '..')
const dataDir = join(root, 'data')
mkdirSync(dataDir, { recursive: true })

const dbPath = process.env.JOBS_DB_PATH || join(dataDir, 'jobs_v2.db')
const db = new DatabaseSync(dbPath)
const schemaSql = readFileSync(join(dataDir, 'schema-v2.sql'), 'utf-8')
db.exec(schemaSql)

const app = express()
app.use(express.json({ limit: '2mb' }))

app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next()
  res.set('X-Powered-By', 'JobIntel/v2')
  res.set('X-Request-Id', randomUUID().slice(0, 8))
  next()
})

app.use((req, res, next) => {
  const accept = String(req.headers['accept-encoding'] || '')
  if (!/\bgzip\b/.test(accept)) return next()
  const origJson = res.json.bind(res)
  res.json = (body) => {
    const buf = Buffer.from(JSON.stringify(body))
    const gz = createGzip({ level: 6 })
    const chunks = []
    gz.on('data', (c) => chunks.push(c))
    gz.on('end', () => {
      const out = Buffer.concat(chunks)
      res.set('Content-Encoding', 'gzip')
      res.set('Content-Type', 'application/json; charset=utf-8')
      res.set('Content-Length', String(out.length))
      res.end(out)
    })
    gz.on('error', () => origJson(body))
    gz.end(buf)
    return res
  }
  next()
})

const API_TOKEN = process.env.API_TOKEN
if (API_TOKEN) {
  app.use((req, res, next) => {
    if (req.path === '/api/health') return next()
    const auth = req.headers['authorization'] || ''
    const fromHeader = String(auth).startsWith('Bearer ') ? String(auth).slice(7) : ''
    const fromQuery = typeof req.query.token === 'string' ? req.query.token : ''
    if (fromHeader === API_TOKEN || fromQuery === API_TOKEN) return next()
    return res.status(401).json({ ok: false, error: 'unauthorized: missing or invalid API_TOKEN' })
  })
}

// Jobs
app.get('/api/jobs', (req, res) => {
  try {
    const conds = []
    const params = []
    if (req.query.city) { conds.push('city = ?'); params.push(String(req.query.city)) }
    if (req.query.q) {
      const q = `%${String(req.query.q)}%`
      conds.push('(title LIKE ? OR company LIKE ? OR description LIKE ?)')
      params.push(q, q, q)
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
    const total = db.prepare(`SELECT COUNT(*) AS n FROM jobs ${where}`).get(...params).n
    const limitRaw = parseInt(req.query.limit, 10)
    const offsetRaw = parseInt(req.query.offset, 10)
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 0
    const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? offsetRaw : 0
    let sql = `SELECT id, source, source_job_id, title, company, city, salary_raw, salary_min, salary_max, salary_period, salary_note, experience, education, posted_at, collected_at, updated_at, status FROM jobs ${where} ORDER BY posted_at DESC, collected_at DESC`
    if (limit) sql += ` LIMIT ${limit} OFFSET ${offset}`
    const rows = db.prepare(sql).all(...params)
    res.json({ total, limit: limit || total, offset, jobs: rows })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) })
  }
})

app.get('/api/jobs/:id', (req, res) => {
  try {
    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id)
    if (!job) return res.status(404).json({ ok: false, error: 'job not found' })
    res.json({ ok: true, job })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) })
  }
})

app.get('/api/jobs/stats', (_req, res) => {
  try {
    const total = db.prepare('SELECT COUNT(*) AS n FROM jobs').get().n
    const cities = db.prepare("SELECT city, COUNT(*) n FROM jobs WHERE city IS NOT NULL AND city <> '' GROUP BY city ORDER BY n DESC").all()
    const roles = db.prepare("SELECT title AS role, COUNT(*) n FROM jobs WHERE title IS NOT NULL AND title <> '' GROUP BY title ORDER BY n DESC LIMIT 20").all()
    const recent7 = db.prepare("SELECT COUNT(*) n FROM jobs WHERE collected_at >= datetime('now', '-7 days')").get().n
    const recent30 = db.prepare("SELECT COUNT(*) n FROM jobs WHERE collected_at >= datetime('now', '-30 days')").get().n
    res.json({ total, cities, roles, recent_7d: recent7, recent_30d: recent30 })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) })
  }
})

app.get('/api/jobs/search', (req, res) => {
  try {
    const q = String(req.query.q || '').trim()
    if (!q) return res.status(400).json({ ok: false, error: 'missing q' })
    const city = req.query.city ? String(req.query.city) : null
    const limitRaw = parseInt(req.query.limit, 10)
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 50
    const like = `%${q}%`
    const params = [like, like, like]
    let where = '(title LIKE ? OR company LIKE ? OR description LIKE ?)'
    if (city) { where += ' AND city = ?'; params.push(city) }
    const sql = `SELECT id, source, source_job_id, title, company, city, salary_raw, salary_min, salary_max, salary_period, salary_note, experience, education, posted_at, collected_at, updated_at, status FROM jobs WHERE ${where} ORDER BY posted_at DESC, collected_at DESC LIMIT ${limit}`
    const rows = db.prepare(sql).all(...params)
    res.json({ total: rows.length, jobs: rows })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) })
  }
})

// Scopes
app.get('/api/scopes', (_req, res) => {
  try {
    const cities = db.prepare("SELECT DISTINCT city FROM jobs WHERE city IS NOT NULL AND city <> '' ORDER BY city").all().map((r) => r.city)
    const roles = db.prepare("SELECT DISTINCT title AS role FROM jobs WHERE title IS NOT NULL AND title <> '' ORDER BY role").all().map((r) => r.role)
    const industries = db.prepare("SELECT DISTINCT industry FROM jobs WHERE industry IS NOT NULL AND industry <> '' ORDER BY industry").all().map((r) => r.industry)
    res.json({ ok: true, cities, roles, industries })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) })
  }
})

// Profile
app.get('/api/profile', (_req, res) => {
  try {
    const row = db.prepare("SELECT * FROM user_profile WHERE id = 'me'").get()
    if (!row) return res.json({ exists: false })
    const { id, ...profile } = row
    res.json({ exists: true, ...profile })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) })
  }
})

app.put('/api/profile', (req, res) => {
  try {
    const patch = req.body && typeof req.body === 'object' ? req.body : {}
    const now = new Date().toISOString()
    const exists = db.prepare("SELECT id FROM user_profile WHERE id = 'me'").get()
    if (!exists) {
      const cols = ['id', 'updated_at']
      const placeholders = ['?', '?']
      const values = ['me', now]
      for (const [k, v] of Object.entries(patch)) {
        if (k === 'id') continue
        cols.push(k)
        placeholders.push('?')
        values.push(typeof v === 'string' ? v : JSON.stringify(v))
      }
      db.prepare(`INSERT INTO user_profile (${cols.join(',')}) VALUES (${placeholders.join(',')})`).run(...values)
    } else {
      const sets = []
      const values = []
      for (const [k, v] of Object.entries(patch)) {
        if (k === 'id') continue
        sets.push(`${k} = ?`)
        values.push(typeof v === 'string' ? v : JSON.stringify(v))
      }
      sets.push('updated_at = ?')
      values.push(now)
      values.push('me')
      db.prepare(`UPDATE user_profile SET ${sets.join(',')} WHERE id = ?`).run(...values)
    }
    const row = db.prepare("SELECT * FROM user_profile WHERE id = 'me'").get()
    const { id, ...profile } = row
    res.json({ ok: true, exists: true, ...profile })
  } catch (e) {
    res.status(400).json({ ok: false, error: e?.message || String(e) })
  }
})

// Crawl
const logsDir = join(dataDir, 'logs')
mkdirSync(logsDir, { recursive: true })
let crawlChild = null
const crawlPidPath = join(dataDir, 'crawl.pid')

function latestCrawlLog() {
  try {
    const files = readdirSync(logsDir).filter((f) => /^crawl-\d{8}-\d{6}\.log$/.test(f))
    if (files.length === 0) return null
    files.sort()
    return join(logsDir, files[files.length - 1])
  } catch {
    return null
  }
}

function tailLog(path, n = 80) {
  try {
    return readFileSync(path, 'utf-8').split('\n').slice(-n).join('\n')
  } catch {
    return ''
  }
}

function parseCrawlProgress(text) {
  if (!text) return null
  const totalM = text.match(/开始轮询\s+(\d+)\s+个搜索/)
  if (!totalM) return null
  const total = parseInt(totalM[1], 10)
  if (!Number.isFinite(total) || total <= 0) return null
  const done = (text.match(/限速等待/g) || []).length
  return { total, done: Math.min(done, total), percent: Math.round((Math.min(done, total) / total) * 100) }
}

function nextScheduledRun() {
  const now = new Date()
  const next = new Date(now)
  next.setHours(3, 0, 0, 0)
  const dow = next.getDay()
  let add = (7 - dow) % 7
  if (add === 0 && now.getTime() >= next.getTime()) add = 7
  next.setDate(next.getDate() + add)
  return next.toISOString()
}

app.get('/api/crawl/status', (_req, res) => {
  const lockPath = join(dataDir, 'crawl.lock')
  const isRunning = !!crawlChild || existsSync(lockPath)
  const logPath = latestCrawlLog()
  let lastRun = null
  let progress = null
  if (logPath) {
    try {
      lastRun = new Date(statSync(logPath).mtimeMs).toISOString()
      progress = parseCrawlProgress(readFileSync(logPath, 'utf-8'))
    } catch {}
  }
  res.json({
    ok: true,
    isRunning,
    lastRun,
    nextRun: nextScheduledRun(),
    schedule: '每日 03:00（systemd timer）',
    log: tailLog(logPath || join(logsDir, 'crawl-latest.log')),
    progress,
  })
})

app.post('/api/crawl', (_req, res) => {
  const lockPath = join(dataDir, 'crawl.lock')
  if (crawlChild || existsSync(lockPath)) {
    return res.status(409).json({ ok: false, error: '抓取正在进行中，请稍后再试' })
  }
  try {
    const nodeBin = process.execPath.split('/').slice(0, -1).join('/')
    const env = { ...process.env, PATH: `${nodeBin}:${process.env.PATH || ''}` }
    crawlChild = spawn(process.execPath, [join(root, 'backend', 'src', 'crawler.js')], {
      cwd: root,
      env,
      detached: true,
      stdio: 'ignore',
    })
    crawlChild.on('exit', () => { crawlChild = null })
    crawlChild.unref()
    res.json({ ok: true, message: '已触发抓取，后台运行中' })
  } catch (e) {
    crawlChild = null
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.post('/api/crawl/stop', (_req, res) => {
  let killed = false
  if (crawlChild && !crawlChild.killed) {
    try { crawlChild.kill('SIGTERM') } catch {}
    killed = true
  }
  try {
    if (existsSync(crawlPidPath)) {
      const pgid = parseInt(readFileSync(crawlPidPath, 'utf8').trim(), 10)
      if (!Number.isNaN(pgid) && pgid > 1) {
        try { process.kill(-pgid, 'SIGTERM') } catch {}
        killed = true
      }
    }
  } catch {}
  try { if (existsSync(crawlPidPath)) unlinkSync(crawlPidPath) } catch {}
  try { if (existsSync(join(dataDir, 'crawl.lock'))) rmdirSync(join(dataDir, 'crawl.lock')) } catch {}
  crawlChild = null
  res.json({ ok: true, killed, message: killed ? '已发送停止信号，抓取任务正在退出…' : '当前没有运行中的抓取任务' })
})

// Export
app.get('/api/export/jobs', (req, res) => {
  try {
    const city = req.query.city ? String(req.query.city) : null
    const q = req.query.q ? String(req.query.q) : null
    let sql = 'SELECT * FROM jobs'
    const params = []
    if (city || q) {
      const wheres = []
      if (city) { wheres.push('city = ?'); params.push(city) }
      if (q) { const like = `%${q}%`; wheres.push('(title LIKE ? OR company LIKE ? OR description LIKE ?)'); params.push(like, like, like) }
      sql += ' WHERE ' + wheres.join(' AND ')
    }
    sql += ' ORDER BY posted_at DESC, collected_at DESC'
    const rows = db.prepare(sql).all(...params)
    res.json({
      schema_version: 'jobintel.jobs.v1',
      generated_at: new Date().toISOString(),
      source: 'jobintel',
      profile: req.query.profile || null,
      jobs: rows,
      metadata: { total_jobs: rows.length, sources: Array.from(new Set(rows.map((r) => r.source))), cities: Array.from(new Set(rows.map((r) => r.city).filter(Boolean))), date_range: { start: rows[rows.length - 1]?.collected_at || null, end: rows[0]?.collected_at || null } },
    })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) })
  }
})

app.get('/api/export/profile', (_req, res) => {
  try {
    const row = db.prepare("SELECT * FROM user_profile WHERE id = 'me'").get()
    res.json({ schema_version: 'jobintel.profile.v1', generated_at: new Date().toISOString(), profile: row || null })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) })
  }
})

// Intelligence (read-only, written by Hush AI OS)
app.get('/api/intelligence/latest', (_req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM intelligence_cache ORDER BY generated_at DESC LIMIT 50").all()
    const grouped = {}
    for (const r of rows) {
      if (!grouped[r.type]) grouped[r.type] = []
      grouped[r.type].push(r)
    }
    const latest = {}
    for (const [type, items] of Object.entries(grouped)) {
      latest[type] = items[0]
    }
    res.json({ generated_at: new Date().toISOString(), types: latest })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) })
  }
})

app.get('/api/intelligence/:type', (req, res) => {
  try {
    const type = String(req.params.type)
    const row = db.prepare('SELECT * FROM intelligence_cache WHERE type = ? ORDER BY generated_at DESC LIMIT 1').get(type)
    if (!row) return res.status(404).json({ ok: false, error: 'intelligence not found', type })
    res.json({ ok: true, ...row })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) })
  }
})

app.get('/api/intelligence/reports', (_req, res) => {
  try {
    const rows = db.prepare("SELECT id, type, generated_at, markdown FROM intelligence_cache WHERE type = 'report' ORDER BY generated_at DESC").all()
    res.json({ reports: rows })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) })
  }
})

app.get('/api/intelligence/reports/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM intelligence_cache WHERE id = ?').get(req.params.id)
    if (!row) return res.status(404).json({ ok: false, error: 'report not found' })
    res.json({ ok: true, ...row })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) })
  }
})

const PORT = process.env.PORT || 3001
const HOST = process.env.HOST || 'localhost'
app.listen(PORT, HOST, () => {
  console.log(`[backend] listening on http://${HOST}:${PORT}`)
  console.log(`[backend] sqlite: ${dbPath}`)
  if ((HOST === '0.0.0.0' || HOST === '::') && !process.env.API_TOKEN) {
    console.warn('\n⚠️  安全提醒：后端正监听所有网络接口(0.0.0.0)，且未设置 API_TOKEN。')
    console.warn('    任何人可访问你的数据接口。公网/局域网部署前请设置 API_TOKEN 环境变量开启 Bearer 鉴权。\n')
  }
})
