// scripts/backup-db.mjs — 一键备份 SQLite（计划 §25）
// data/jobs.db → data/backups/jobs-<YYYYMMDDHHmmss>.db，保留最近 10 份
import { copyFileSync, mkdirSync, readdirSync, unlinkSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const dataDir = join(root, 'data')
const backupDir = join(dataDir, 'backups')
const dbFile = join(dataDir, 'jobs.db')

mkdirSync(backupDir, { recursive: true })

if (!existsSync(dbFile)) {
  console.warn(`[backup] 未找到 ${dbFile}，无可备份内容（请先启动后端建库）。`)
  process.exit(0)
}

const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14) // YYYYMMDDHHmmss
const dest = join(backupDir, `jobs-${ts}.db`)
copyFileSync(dbFile, dest)
console.log(`[backup] ✔ 已备份: ${dest}`)

// 仅保留最近 10 份
const files = readdirSync(backupDir)
  .filter((f) => f.startsWith('jobs-') && f.endsWith('.db'))
  .map((f) => join(backupDir, f))
  .sort((a, b) => b.localeCompare(a)) // 新的在前

files.slice(10).forEach((f) => {
  unlinkSync(f)
  console.log(`[backup]   清理旧备份: ${f}`)
})
