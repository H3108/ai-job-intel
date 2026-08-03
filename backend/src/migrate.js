// backend/src/migrate.js — 方案 B 迁移与回填（幂等、可回滚）
//
// 演进内容（对应 data/schema.sql v2）：
//   - jobs 新增 education_level TEXT（学历规范层级，从 education 派生）
//   - 新增 job_skills(job_id, skill, category, level) 子表（规范化技能，替代 JSON-in-TEXT 聚合）
//
// 原则：先加后删。所有变更都可在不丢数据前提下回滚（见 downNormalizedSchema）。
// 回填幂等：重复运行只补缺失行，不重复插入（依赖 PK + INSERT OR REPLACE）。

import { normalizeEducation, normalizeExperience, normalizeTitle, normalizeRole, splitAndNormalizeSkill, looksLikeSalary, SKILL_CATEGORY_OVERRIDE } from './skill-normalize.js'
import { ROLE_TEMPLATES } from './search-templates.js'
import { classifyRole } from './role-normalize.js'

const CONFIDENCE_MAP = { high: 0.9, medium: 0.6, low: 0.3 }

// ── Up：确保结构存在（ADD COLUMN 用 try/catch 兼容已存在的库） ──
export function ensureNormalizedSchema(db) {
  for (const col of [
    'education_level TEXT',
    'experience_level TEXT',
    'exp_min INTEGER',
    'exp_max INTEGER',
    'role TEXT',
    'search_role TEXT',
  ]) {
    const name = col.split(' ')[0]
    try {
      db.prepare(`ALTER TABLE jobs ADD COLUMN ${name} ${col.split(' ')[1]}`).run()
    } catch (e) {
      if (!/duplicate column|already exists/i.test(e.message)) throw e
    }
  }
  db.exec(`CREATE TABLE IF NOT EXISTS job_skills (
    job_id   TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    skill    TEXT NOT NULL,
    category TEXT,
    level    TEXT,
    PRIMARY KEY (job_id, skill, category)
  )`)
  db.exec('CREATE INDEX IF NOT EXISTS ix_job_skills_skill ON job_skills(skill)')
  db.exec('CREATE INDEX IF NOT EXISTS ix_job_skills_cat ON job_skills(category)')
  // 热查询索引（status/created_at/edu_level/exp_level/salary）
  db.exec('CREATE INDEX IF NOT EXISTS ix_jobs_status ON jobs(status)')
  db.exec('CREATE INDEX IF NOT EXISTS ix_jobs_created ON jobs(created_at DESC)')
  db.exec('CREATE INDEX IF NOT EXISTS ix_jobs_edu_level ON jobs(education_level)')
  db.exec('CREATE INDEX IF NOT EXISTS ix_jobs_exp_level ON jobs(experience_level)')
  db.exec('CREATE INDEX IF NOT EXISTS ix_jobs_salary ON jobs(salary)')
  db.exec('CREATE INDEX IF NOT EXISTS ix_jobs_search_role ON jobs(search_role)')
  // crawl_runs 低置信列（旧库兼容）：ADD COLUMN 用 try/catch 吞重复列错误
  try {
    db.prepare('ALTER TABLE crawl_runs ADD COLUMN salary_lowconf INTEGER DEFAULT 0').run()
  } catch (e) {
    if (!/duplicate column|already exists/i.test(e.message)) throw e
  }
}

// 把单条 extracted 的技能展开写入 job_skills（先删后插，保证与 extracted 一致）。
// 供 saveExtraction 与回填共用。解析失败不影响主流程。
export function replaceJobSkills(db, jobId, extracted) {
  let ex
  try {
    ex = typeof extracted === 'string' ? JSON.parse(extracted) : extracted
  } catch {
    return
  }
  if (!ex || typeof ex !== 'object') return
  const del = db.prepare('DELETE FROM job_skills WHERE job_id = ?')
  const ins = db.prepare('INSERT OR REPLACE INTO job_skills (job_id, skill, category, level) VALUES (?,?,?,?)')
  del.run(jobId)
  const levels = ex.skill_levels || {}
  const emit = (raw, category) => {
    if (!raw) return
    const lvl = levels[raw] || null
    for (const skill of splitAndNormalizeSkill(raw)) {
      // 已知设计工具强制归「工具链」，校正 LLM 把 Photoshop/Illustrator 误挂 AI工程化 的漂移
      const cat = SKILL_CATEGORY_OVERRIDE[skill] || category || null
      ins.run(jobId, skill, cat, lvl)
    }
  }
  const hs = ex.hard_skills || {}
  for (const [cat, list] of Object.entries(hs)) for (const raw of list || []) emit(raw, cat)
  for (const raw of ex.soft_skills || []) emit(raw, 'soft')
}

