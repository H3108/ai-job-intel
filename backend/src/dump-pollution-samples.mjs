// backend/src/dump-pollution-samples.mjs — 只读：dump 单行污染候选样本
//
// 用法（项目根任意 cwd）：
//   node backend/src/dump-pollution-samples.mjs
//
// 只读打开 data/jobs.db，列出所有 title 以"招聘"结尾的行（单行污染信号），
// 以及 company 为空但 title 不含换行的行（其他可能污染形态），供设计切分规则用。

import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { existsSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dbPath = join(__dirname, '..', '..', 'data', 'jobs.db')
if (!existsSync(dbPath)) {
  console.error(`✗ 找不到库：${dbPath}`)
  process.exit(1)
}
const db = new DatabaseSync(dbPath, { readOnly: true })

console.log('=== 单行污染候选样本 ===')
const rows = db
  .prepare(
    `SELECT id, title, company, salary, status, created_at
       FROM jobs
      WHERE title LIKE '%招聘'
      ORDER BY id`
  )
  .all()
console.log(`title 以"招聘"结尾的行数: ${rows.length}`)
for (const r of rows) {
  console.log(
    `#${r.id} | title=${JSON.stringify(r.title)} | company=${JSON.stringify(r.company)} | salary=${JSON.stringify(r.salary)} | status=${r.status}`
  )
}

console.log('')
console.log('=== 其他可能污染：company 为空且无换行的 title ===')
const others = db
  .prepare(
    `SELECT id, title, company, status
       FROM jobs
      WHERE (company IS NULL OR trim(company)='')
        AND title NOT LIKE '%'||char(10)||'%'
        AND title NOT LIKE '%招聘'
      ORDER BY id
      LIMIT 50`
  )
  .all()
console.log(`候选行数: ${others.length}（最多显示 50）`)
for (const r of others) {
  console.log(`#${r.id} | title=${JSON.stringify(r.title)} | company=${JSON.stringify(r.company)} | status=${r.status}`)
}

console.log('')
console.log('=== 参考：现有 company 去重词典（前 30，用于切分规则） ===')
const comps = db.prepare(`SELECT company, count(*) c FROM jobs WHERE company IS NOT NULL AND trim(company)<>'' GROUP BY company ORDER BY c DESC LIMIT 30`).all()
for (const r of comps) console.log(`  ${r.c}\t${r.company}`)
