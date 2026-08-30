// backend/src/crawler.js — JobIntel v2 Collector
// 职责：采集 Boss 岗位数据，按 v2 schema 写入 SQLite。
// 不负责分析、归一化、LLM、report。这些全部移入 Hush AI OS。

import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { spawn } from 'node:child_process'
import { loadCrawlerConfig } from '../config/load.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..', '..')
const dataDir = join(root, 'data')
const PROFILE_DIR = join(dataDir, 'boss_profile')
mkdirSync(dataDir, { recursive: true })
mkdirSync(PROFILE_DIR, { recursive: true })

const db = new DatabaseSync(join(dataDir, 'jobs_v2.db'))
db.exec(readFileSync(join(dataDir, 'schema-v2.sql'), 'utf-8'))

const limiter = new (class RateLimiter {
  constructor() { this.base = 1200 }
  async wait() { await new Promise((r) => setTimeout(r, this.base + Math.random() * 800)) }
  async backoff(attempt) { await new Promise((r) => setTimeout(r, (attempt + 1) * 3000)) }
})()

const ALERTS = []
const MANUAL = process.argv.includes('--manual')
const USE_LAUNCH = process.argv.includes('--launch')
let RUN_NEW = 0
let RUN_UPDATED = 0
function resetRunCounters() { RUN_NEW = RUN_UPDATED = 0 }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function getArg(name) {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function buildBatchId() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const h = String(now.getHours()).padStart(2, '0')
  const min = String(now.getMinutes()).padStart(2, '0')
  const sec = String(now.getSeconds()).padStart(2, '0')
  const rand = Math.random().toString(36).slice(2, 6)
  return `crawl_${y}${m}${d}_${h}${min}${sec}_${rand}`
}

function normalizeSalary(raw) {
  if (!raw) return { salary_raw: null, salary_min: null, salary_max: null, salary_unit: 'CNY', salary_period: null, salary_note: null }
  const text = String(raw).trim()
  if (!text || text === '面议') return { salary_raw: text, salary_min: null, salary_max: null, salary_unit: 'CNY', salary_period: null, salary_note: '面议' }
  let salaryMin = null
  let salaryMax = null
  let salaryPeriod = 'month'
  let salaryNote = null
  const yearMatch = text.match(/年薪\s*(\d+)[-~](\d+)\s*万/)
  if (yearMatch) {
    salaryMin = Number(yearMatch[1]) * 10000
    salaryMax = Number(yearMatch[2]) * 10000
    salaryPeriod = 'year'
    return { salary_raw: text, salary_min: salaryMin, salary_max: salaryMax, salary_unit: 'CNY', salary_period: salaryPeriod, salary_note: salaryNote }
  }
  const monthMatch = text.match(/(\d+)[Kk]?\s*[-~]\s*(\d+)[Kk]/)
  if (monthMatch) {
    salaryMin = Number(monthMatch[1]) * 1000
    salaryMax = Number(monthMatch[2]) * 1000
    const yearBonus = text.match(/(\d+)薪/)
    if (yearBonus) salaryNote = `${yearBonus[1]}薪`
    return { salary_raw: text, salary_min: salaryMin, salary_max: salaryMax, salary_unit: 'CNY', salary_period: salaryPeriod, salary_note: salaryNote }
  }
  const wanMatch = text.match(/(\d+)[-~](\d+)\s*万/)
  if (wanMatch) {
    salaryMin = Number(wanMatch[1]) * 10000
    salaryMax = Number(wanMatch[2]) * 10000
    const yearBonus = text.match(/(\d+)薪/)
    if (yearBonus) salaryNote = `${yearBonus[1]}薪`
    return { salary_raw: text, salary_min: salaryMin, salary_max: salaryMax, salary_unit: 'CNY', salary_period: salaryPeriod, salary_note: salaryNote }
  }
  return { salary_raw: text, salary_min: null, salary_max: null, salary_unit: 'CNY', salary_period: null, salary_note: text }
}