// ── 增量回填（每次启动跑一次，开销极小、幂等） ──
export function backfillNormalized(db) {
  const stats = {}

  // 0) 状态机修复：analyzed 但无抽取结果 → 回退 collected（避免"假 analyzed"污染统计）
  const fakeAnalyzed = db.prepare(
    "UPDATE jobs SET status = 'collected' WHERE status = 'analyzed' AND (extracted IS NULL OR extracted = '')"
  ).run()
  stats.fakeAnalyzedFixed = fakeAnalyzed.changes

  // 1) education_level：仅补缺失行
  const needEdu = db.prepare(
    "SELECT id, education FROM jobs WHERE education IS NOT NULL AND education <> '' AND (education_level IS NULL OR education_level = '')"
  ).all()
  const setEdu = db.prepare('UPDATE jobs SET education_level = ? WHERE id = ?')
  for (const r of needEdu) setEdu.run(normalizeEducation(r.education) || null, r.id)
  stats.eduBackfilled = needEdu.length

  // 2) experience 归一：仅补缺失行
  const needExp = db.prepare(
    "SELECT id, experience FROM jobs WHERE experience IS NOT NULL AND experience <> '' AND (experience_level IS NULL OR experience_level = '')"
  ).all()
  const setExp = db.prepare('UPDATE jobs SET experience_level = ?, exp_min = ?, exp_max = ? WHERE id = ?')
  for (const r of needExp) {
    const e = normalizeExperience(r.experience)
    setExp.run(e.level ?? null, e.min, e.max, r.id)
  }
  stats.expBackfilled = needExp.length

  // 2.5) role：规范岗位名，仅补缺失行（从 title 派生，合并同义标题）
  const needRole = db.prepare(
    "SELECT id, title FROM jobs WHERE (role IS NULL OR role = '') AND title IS NOT NULL AND title <> ''"
  ).all()
  const setRole = db.prepare('UPDATE jobs SET role = ? WHERE id = ?')
  for (const r of needRole) setRole.run(normalizeRole(r.title) || null, r.id)
  stats.roleBackfilled = needRole.length

  // 3) job_skills：仅补未入表的 analyzed 行
  const need = db.prepare(
    "SELECT id, extracted FROM jobs WHERE status = 'analyzed' AND extracted IS NOT NULL AND extracted <> '' AND id NOT IN (SELECT DISTINCT job_id FROM job_skills)"
  ).all()
  for (const r of need) replaceJobSkills(db, r.id, r.extracted)
  stats.skillsBackfilled = need.length

  // 4) 薪资置信度编码统一：把历史字面量 high/medium/low 映射为 float（同 crawler 现行写法）
  const needConf = db.prepare(
    "SELECT id, salary_confidence FROM jobs WHERE salary_confidence IN ('high','medium','low')"
  ).all()
  const setConf = db.prepare('UPDATE jobs SET salary_confidence = ? WHERE id = ?')
  for (const r of needConf) setConf.run(String(CONFIDENCE_MAP[r.salary_confidence]), r.id)
  stats.confidenceNormalized = needConf.length

  // 5) 薪资清洗：未解密的加密字形（PUA）曾被误存进 salary → 清空，置信度一并清空（无薪资即无置信度），仅保留 salary_raw
  const badSalary = db.prepare(
    "SELECT id, salary FROM jobs WHERE salary IS NOT NULL AND salary <> ''"
  ).all().filter((r) => !looksLikeSalary(r.salary))
  const nullConf = db.prepare(
    "SELECT id FROM jobs WHERE (salary IS NULL OR salary = '') AND salary_confidence IS NOT NULL"
  ).all()
  const clrSalary = db.prepare('UPDATE jobs SET salary = NULL, salary_confidence = NULL WHERE id = ?')
  for (const r of badSalary) clrSalary.run(r.id)
  for (const r of nullConf) clrSalary.run(r.id)
  stats.salaryCleaned = badSalary.length + nullConf.length

  return stats
}

