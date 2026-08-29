// backend/src/importer.js — §4.1 JD 对象导入 + §15 软去重写入
// 纯 Node 模块（仅依赖 node:crypto / node:sqlite），可被 backend 与 scripts 复用。
// 设计要点：
//  - 计划 §15 的去重主键是 (company + normalized_title + location)。自本改动起，
//    importer 在入库前就用 normalizeTitle(title) 算出 normalized_title（小写+空白归一），
//    因此同一条 JD 因大小写/空白差异重复爬取的变体，会在入库时归一为同一键 → 唯一索引当场生效去重。
//  - resolveId 优先用 (company + normalized_title + location) 判定重复（命中则更新，不重复计数）；
//    仅当 normalized_title 为 NULL（历史残留行）时回退到 (company + title + location)。
//  - id 主键：传入则复用；未传则用 title|company|location 的 sha1 前缀生成稳定 id，避免重复插入。

import { createHash } from 'node:crypto'
import { normalizeTitle } from './skill-normalize.js'

function nowStamp() {
  // SQLite datetime('now') 格式：YYYY-MM-DD HH:MM:SS（本地时区）
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

function genId(row) {
  const h = createHash('sha1')
    .update(`${row.title}|${row.company ?? ''}|${row.location ?? ''}`)
    .digest('hex')
    .slice(0, 10)
  return `jd_${h}`
}

function normalize(input, index) {
  const title = (input.title || '').toString().trim()
  if (!title) {
    throw new Error(`第 ${index + 1} 条缺少必填字段 title`)
  }
  let extracted = null
  if (input.extracted != null) {
    extracted =
      typeof input.extracted === 'string'
        ? input.extracted
        : JSON.stringify(input.extracted)
  }
  // 宽匹配过滤：只保留前端+AI信号岗位
  if (!isCoreFrontend(title)) {
    return null  // 跳过不匹配的岗位
  }
  return {
    id: input.id || genId({ title, company: input.company, location: input.location }),
    title,
    normalized_title: input.normalized_title ?? normalizeTitle(title),
    company: input.company ?? null,
    location: input.location ?? '深圳',
    role: input.role ?? null, // 方案 C：采集时打上的角色模板标签（如 "AI Agent 前端"），作用域过滤用
    search_role: input.search_role ?? null, // Phase4：保留"搜索时用的模板角色名"，不被 rebuildRole 覆盖，用于跨角色对比
    salary: input.salary ?? null,
    salary_raw: input.salary_raw ?? null,
    experience: input.experience ?? null,
    education: input.education ?? null,
    raw: input.raw ?? null,
    extracted,
    status: input.status ?? 'collected',
    user_note: input.user_note ?? null
  }
}

// 解析最终落库 id：优先 (company + normalized_title + location) 去重键，
// 回退 (company + title + location)，再回退主键 id；命中则复用；都不存在返回 null（全新）。
function resolveId(db, row) {
  if (row.normalized_title) {
    const byNorm = db
      .prepare('SELECT id FROM jobs WHERE company IS ? AND normalized_title = ? AND location = ? LIMIT 1')
      .get(row.company, row.normalized_title, row.location)
    if (byNorm) return byNorm.id
  }
  const byKey = db
    .prepare('SELECT id FROM jobs WHERE company IS ? AND title = ? AND location = ? LIMIT 1')
    .get(row.company, row.title, row.location)
  if (byKey) return byKey.id
  const byId = db.prepare('SELECT id FROM jobs WHERE id = ?').get(row.id)
  if (byId) return byId.id
  return null
}

function upsert(db, row, ts) {
  const existingId = resolveId(db, row)
  if (existingId) {
    // 非破坏性更新：传入空值时不覆盖已有值（避免重爬把已抽取的 extracted / 已解密的薪资抹掉）。
    // 状态在更新时保持不变——只有 analyze 成功抽取才会把状态推到 analyzed，重爬不会降级。
    db.prepare(
      `UPDATE jobs SET
         raw = COALESCE(?, raw),
         extracted = COALESCE(?, extracted),
         salary = COALESCE(?, salary),
         salary_raw = COALESCE(?, salary_raw),
         experience = COALESCE(?, experience),
         education = COALESCE(?, education),
         role = COALESCE(?, role),
         search_role = COALESCE(?, search_role),
         status = COALESCE(status, 'collected'),
         last_seen = ?, user_note = COALESCE(?, user_note)
       WHERE id = ?`
    ).run(
      row.raw,
      row.extracted,
      row.salary,
      row.salary_raw,

      row.experience,
      row.education,
      row.role,
      row.search_role,
      ts,
      row.user_note,
      existingId
    )
    return { id: existingId, action: 'updated' }
  }
  try {
    db.prepare(
      `INSERT INTO jobs
       (id, title, normalized_title, company, location, role, search_role, salary, salary_raw, salary_confidence,
        experience, education, raw, extracted, status, first_seen, last_seen, user_note)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      row.id,
      row.title,
      row.normalized_title,
      row.company,
      row.location,
      row.role,
      row.search_role,
      row.salary,
      row.salary_raw,

      row.experience,
      row.education,
      row.raw,
      row.extracted,
      row.status,
      ts,
      ts,
      row.user_note
    )
    return { id: row.id, action: 'inserted' }
  } catch (e) {
    // 最后兜底：唯一索引仍命中（如历史 NULL 行未回填时重爬），回退为按 key 更新，避免数据丢失
    if (/unique/i.test(e.message)) {
      const byNorm = row.normalized_title
        ? db.prepare('SELECT id FROM jobs WHERE company IS ? AND normalized_title = ? AND location = ? LIMIT 1').get(row.company, row.normalized_title, row.location)
        : null
      const existingId = byNorm || db.prepare('SELECT id FROM jobs WHERE company IS ? AND title = ? AND location = ? LIMIT 1').get(row.company, row.title, row.location)
      if (existingId) {
        db.prepare(
          `UPDATE jobs SET
             raw = COALESCE(?, raw),
             extracted = COALESCE(?, extracted),
             salary = COALESCE(?, salary),
             salary_raw = COALESCE(?, salary_raw),

             experience = COALESCE(?, experience),
             education = COALESCE(?, education),
             role = COALESCE(?, role),
             search_role = COALESCE(?, search_role),
             last_seen = ?
           WHERE id = ?`
        ).run(
          row.raw, row.extracted, row.salary, row.salary_raw,
          row.experience, row.education, row.role, row.search_role, ts, existingId
        )
        return { id: existingId, action: 'updated' }
      }
    }
    throw e
  }
}

// 为已存在的库补齐薪资解密相关列（schema 演进：新列用 ALTER 追加，避免重建表丢数据）
export function ensureSalaryColumns(db) {
  for (const col of ['salary_raw TEXT']) {
    const name = col.split(' ')[0]
    try {
      db.prepare(`ALTER TABLE jobs ADD COLUMN ${name} ${col.split(' ')[1]}`).run()
    } catch (e) {
      // 列已存在 → 忽略（SQLite 不支持 IF NOT EXISTS on ADD COLUMN）
      if (!/duplicate column|already exists/i.test(e.message)) throw e
    }
  }
}

// 批量导入；返回 { inserted, updated, errors }。单条失败不阻断其余。
// 注：node:sqlite（实验性）未提供 db.transaction 包装，这里逐条执行；
//     数据量小（采集/导入场景），逐条自动提交即可，且天然满足"单条失败不阻断"。
export function importJobs(db, jobs) {
  const list = Array.isArray(jobs) ? jobs : [jobs]
  const ts = nowStamp()
  const result = { inserted: 0, updated: 0, errors: [] }
  list.forEach((input, i) => {
    try {
      const row = normalize(input, i)
      const r = upsert(db, row, ts)
      if (r.action === 'inserted') result.inserted++
      else result.updated++
    } catch (e) {
      result.errors.push({ index: i, message: e.message })
    }
  })
  return result
}