function upsertJob(db, job, batchId, searchRoleName, searchCityName) {
  const existing = db.prepare('SELECT id, title, company, city, salary_raw, collected_at FROM jobs WHERE source = ? AND source_job_id = ?').get(job.source, job.source_job_id)
  const now = new Date().toISOString()
  const salary = normalizeSalary(job.salary_raw || job.salary)
  if (existing) {
    const updates = []
    const values = []
    const fields = ['title', 'company', 'city', 'district', 'industry', 'experience', 'education', 'employment_type', 'description', 'skills', 'requirements', 'benefits', 'tags', 'posted_at']
    for (const f of fields) {
      if (job[f] !== undefined && job[f] !== existing[f]) {
        updates.push(`${f} = ?`)
        values.push(job[f])
      }
    }
    updates.push('salary_raw = ?', 'salary_min = ?', 'salary_max = ?', 'salary_unit = ?', 'salary_period = ?', 'salary_note = ?', 'updated_at = ?', 'batch_id = ?')
    values.push(salary.salary_raw, salary.salary_min, salary.salary_max, salary.salary_unit, salary.salary_period, salary.salary_note, now, batchId)
    if (job.raw_payload) { updates.push('raw_payload = ?', 'raw_format = ?', 'raw_source = ?', 'raw_collected_at = ?', 'raw_version = ?'); values.push(job.raw_payload, job.raw_format || 'html', job.raw_source || job.source, now, 'v1') }
    if (updates.length) {
      values.push(job.source, job.source_job_id)
      db.prepare(`UPDATE jobs SET ${updates.join(',')} WHERE source = ? AND source_job_id = ?`).run(...values)
      RUN_UPDATED++
    }
    return { action: 'updated', id: existing.id }
  } else {
    const id = `${job.source}_${job.source_job_id}`
    db.prepare(`
      INSERT INTO jobs (
        id, source, source_job_id, source_url,
        title, company, city, district, industry,
        salary_raw, salary_min, salary_max, salary_unit, salary_period, salary_note,
        experience, education, employment_type,
        description, skills, requirements, benefits, tags,
        posted_at, collected_at, updated_at,
        status,
        raw_payload, raw_format, raw_source, raw_collected_at, raw_version,
        batch_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      job.source,
      job.source_job_id,
      job.source_url || null,
      job.title || null,
      job.company || null,
      job.city || searchCityName || null,
      job.district || null,
      job.industry || null,
      salary.salary_raw,
      salary.salary_min,
      salary.salary_max,
      salary.salary_unit,
      salary.salary_period,
      salary.salary_note,
      job.experience || null,
      job.education || null,
      job.employment_type || null,
      job.description || null,
      job.skills ? JSON.stringify(job.skills) : null,
      job.requirements ? JSON.stringify(job.requirements) : null,
      job.benefits ? JSON.stringify(job.benefits) : null,
      job.tags ? JSON.stringify(job.tags) : null,
      job.posted_at || null,
      now,
      now,
      'active',
      job.raw_payload || null,
      job.raw_format || null,
      job.raw_source || job.source,
      job.raw_collected_at || now,
      'v1',
      batchId
    )
    RUN_NEW++
    return { action: 'inserted', id }
  }
}

function recordCrawlRun(batchId, mode, startTime) {
  try {
    const durationMs = Date.now() - startTime
    db.prepare(`
      INSERT INTO collection_runs (batch_id, status, source, jobs_new, jobs_updated, errors, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(batchId, ALERTS.length ? 'warn' : 'ok', 'boss', RUN_NEW, RUN_UPDATED, JSON.stringify(ALERTS), durationMs)
    console.log(`[crawler] 已记录采集运行（状态=${ALERTS.length ? 'warn' : 'ok'}，新${RUN_NEW}/更${RUN_UPDATED}）`)
  } catch (e) {
    console.error('[crawler][ERROR] 写入 collection_runs 失败：' + (e?.stack || e?.message || e))
  }
}

function printAlerts() {
  if (ALERTS.length) {
    console.warn(`\n[crawler] 本次共 ${ALERTS.length} 条告警：`)
    ALERTS.forEach((a) => console.warn('  - ' + a))
  } else {
    console.log('\n[crawler] 完成，无告警。')
  }
}