// ── 方案 C 回填：把存量岗位按标题匹配到「角色模板」标签 ──
// 目的：历史数据 role 由 normalizeRole(title) 推成「前端工程师」之类，不等于模板名
//       「AI Agent 前端」，会导致 /api/analytics?role=AI Agent 前端 选不中。
// 这里把"未命中任何已知模板"的岗位，按其标题是否含某模板关键词重新打标；
// 都未命中则保留原 role（仍是有效规范名，只是不可作为 scope 精确筛选，可接受）。
export function backfillScope(db) {
  const known = Object.keys(ROLE_TEMPLATES)
  const rows = db.prepare('SELECT id, title, role FROM jobs').all()
  const setRole = db.prepare('UPDATE jobs SET role = ? WHERE id = ?')
  let retagged = 0
  for (const r of rows) {
    if (r.role && known.includes(r.role)) continue // 已是模板标签，跳过
    let matched = null
    const t = r.title || ''
    for (const name of known) {
      if (ROLE_TEMPLATES[name].keywords.some((k) => t.includes(k))) {
        matched = name
        break
      }
    }
    if (matched && matched !== r.role) {
      setRole.run(matched, r.id)
      retagged++
    }
  }
  return { scopeRetagged: retagged }
}

// ── 存量污染修复（显式 --repair 触发，不在启动自动跑） ──
// 针对早期爬虫把整张卡片文本塞进 title、company 写成「查看全部」的 152 行。
// 启发式解析 title blob：首行=标题、含 K/万/元/天=薪资、末行=城市、中间非薪资非城市=公司。
// 幂等：修复后 title 不含 \n 且 company≠查看全部，再次运行无效果。
export function repairPollutedRows(db) {
  const CITIES = new Set([
    '深圳', '上海', '北京', '广州', '杭州', '成都', '南京', '武汉', '西安', '苏州',
    '重庆', '天津', '长沙', '东莞', '宁波', '佛山', '合肥', '青岛', '无锡', '珠海',
    '厦门', '郑州', '福州', '济南', '沈阳', '大连', '昆明', '哈尔滨', '南昌', '南宁',
  ])
  const isSalary = (s) => /\d/.test(s) && /[Kk万元天]/.test(s)
  const samples = []
  const targets = db.prepare(
    "SELECT id, title, company FROM jobs WHERE title LIKE '%' || char(10) || '%' OR company = '查看全部'"
  ).all()
  const upd = db.prepare('UPDATE jobs SET title = ?, company = ?, normalized_title = ? WHERE id = ?')
  let fixed = 0
  let skipped = 0
  for (const r of targets) {
    const lines = String(r.title).split(/\n+/).map((s) => s.trim()).filter(Boolean)
    if (lines.length <= 1) continue
    const title = lines[0]
    let city = null
    if (CITIES.has(lines[lines.length - 1])) city = lines[lines.length - 1]
    const mids = lines.slice(1, city ? -1 : undefined).filter((s) => !isSalary(s) && s !== city)
    const company = mids.length ? mids[mids.length - 1] : (r.company && r.company !== '查看全部' ? r.company : null)
    if (!company) continue // 解析不出公司则跳过，避免把城市当公司
    // 逐行更新并捕获唯一索引冲突（修复后 (company,normalized_title) 可能与他行相撞），冲突则跳过该行
    try {
      upd.run(title, company, normalizeTitle(title), r.id)
      fixed++
      if (samples.length < 12) samples.push({ id: r.id, before: r.title.slice(0, 40), afterTitle: title, afterCompany: company })
    } catch (e) {
      if (/unique/i.test(e.message)) { skipped++; continue }
      throw e
    }
  }
  return { fixed, skipped, total: targets.length, samples }
}

