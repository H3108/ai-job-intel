// backend/src/analyze-report.mjs — 只读：基于当前 data/jobs.db 输出数据分析报告
//
// 用法（项目根任意 cwd）：
//   node backend/src/analyze-report.mjs
//
// 只读打开库，不触发迁移、不写库。输出：
//   1) 总览（职位数 / 已分析 / 薪资解密率）
//   2) 薪资分布（月薪 K，下限分桶 + 中位）
//   3) 规范岗位分布 TOP
//   4) 学历分布
//   5) 经验分布
//   6) Top 技能（job_skills）

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
const total = c('SELECT count(*) c FROM jobs')
const analyzed = c(`SELECT count(*) c FROM jobs WHERE status='analyzed'`)
const withSalary = c(`SELECT count(*) c FROM jobs WHERE salary IS NOT NULL AND trim(salary)<>''`)

// 薪资解析（复刻 analyze.js 口径：万=10K、元/1000、K 直接）
function parseK(s) {
  if (!s) return null
  let m = s.match(/([\d.]+)\s*-\s*([\d.]+)\s*万/)
  if (m) return { min: parseFloat(m[1]) * 10, max: parseFloat(m[2]) * 10 }
  m = s.match(/([\d.]+)\s*-\s*([\d.]+)\s*K/i)
  if (m) return { min: parseFloat(m[1]), max: parseFloat(m[2]) }
  m = s.match(/([\d.]+)\s*-\s*([\d.]+)\s*元/)
  if (m) return { min: parseFloat(m[1]) / 1000, max: parseFloat(m[2]) / 1000 }
  return null
}

const rows = db.prepare(`SELECT salary FROM jobs WHERE salary IS NOT NULL AND trim(salary)<>''`).all()
const mins = []
const maxs = []
let otherForm = 0
for (const r of rows) {
  const p = parseK(r.salary)
  if (p) {
    mins.push(p.min)
    maxs.push(p.max)
  } else {
    otherForm++
  }
}
const median = (a) => {
  if (!a.length) return null
  const s = [...a].sort((x, y) => x - y)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}
const buckets = { '<10K': 0, '10-20K': 0, '20-30K': 0, '30-50K': 0, '>50K': 0 }
for (const v of mins) {
  if (v < 10) buckets['<10K']++
  else if (v < 20) buckets['10-20K']++
  else if (v < 30) buckets['20-30K']++
  else if (v < 50) buckets['30-50K']++
  else buckets['>50K']++
}

console.log('=== 数据分析报告（基于当前 data/jobs.db）===')
console.log(`总岗位: ${total} | 已分析: ${analyzed} | 有薪资: ${withSalary}（解密率 ${total ? ((withSalary / total) * 100).toFixed(0) : 0}%）`)
console.log('')
console.log('--- 薪资分布（月薪 K，按区间下限分桶）---')
console.log(`样本: ${mins.length} | 中位下限: ${median(mins)?.toFixed(1)}K | 中位上限: ${median(maxs)?.toFixed(1)}K`)
for (const [k, v] of Object.entries(buckets)) console.log(`  ${k}: ${v}`)
if (otherForm) console.log(`  其他形态(日薪/面议等，未计入分桶): ${otherForm}`)
console.log('')
console.log('--- 规范岗位分布 TOP ---')
for (const r of db.prepare(`SELECT role, count(*) c FROM jobs WHERE role IS NOT NULL AND trim(role)<>'' GROUP BY role ORDER BY c DESC`).all())
  console.log(`  ${r.c}\t${r.role}`)
console.log('')
console.log('--- 学历分布 ---')
for (const r of db.prepare(`SELECT education_level, count(*) c FROM jobs WHERE education_level IS NOT NULL GROUP BY education_level ORDER BY c DESC`).all())
  console.log(`  ${r.c}\t${r.education_level || '(空)'}`)
console.log('')
console.log('--- 经验分布 ---')
for (const r of db.prepare(`SELECT experience_level, count(*) c FROM jobs WHERE experience_level IS NOT NULL GROUP BY experience_level ORDER BY c DESC`).all())
  console.log(`  ${r.c}\t${r.experience_level || '(空)'}`)
console.log('')
console.log('--- Top 技能（job_skills）---')
for (const r of db.prepare(`SELECT skill, count(*) c FROM job_skills GROUP BY skill ORDER BY c DESC LIMIT 25`).all())
  console.log(`  ${r.c}\t${r.skill}`)

// ── Phase4：城市 × 搜索角色 交叉视图（扩样后看市场全景） ──
console.log('')
console.log('--- 城市 × 搜索角色 组合计数 ---')
for (const r of db.prepare(`
  SELECT location, search_role, count(*) c,
         sum(CASE WHEN salary IS NOT NULL AND trim(salary)<>'' THEN 1 ELSE 0 END) sal
  FROM jobs GROUP BY location, search_role ORDER BY location, c DESC`).all()) {
  console.log(`  ${(r.location || '(空)')} × ${(r.search_role || '(未标注)')}: ${r.c} 岗 | 有薪资 ${r.sal}`)
}

console.log('')
console.log('--- 各组合薪资中位 + 主规范岗位 ---')
const comboRows = db.prepare(`SELECT location, search_role, salary, role FROM jobs WHERE salary IS NOT NULL AND trim(salary)<>''`).all()
const groups = {}
for (const r of comboRows) {
  const key = `${(r.location || '(空)')} | ${(r.search_role || '(未标注)')}`
  ;(groups[key] ||= []).push(r)
}
for (const [key, rs] of Object.entries(groups)) {
  const mins = rs.map((r) => parseK(r.salary)?.min).filter((v) => v != null)
  const med = median(mins)
  const roleCount = {}
  for (const r of rs) if (r.role) roleCount[r.role] = (roleCount[r.role] || 0) + 1
  const topRole = Object.entries(roleCount).sort((a, b) => b[1] - a[1])[0]
  console.log(`  ${key}: 中位下限 ${med?.toFixed(1)}K | 样本 ${rs.length} | 主岗位 ${topRole ? topRole[0] + '(' + topRole[1] + ')' : '(无)'}`)
}
