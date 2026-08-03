// scripts/seed-import.mjs — 把 data/seed_jobs.json（§23 冷启动种子，策略 B 离线提取产物）
// 灌入 SQLite jobs 表。复用 backend/src/importer.js 的 §4.1 校验 + §15 软去重。
//
// 运行：node scripts/seed-import.mjs   （在项目根目录）

import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { importJobs } from '../backend/src/importer.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const dataDir = join(root, 'data')

const db = new DatabaseSync(join(dataDir, 'jobs.db'))
db.exec(readFileSync(join(dataDir, 'schema.sql'), 'utf-8'))

const jobs = JSON.parse(readFileSync(join(dataDir, 'seed_jobs.json'), 'utf-8'))
const result = importJobs(db, jobs)

console.log('[seed-import] 灌库完成：')
console.log('  插入:', result.inserted)
console.log('  更新:', result.updated)
console.log('  错误:', result.errors.length ? result.errors : '无')

const total = db.prepare('SELECT COUNT(*) AS n FROM jobs').get().n
console.log(`[seed-import] jobs 表现在共 ${total} 条`)
