// scripts/restore-db.mjs — 从备份恢复 SQLite（计划 §25）
// 用法: npm run restore:db <备份文件路径>
import { copyFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const dbFile = join(root, 'data', 'jobs.db')

const arg = process.argv[2]
if (!arg) {
  console.error('[restore] 用法: npm run restore:db <备份文件路径>')
  process.exit(1)
}
if (!existsSync(arg)) {
  console.error(`[restore] 备份文件不存在: ${arg}`)
  process.exit(1)
}

copyFileSync(arg, dbFile)
console.log(`[restore] ✔ 已从 ${arg} 恢复至 ${dbFile}`)
