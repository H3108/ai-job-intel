// backend/src/verify-crawl.mjs — 重爬后只读验证（零污染回归检查）
//
// 用法（在项目根目录任意 cwd 均可，路径按本文件位置推算）：
//   node backend/src/verify-crawl.mjs
//
// 只读打开 data/jobs.db，不执行任何迁移、不写库。
// 任一检查 FAIL 都会打印出来，方便你定位是哪类残留。

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
const c = (sql) => db.prepare(sql).get().c
const nl = String.fromCharCode(10)

console.log('=== 重爬验证报告 ===')
console.log(`库: ${dbPath}`)
console.log(`总岗位数: ${c('SELECT count(*) c FROM jobs')}`)
console.log('')

const checks = [
  {
    name: '查看全部/查看更多 污染标题',
    sql: `SELECT count(*) c FROM jobs WHERE title LIKE '%查看全部%' OR title LIKE '%查看更多%' OR title LIKE '%查看职位%'`,
    want: 0,
  },
  {
    name: '多行(blob)标题',
    sql: `SELECT count(*) c FROM jobs WHERE title LIKE '%${nl}%' OR title LIKE '%\n%'`,
    want: 0,
  },
  {
    name: '空/NULL 归一标题',
    sql: `SELECT count(*) c FROM jobs WHERE title IS NULL OR trim(title)=''`,
    want: 0,
  },
  {
    name: '标题末尾残留“招聘”(单行污染信号)',
    sql: `SELECT count(*) c FROM jobs WHERE title LIKE '%招聘'`,
    want: 0,
    note: '正常职位标题应以岗位名结尾，不会以“招聘”结尾；>0 表示出现“公司+职位+招聘”单行污染',
  },
  {
    name: '薪资未解密却残留置信度',
    sql: `SELECT count(*) c FROM jobs WHERE (salary IS NULL OR trim(salary)='') AND salary_confidence IS NOT NULL`,
    want: 0,
    note: '未解密薪资应一并清空 confidence；>0 表示清洗被漏掉',
  },
  {
    name: '假 analyzed（状态已分析但无抽取结果）',
    sql: `SELECT count(*) c FROM jobs WHERE status='analyzed' AND (extracted IS NULL OR trim(extracted)='')`,
    want: 0,
    note: '状态机守卫：无抽取结果应保持 collected，不应标 analyzed',
  },
  {
    name: '经验未归一(exp_min/exp_max 全空)',
    sql: `SELECT count(*) c FROM jobs WHERE exp_min IS NULL AND exp_max IS NULL`,
    note: '仅作信息展示，不判 FAIL（部分岗位确实无经验要求属正常）',
    info: true,
  },
]

let fail = 0
for (const chk of checks) {
  const v = c(chk.sql)
  if (chk.info) {
    console.log(`ℹ ${chk.name}: ${v}`)
    continue
  }
  const ok = v === chk.want
  if (!ok) fail++
  console.log(`${ok ? '✓' : '✗ FAIL'} ${chk.name}: 实际=${v} 期望=${chk.want}${chk.note ? '  — ' + chk.note : ''}`)
}

console.log('')
const roleVariants = c('SELECT count(DISTINCT role) c FROM jobs')
console.log(`岗位归一(role) 不同值数: ${roleVariants}（治理后约 18 类，数值过大=仍有未归并标题）`)

const skillCov = db.prepare('SELECT count(DISTINCT job_id) c FROM job_skills').get().c
const totalJobs = c('SELECT count(*) c FROM jobs')
console.log(`job_skills 覆盖岗位: ${skillCov}/${totalJobs}`)

console.log('')
if (fail === 0) {
  console.log('✅ 全部硬性检查通过：重爬零污染，可直接用于分析。')
} else {
  console.log(`❌ 有 ${fail} 项检查未通过，按上面 FAIL 行定位后再处理。`)
}