// 去重删除：删除"修复后会撞干净行"的污染行（它们已是重复行，干净副本已存在）。
// 仅删确认有孪生副本的行（orphan=0 才安全）；会级联清掉其 job_skills（如有）。
// 属破坏性操作，仅 --repair --dedup 显式触发，且执行前请备份。
export function dedupPollutedRows(db) {
  const CITIES = new Set([
    '深圳', '上海', '北京', '广州', '杭州', '成都', '南京', '武汉', '西安', '苏州',
    '重庆', '天津', '长沙', '东莞', '宁波', '佛山', '合肥', '青岛', '无锡', '珠海',
    '厦门', '郑州', '福州', '济南', '沈阳', '大连', '昆明', '哈尔滨', '南昌', '南宁',
  ])
  const isSalary = (s) => /\d/.test(s) && /[Kk万元天]/.test(s)
  const targets = db.prepare(
    "SELECT id, title, company FROM jobs WHERE company = '查看全部' OR title LIKE '%' || char(10) || '%'"
  ).all()
  const del = db.prepare('DELETE FROM jobs WHERE id = ?')
  let removed = 0
  let kept = 0
  for (const r of targets) {
    const lines = String(r.title).split(/\n+/).map((s) => s.trim()).filter(Boolean)
    if (lines.length <= 1) { kept++; continue }
    const title = lines[0]
    let city = null
    if (CITIES.has(lines[lines.length - 1])) city = lines[lines.length - 1]
    const mids = lines.slice(1, city ? -1 : undefined).filter((s) => !isSalary(s) && s !== city)
    const company = mids.length ? mids[mids.length - 1] : null
    if (!company) { kept++; continue }
    const twin = db.prepare('SELECT id FROM jobs WHERE company = ? AND normalized_title = ? AND id <> ? LIMIT 1').get(company, normalizeTitle(title), r.id)
    if (twin) { del.run(r.id); removed++ }
    else kept++
  }
  return { removed, kept }
}

// 全量重建 job_skills（同义词表变更后调用，让归一规则立即生效）。
export function rebuildJobSkills(db) {
  db.exec('DELETE FROM job_skills')
  const rows = db.prepare(
    "SELECT id, extracted FROM jobs WHERE status = 'analyzed' AND extracted IS NOT NULL AND extracted <> ''"
  ).all()
  for (const r of rows) replaceJobSkills(db, r.id, r.extracted)
  return rows.length
}

// 确保岗族三列存在（role_family / role_function / role_language）。
export function ensureTaxonomyColumns(db) {
  for (const col of ['role_family TEXT', 'role_function TEXT', 'role_language TEXT']) {
    const name = col.split(' ')[0]
    try {
      db.prepare(`ALTER TABLE jobs ADD COLUMN ${name} ${col.split(' ')[1]}`).run()
    } catch (e) {
      if (!/duplicate column|already exists/i.test(e.message)) throw e
    }
  }
}

// 全量重建岗族（基于已归一化的 role 列；role 为空时回退 search_role）。
// 返回 { total, other }，other 为无法归类进「其他」的条数（预期 <1%）。
export function rebuildRoleTaxonomy(db) {
  ensureTaxonomyColumns(db)
  const rows = db
    .prepare("SELECT id, role, search_role FROM jobs WHERE (role IS NOT NULL AND role <> '') OR (search_role IS NOT NULL AND search_role <> '')")
    .all()
  const setT = db.prepare('UPDATE jobs SET role_family = ?, role_function = ?, role_language = ? WHERE id = ?')
  let other = 0
  for (const r of rows) {
    const c = classifyRole(r.role || r.search_role)
    if (c.family === '其他') other++
    setT.run(c.family, c.func, c.language, r.id)
  }
  return { total: rows.length, other }
}

// 全量重建 role（角色归一词表变更后调用，让归一规则立即生效）。
// 归一后顺带刷新岗族，保证 role 与 role_family/role_function/role_language 同步。
export function rebuildRole(db) {
  const rows = db.prepare("SELECT id, title FROM jobs WHERE title IS NOT NULL AND title <> ''").all()
  const setRole = db.prepare('UPDATE jobs SET role = ? WHERE id = ?')
  for (const r of rows) setRole.run(normalizeRole(r.title) || null, r.id)
  const t = rebuildRoleTaxonomy(db)
  return rows.length
}

// ── Down：回滚（删除新结构；job_skills 可由 extracted 随时重建，删表零风险） ──
// 注意：DROP COLUMN 需 SQLite >= 3.35（Node 22 的 node:sqlite 满足）。
// 若运行环境 SQLite 过旧，改用"建新表+复制+改名"替代。
export function downNormalizedSchema(db) {
  db.exec('DROP TABLE IF EXISTS job_skills')
  for (const col of ['education_level', 'experience_level', 'exp_min', 'exp_max', 'role']) {
    try {
      db.prepare(`ALTER TABLE jobs DROP COLUMN ${col}`).run()
    } catch (e) {
      if (!/duplicate column|no such column|not supported|near "DROP"/i.test(e.message)) throw e
      console.warn(`[migrate] 当前 SQLite 不支持 DROP COLUMN，保留空的 ${col} 列（无害）。`)
    }
  }
}
