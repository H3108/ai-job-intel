// scripts/backfill-taxonomy.mjs — 一次性回填岗族三列 + 清理垃圾角色
// 用法：node scripts/backfill-taxonomy.mjs
// 动作：
//  1) ensureTaxonomyColumns 确保 role_family/role_function/role_language 存在
//  2) 删除 10 条低关联/垃圾 role（物理删除 + 清理 job_skills 孤儿）
//  3) rebuildRoleTaxonomy 对剩余记录重算岗族
//  4) 打印前后对比与「其他」占比

import { DatabaseSync } from 'node:sqlite'
import { ensureTaxonomyColumns, rebuildRoleTaxonomy } from '../backend/src/migrate.js'

const db = new DatabaseSync('data/jobs.db')

const JUNK_ROLES = [
  'FDE前线部署',
  '培训师',
  '工业机器人调试',
  '工程部辅助员+带薪学习长白班',
  '工艺',
  '有点累 但真的赚钱',
  '舞蹈学员',
  '音频FDE',
  '高级FDE',
  '高薪网络销售'
]

ensureTaxonomyColumns(db)

const before = db.prepare('SELECT COUNT(*) c FROM jobs').get().c

const delJobs = db.prepare(`DELETE FROM jobs WHERE role IN (${JUNK_ROLES.map(() => '?').join(',')})`)
const delRes = delJobs.run(...JUNK_ROLES)

const delSkills = db.prepare('DELETE FROM job_skills WHERE job_id NOT IN (SELECT id FROM jobs)')
const skillRes = delSkills.run()

const after = db.prepare('SELECT COUNT(*) c FROM jobs').get().c

const tax = rebuildRoleTaxonomy(db)

console.log('=== 回填前/后 ===')
console.log('jobs 总数:', before, '→', after, `(删除 ${delRes.changes} 条)`)
console.log('孤儿 job_skills 删除:', skillRes.changes)
console.log('\n=== 岗族分布（回填后） ===')
for (const r of db.prepare('SELECT role_family, role_function, COUNT(*) c FROM jobs GROUP BY role_family, role_function ORDER BY c DESC').all()) {
  console.log(String(r.c).padStart(4), '|', r.role_function, '/', r.role_family)
}
console.log('\n其他(无法归类)条数:', tax.other, '/', tax.total, `(${((tax.other / tax.total) * 100).toFixed(2)}%)`)
console.log(tax.other === 0 ? '✅ 其他占比 0%' : '⚠️ 仍有未归类项，需补 OVERRIDE/KEYWORD')
