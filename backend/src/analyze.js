// backend/src/analyze.js — Phase 2 AI 分析引擎
// ─────────────────────────────────────────────────────────────────────────────
// 抽取 schema 对齐 §4.1 / data/seed_jobs.json 的 `extracted` 结构：
//   { salary, experience, education,
//     hard_skills: { 前端框架/语言:[], AI工程化:[], 工程化/基建:[], 工具链:[] },
//     soft_skills:[], requirements:[], bonuses:[],
//     skill_levels: { "技能名": "必备"|"常见"|"稀缺" } }
//
// 两种策略（PRD §6）：
//   策略 A — OpenAI 兼容 LLM API（env: OPENAI_API_KEY / OPENAI_BASE_URL / OPENAI_MODEL）
//   策略 B — 本实例（WorkBuddy）离线批量抽取，结果以 merge JSON 回填（无需 API key）
// ─────────────────────────────────────────────────────────────────────────────

import { DatabaseSync } from 'node:sqlite'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { prepareDecoder } from './font-decrypt.js'
import { normalizeEducation, normalizeExperience, normalizeTitle, normalizeRole, splitAndNormalizeSkill, baseForm, bucketExperience } from './skill-normalize.js'
import { replaceJobSkills, ensureNormalizedSchema, backfillNormalized, rebuildJobSkills, rebuildRole, repairPollutedRows, dedupPollutedRows } from './migrate.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..', '..')
const dataDir = join(root, 'data')
const DB_PATH = join(dataDir, 'jobs.db')

// 零依赖读取 backend/.env（含 LLM key，已 gitignore）。仅在环境变量未设置时填充。
// 容忍行内 # 注释与首尾空白（如 `OPENAI_BASE_URL=".../v4   # 注释"` 会被净化为干净 URL）。
export function loadDotEnv() {
  const envPath = join(root, 'backend', '.env')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i)
    if (!m) continue
    const key = m[1]
    if (process.env[key] !== undefined) continue // 系统已设则不覆盖
    let val = m[2].replace(/^["']|["']$/g, '') // 去首尾引号
    val = val.replace(/#.*$/, '').trim() // 剥离行内 # 注释并去首尾空白
    if (val === '') continue // 跳过空值（纯注释行等）
    process.env[key] = val
  }
}

export const SKILL_CATEGORIES = ['前端框架/语言', 'AI工程化', '工程化/基建', '工具链']
export const EXTRACTION_SCHEMA = {
  salary: '薪资范围，如 "20-35K"；无则 null',
  experience: '经验要求，如 "1年以上"；无则 null',
  education: '学历要求，如 "本科及以上"；无则 null',
  hard_skills: Object.fromEntries(SKILL_CATEGORIES.map((c) => [c, []])),
  soft_skills: [],
  requirements: [],
  bonuses: [],
  skill_levels: {} // skill -> '必备' | '常见' | '稀缺'
}

function openDb() {
  return new DatabaseSync(DB_PATH)
}

// 剥离 Boss 详情页外壳噪音，只保留 JD 正文（提升离线/LLM 抽取准确率）。
// 截取「职位描述/职责/要求」之后、「工商信息/更多职位/推荐/页脚」之前的内容。
export function cleanRaw(raw, maxLen = 0) {
  if (!raw) return ''
  let s = String(raw)
  const startMarks = ['职位描述', '职位职责', '岗位职责', '工作内容', '职位要求', '任职资格', '岗位要求']
  let earliest = -1
  for (const m of startMarks) {
    const i = s.indexOf(m)
    if (i !== -1 && (earliest === -1 || i < earliest)) earliest = i
  }
  if (earliest !== -1) s = s.slice(earliest)
  const endMarks = [
    '工商信息', '更多职位', '看过该职位的人还看了', 'BOSS 安全提示', 'BOSS安全提示',
    '首页', '页面更新时间', '相关职位', '公司地址', '工作地址', '举报', '微信扫码'
  ]
  let end = s.length
  for (const m of endMarks) {
    const i = s.indexOf(m)
    if (i !== -1 && i > 0 && i < end) end = i
  }
  if (end !== s.length) s = s.slice(0, end)
  s = s.replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim()
  if (maxLen > 0 && s.length > maxLen) s = s.slice(0, maxLen)
  return s
}

// 把一条抽取结果落库：写 extracted JSON + salary/experience/education + normalized_title，状态 analyzed。
// salary/experience/education 仅在提供非空值时覆盖（COALESCE 保留已有值）。
export function saveExtraction(db, id, extracted, meta = {}) {
  // 防 SQLite 绑定崩溃：对象/数组 → JSON 字符串，undefined/null → 空串；数字原样
  const coerce = (v) => {
    if (v === undefined || v === null) return ''
    if (typeof v === 'string') return v
    if (typeof v === 'number') return String(v)
    return JSON.stringify(v)
  }
  // 标量数字列允许 null（SQLite 可绑定 null，但不接受 undefined）
  const normNum = (v) => (typeof v === 'number' ? v : null)
  const extractedStr = typeof extracted === 'string' ? extracted : JSON.stringify(extracted)
  const row = db.prepare('SELECT title, company, location FROM jobs WHERE id = ?').get(id)
  if (!row) return false
  const norm = normalizeTitle(row.title)
  const eduLevel = normalizeEducation(meta.education)
  const exp = normalizeExperience(meta.experience)
  // 状态机不变量：仅当确有抽取结果才标 analyzed，否则回落 collected（避免"假 analyzed"）
  const status = extractedStr && extractedStr !== '' ? 'analyzed' : 'collected'
  const params = [
    extractedStr, coerce(meta.salary), coerce(meta.experience), coerce(meta.education),
    coerce(eduLevel), coerce(exp.level), normNum(exp.min), normNum(exp.max), norm, normalizeRole(row.title) ?? null, status, id
  ]
  const sql = `UPDATE jobs SET
       extracted = ?,
       salary = COALESCE(NULLIF(?, ''), salary),
       experience = COALESCE(NULLIF(?, ''), experience),
       education = COALESCE(NULLIF(?, ''), education),
       education_level = COALESCE(NULLIF(?, ''), education_level),
       experience_level = COALESCE(NULLIF(?, ''), experience_level),
       exp_min = ?,
       exp_max = ?,
       normalized_title = COALESCE(NULLIF(?, ''), normalized_title),
       role = COALESCE(NULLIF(?, ''), role),
       status = ?,
       last_seen = datetime('now')
     WHERE id = ?`
  try {
    db.prepare(sql).run(...params)
  } catch (e) {
    // 唯一索引 (company, normalized_title, location) 冲突：
    // 入库时 normalized_title 为 NULL（SQLite 中 NULL 互异），同公司同地同名岗被当成不同行；
    // 分析补填归一化 title 时撞上已存在的兄弟行。这里做"重复岗合并"而非失败。
    if (!String(e.message || '').includes('UNIQUE constraint')) throw e
    const sib = db.prepare(
      `SELECT id, status FROM jobs WHERE company = ? AND location = ? AND normalized_title = ? AND id <> ? LIMIT 1`
    ).get(row.company, row.location, norm, id)
    if (sib && sib.status === 'analyzed') {
      // 兄弟行已分析：把本行缺失的标量字段并过去，再删除本行（真正的重复岗，避免重复计数）
      db.prepare(
        `UPDATE jobs SET
           salary = COALESCE(salary, (SELECT salary FROM jobs WHERE id=@cur)),
           experience = COALESCE(experience, (SELECT experience FROM jobs WHERE id=@cur)),
           education = COALESCE(education, (SELECT education FROM jobs WHERE id=@cur)),
           extracted = COALESCE(extracted, (SELECT extracted FROM jobs WHERE id=@cur))
         WHERE id = @sib`
      ).run({ cur: id, sib: sib.id })
      db.prepare('DELETE FROM job_skills WHERE job_id = ?').run(id)
      db.prepare('DELETE FROM jobs WHERE id = ?').run(id)
      return true
    }
    // 兄弟行尚未分析：放弃归一化 title，保留本行抽取结果（下次兄弟分析时再归一）
    const fallbackParams = [
      extractedStr, coerce(meta.salary), coerce(meta.experience), coerce(meta.education),
      coerce(eduLevel), coerce(exp.level), normNum(exp.min), normNum(exp.max), normalizeRole(row.title) ?? null, status, id
    ]
    db.prepare(
      `UPDATE jobs SET
         extracted = ?,
         salary = COALESCE(NULLIF(?, ''), salary),
         experience = COALESCE(NULLIF(?, ''), experience),
         education = COALESCE(NULLIF(?, ''), education),
         education_level = COALESCE(NULLIF(?, ''), education_level),
         experience_level = COALESCE(NULLIF(?, ''), experience_level),
         exp_min = ?,
         exp_max = ?,
         role = COALESCE(NULLIF(?, ''), role),
         status = ?,
         last_seen = datetime('now')
       WHERE id = ?`
    ).run(...fallbackParams)
  }
  // 维护规范化技能子表（与 extracted 保持一致，先删后插）
  replaceJobSkills(db, id, extractedStr)
  return true
}

// 应用 merge map: { id: { extracted, salary?, experience?, education? } }
export function mergeExtractions(db, map) {
  let n = 0
  for (const [id, v] of Object.entries(map)) {
    if (saveExtraction(db, id, v.extracted, v)) n++
  }
  return n
}

// ── 策略 A：OpenAI 兼容 LLM 抽取 ──────────────────────────────────────────────
// 容忍本地/小模型常见的“不干净”输出：剥离 ``` 围栏、截取首个 {...} 对象、再 parse。
// 否则一旦模型在 JSON 外裹了说明文字或 markdown 围栏，JSON.parse 直接抛错、该行分析失败。
function parseLLMJson(content) {
  let s = String(content == null ? '' : content).trim()
  const fenceStart = s.indexOf('```')
  if (fenceStart !== -1) {
    const after = s.slice(fenceStart + 3)
    const fenceEnd = after.indexOf('```')
    if (fenceEnd !== -1) s = after.slice(0, fenceEnd).trim()
  }
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start !== -1 && end !== -1 && end > start) s = s.slice(start, end + 1)
  return JSON.parse(s)
}

export async function extractViaLLM(raw, { apiKey, baseURL, model, signal, jsonMode = true } = {}) {
  if (!apiKey) throw new Error('策略 A 需要 OPENAI_API_KEY（或未配置 OPENAI_BASE_URL/OPENAI_MODEL）')
  const base = baseURL || 'https://api.openai.com/v1'
  const m = model || 'gpt-4o-mini'
  const sys = `你是招聘 JD 结构化抽取引擎。从给定 JD 全文抽取以下字段，严格只返回 JSON（不要任何解释）：
{
  "salary": "薪资范围如 20-35K 或 面议，无则 null",
  "experience": "经验要求如 1年以上 / 3-5年，无则 null",
  "education": "学历要求如 本科及以上，无则 null",
  "hard_skills": { "前端框架/语言":[...], "AI工程化":[...], "工程化/基建":[...], "工具链":[...] },
  "soft_skills": ["沟通协作" 等软技能],
  "requirements": ["核心任职要求要点"],
  "bonuses": ["加分项"],
  "skill_levels": { "技能名": "必备|常见|稀缺" }
}
要求：
- hard_skills 四类固定，且每个技能必须是【单一、具体的工具/技术/框架/语言/能力名词】，不要写任务描述或短语。
- 禁止把多个技能用 "/" 合并（如写 "React/Vue" 应拆成两条 "React" 和 "Vue"）；禁止诸如 "广告片/特效/电商视频"、"短视频/小红书视觉"、"产品精修/人像精修" 这类任务描述充当技能。
- 优先使用业界标准命名：Photoshop 而非 PS，Adobe Illustrator 而非 AI，React 而非 react，TypeScript 而非 TS（除非 JD 原文确为缩写且为你所知）。
- skill_levels 的键必须与 hard_skills 中的技能名逐字一致，只列有明确重要性信号的技能。
- 不要编造 JD 中没有的信息。`
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    signal,
    body: JSON.stringify({
      model: m,
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      temperature: 0,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: `JD 全文：\n${cleanRaw(raw, 3000)}` }
      ]
    })
  })
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`)
  const data = await res.json()
  const content = data.choices?.[0]?.message?.content || '{}'
  return parseLLMJson(content)
}

// 带超时 + 限流退避重试（429/5xx/超时均可重试）
export async function extractViaLLMWithRetry(raw, opts, retries = 6) {
  let lastErr
  for (let i = 0; i < retries; i++) {
    const controller = new AbortController()
    const timeoutMs = parseInt(process.env.OPENAI_TIMEOUT_MS || '120000', 10)
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const ex = await extractViaLLM(raw, { ...opts, signal: controller.signal })
      clearTimeout(timer)
      return ex
    } catch (e) {
      clearTimeout(timer)
      lastErr = e
      const msg = e.message || ''
      const isRetryable = /429|500|502|503|504|timeout|aborted|AbortError/i.test(msg)
      if (!isRetryable) throw e
      const backoff = Math.min(60000, 1000 * 2 ** i)
      console.warn(`    ↻ 重试(${i + 1}/${retries}) ${msg.slice(0, 60)} 退避${backoff}ms`)
      await new Promise(r => setTimeout(r, backoff))
    }
  }
  throw lastErr
}

// 作用域过滤（方案 C：多角色/多城市）。scope = { role?, city? }。
// 返回 { where, and, params }：
//   where = "WHERE role = ? AND location = ?"（用于独立查询，如 aggregate 的 jobs 主查询）
//   and   = "AND role = ? AND location = ?"（用于追加到已有 WHERE 之后，如 salaryStats）
export function scopeFilter(scope) {
  const conds = []
  const params = []
  if (scope && scope.role) {
    conds.push('role = ?')
    params.push(scope.role)
  }
  if (scope && scope.city) {
    conds.push('location = ?')
    params.push(scope.city)
  }
  if (!conds.length) return { where: '', and: '', params: [] }
  const joined = conds.join(' AND ')
  return { where: 'WHERE ' + joined, and: 'AND ' + joined, params }
}

// ── 聚合：技能频率 / 缺口 / 优先级 + 薪资·经验分布（§4.1 / PRD Phase 2「12 维聚合」核心） ──
export function aggregate(db, targetRole = 'AI Agent 前端', scope = null) {
  const sf = scopeFilter(scope)
  const rows = db.prepare(`SELECT id, title, company, salary, experience, education, education_level, experience_level, status FROM jobs ${sf.where}`).all(...sf.params)
  const analyzed = rows.filter((r) => r.status === 'analyzed')
  // 技能频率从规范化子表 job_skills 直接 SQL 聚合（方案 B：替代 JSON-in-TEXT 重算）。
  // 注意 analyzed 已隐含 job_skills 仅含 analyzed 行，故这里直接以全表聚合。
  // 作用域：通过 job_id IN (SELECT id FROM jobs <scope>) 把技能聚合限定在 scope 内。
  // 关键：jf 必须是 WHERE 子句过滤，绝不能拼到 GROUP BY 后——
  // SQLite 会把 `GROUP BY skill, category AND job_id IN (...)` 解析成「多分一组表达式」，
  // 导致 subquery 被吞、scope 过滤失效。查询 3 已有 WHERE，直接 ${jf}；1/2 补 WHERE 1=1。
  const jf = sf.where ? ` AND job_id IN (SELECT id FROM jobs ${sf.where})` : ''
  const freq = {} // skill -> { count, levels:{}, categories:Set }
  for (const r of db.prepare(`SELECT skill, category FROM job_skills WHERE 1=1 ${jf} GROUP BY skill, category`).all(...sf.params)) {
    const f = (freq[r.skill] ||= { count: 0, levels: {}, categories: new Set() })
    if (r.category) f.categories.add(r.category)
  }
  for (const r of db.prepare(`SELECT skill, COUNT(DISTINCT job_id) AS jobs FROM job_skills WHERE 1=1 ${jf} GROUP BY skill`).all(...sf.params)) {
    const f = (freq[r.skill] ||= { count: 0, levels: {}, categories: new Set() })
    f.count = r.jobs
  }
  // 关键：必须 GROUP BY skill, level，否则这是「单聚合行」——无匹配行时 SQLite 仍返回
  // 1 行 (skill=null,level=null,jobs=0)，污染 freq；且有匹配时只把全局计数灌到某个任意技能，
  // 导致 levels 加权失效（priority 退化为纯频次排序）。
  for (const r of db.prepare(`SELECT skill, level, COUNT(DISTINCT job_id) AS jobs FROM job_skills WHERE level IS NOT NULL ${jf} GROUP BY skill, level`).all(...sf.params)) {
    const f = (freq[r.skill] ||= { count: 0, levels: {}, categories: new Set() })
    f.levels[r.level] = (f.levels[r.level] || 0) + r.jobs
  }
  const skillRank = Object.entries(freq)
    .map(([skill, v]) => ({ skill, count: v.count, categories: [...v.categories], levels: v.levels }))
    .sort((a, b) => b.count - a.count)

  const salaryDist = {}
  const expDist = {}
  const eduDist = {}
  for (const r of rows) {
    if (r.salary) salaryDist[r.salary] = (salaryDist[r.salary] || 0) + 1
    // 经验走规范层级（experience_level），缺失时回退即时归一；再经 bucketExperience 归并为互斥档，
    // 消除 "3年+ / 3年 / 3-5年" 等重叠桶（存量旧档也一并兜底）。
    const el = bucketExperience(r.experience_level || normalizeExperience(r.experience).level)
    if (el) expDist[el] = (expDist[el] || 0) + 1
    // 学历走规范层级（education_level），缺失时回退即时归一，保证 14 种写法合并为 2 层级
    const lvl = r.education_level || normalizeEducation(r.education)
    if (lvl) eduDist[lvl] = (eduDist[lvl] || 0) + 1
  }

  // 规范岗位排名：合并同义标题（前端开发工程师/前端工程师/web前端… → 前端工程师）。
  // role 列由 title 派生并落库，SQL 直出分布；缺失时即时归一兜底。
  const roleDist = db.prepare(
    "SELECT role, COUNT(*) AS c FROM jobs WHERE role IS NOT NULL AND role <> '' GROUP BY role ORDER BY c DESC"
  ).all().map((r) => ({ role: r.role, count: r.c }))
  if (roleDist.length === 0) {
    // 兜底：role 列尚未回填时，实时归一 title
    const m = {}
    for (const r of rows) {
      const role = normalizeRole(r.title)
      if (!role) continue
      m[role] = (m[role] || 0) + 1
    }
    roleDist.push(...Object.entries(m).map(([role, c]) => ({ role, count: c })).sort((a, b) => b.count - a.count))
  }

  // 优先级评分：出现频次 × 重要性权重（必备=3 / 常见=1 / 稀缺=2，取最高权重）
  const priority = skillRank
    .map((s) => {
      const lvlWeights = { 必备: 3, 常见: 1, 稀缺: 2, 加分: 0.5, 加分项: 0.5 }
      let w = 1
      for (const [lvl, c] of Object.entries(s.levels)) {
        const ww = lvlWeights[lvl] || 1
        if (ww > w) w = ww
      }
      return { skill: s.skill, score: s.count * w, count: s.count, topLevel: Object.entries(s.levels).sort((a, b) => (lvlWeights[b[0]] || 1) - (lvlWeights[a[0]] || 1))[0]?.[0] }
    })
    .sort((a, b) => b.score - a.score)

  return {
    targetRole,
    total: rows.length,
    analyzedCount: analyzed.length,
    pendingCount: rows.length - analyzed.length,
    skillRank,
    priority,
    salaryDist,
    expDist,
    eduDist,
    roleDist
  }
}

// 解析薪资字符串 → { minK, maxK }（统一折算为月薪 K/千元，便于混合统计与对比）。
// 支持 Boss 全形态：
//   "15-25K" / "8-12k"       → K，原值
//   "1-2万"                  → ×10 = 10-20K
//   "200-300元/天"           → 日薪，×21.75 工作日 ÷1000
//   "4000-6000" / "4000元/月" → 月薪元，÷1000
//   "面议" 等无法解析 → null
export function parseSalary(text) {
  if (!text) return null
  const t = String(text).trim()
  const range = t.match(/(\d+(?:\.\d+)?)\s*[-~到]\s*(\d+(?:\.\d+)?)(.*)$/)
  const single = !range ? t.match(/(\d+(?:\.\d+)?)(.*)$/) : null
  let a, b, tail
  if (range) {
    a = parseFloat(range[1])
    b = parseFloat(range[2])
    tail = range[3] || ''
  } else if (single) {
    a = b = parseFloat(single[1])
    tail = single[2] || ''
  } else {
    return null
  }
  const tl = tail.toLowerCase()
  let unit = 'K'
  let toK
  if (tl.includes('元/天') || /\/\s*天/.test(tl)) {
    toK = (x) => (x * 21.75) / 1000 // 日薪 → 月薪
    unit = '元/天'
  } else if (tl.includes('万')) {
    toK = (x) => x * 10 // 万 = 10K
    unit = '万'
  } else if (/[k]/.test(tl)) {
    toK = (x) => x
    unit = 'K'
  } else if (tl.includes('元')) {
    toK = (x) => x / 1000 // 含「元」按月薪元处理
    unit = '元/月'
  } else {
    toK = (x) => (x >= 1000 ? x / 1000 : x) // 无单位：大数当月薪元
    unit = 'K'
  }
  // 兜底：Boss 薪资区间恒为升序；若解码后意外出现降序（个别字体近似字形误判），翻转以保证统计正确
  if (a > b) {
    const t = a
    a = b
    b = t
  }
  return { minK: toK(a), maxK: toK(b), unit }
}

// 薪资分布统计：数值化后做分桶 + 中位数（单位 K）。无数据时返回 count:0。
// 方案 C：支持 scope = { role, city } 限定统计范围。
export function salaryStats(db, targetRole = 'AI Agent 前端', scope = null) {
  const sf = scopeFilter(scope)
  const rows = db.prepare(`SELECT salary FROM jobs WHERE salary IS NOT NULL AND salary <> '' ${sf.and}`).all(...sf.params)
  const pairs = []
  for (const r of rows) {
    const p = parseSalary(r.salary)
    if (p) pairs.push(p)
  }
  if (pairs.length === 0) return { count: rows.length, sampleSize: 0 }
  const sortMid = (a) => [...a].sort((x, y) => x - y)
  const median = (arr) => {
    const s = sortMid(arr)
    const mid = Math.floor(s.length / 2)
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
  }
  const buckets = [
    { label: '<10K', min: 0, max: 10 },
    { label: '10-15K', min: 10, max: 15 },
    { label: '15-20K', min: 15, max: 20 },
    { label: '20-30K', min: 20, max: 30 },
    { label: '30-50K', min: 30, max: 50 },
    { label: '50K+', min: 50, max: Infinity }
  ]
  const counts = buckets.map(() => 0)
  for (const p of pairs) {
    const mid = (p.minK + p.maxK) / 2
    let bi = buckets.findIndex((b) => mid >= b.min && mid < b.max)
    if (bi < 0) bi = buckets.length - 1
    counts[bi]++
  }
  const mins = pairs.map((p) => p.minK)
  const maxs = pairs.map((p) => p.maxK)
  const mids = pairs.map((p) => (p.minK + p.maxK) / 2)
  return {
    count: rows.length,
    sampleSize: pairs.length,
    medianMinK: Math.round(median(mins)),
    medianMaxK: Math.round(median(maxs)),
    medianMidK: Math.round(median(mids)),
    buckets: buckets.map((b, i) => ({ label: b.label, count: counts[i] }))
  }
}

// ── 后端分析增强（Phase 3 数据层，不依赖前端页面） ─────────────────────────────
// 跨分类去重：每个技能归到「主分类」（出现 job 数最多者；并列按 CATEGORY_PRECEDENCE）。
// 否则 AI 设计工具同时挂 AI工程化+工具链，会在两类里重复计数，虚高分类优先级。
const CATEGORY_PRECEDENCE = ['前端框架/语言', '工程化/基建', 'AI工程化', '工具链', 'soft']
export function buildPrimaryCategoryMap(db) {
  const rows = db.prepare(
    "SELECT skill, category, COUNT(DISTINCT job_id) AS jobs FROM job_skills WHERE category IS NOT NULL GROUP BY skill, category"
  ).all()
  const bySkill = new Map()
  for (const r of rows) {
    if (!bySkill.has(r.skill)) bySkill.set(r.skill, [])
    bySkill.get(r.skill).push({ category: r.category, jobs: r.jobs })
  }
  const map = new Map()
  for (const [skill, entries] of bySkill) {
    entries.sort((a, b) => b.jobs - a.jobs || (CATEGORY_PRECEDENCE.indexOf(a.category) - CATEGORY_PRECEDENCE.indexOf(b.category)))
    map.set(skill, entries[0].category)
  }
  return map
}

// 按 hard_skills 四类聚合「该投哪类」的优先级（totalCount + 必备加权）。每个技能只计入其主分类。
export function categoryPriority(skillRank, primaryCatMap) {
  const cats = {}
  for (const s of skillRank || []) {
    const required = (s.levels && s.levels['必备']) || 0
    const cat = (primaryCatMap && primaryCatMap.get(s.skill)) || (s.categories && s.categories[0]) || null
    if (!cat) continue
    if (!cats[cat]) cats[cat] = { category: cat, totalCount: 0, requiredCount: 0, skillCount: 0, skills: [] }
    cats[cat].totalCount += s.count
    cats[cat].requiredCount += required
    cats[cat].skillCount += 1
    if (!cats[cat].skills.includes(s.skill)) cats[cat].skills.push(s.skill)
  }
  return Object.values(cats)
    .map((c) => ({ ...c, weight: c.totalCount + c.requiredCount * 2 }))
    .sort((a, b) => b.weight - a.weight)
}

// 能力分层三档（「建议补哪三块」结构化字段）：必备底座 / 加分稀缺 / AI 编码工具。
// 集中在此派生，前端零拼装直接使用：base=前端框架/语言，premium=AI工程化+工程化/基建，tools=工具链。
// 每条带出现计数（从 skillRank 回查），premium 两类别合并后按计数降序，便于前端直接渲染。
export function deriveSkillTiers(categoryPriority, skillRank, topN = 8) {
  const countOf = new Map((skillRank || []).map((s) => [s.skill, s.count]))
  const byCat = (c) => {
    const cp = (categoryPriority || []).find((x) => x.category === c)
    return (cp?.skills || []).map((skill) => ({ skill, count: countOf.get(skill) || 0 }))
  }
  const base = byCat('前端框架/语言').slice(0, topN)
  const premium = [...byCat('AI工程化'), ...byCat('工程化/基建')]
    .sort((a, b) => b.count - a.count)
    .slice(0, topN)
  const tools = byCat('工具链').slice(0, topN)
  return { base, premium, tools }
}

// 生成有序学习路线：基础前端 → AI 工程化 → 视觉/工具链专精。每条带 reason。
export function learningPath(skillRank, priority = []) {
  const scoreMap = new Map(priority.map((p) => [p.skill, p]))
  const stageDefs = [
    { key: '基础前端', cats: ['前端框架/语言', '工程化/基建'], desc: '先打牢前端主栈与工程化底座，求职门槛能力' },
    { key: 'AI 工程化', cats: ['AI工程化'], desc: '切入目标岗「AI Agent 前端」的差异化能力' },
    { key: '视觉/工具链专精', cats: ['工具链'], desc: '补足设计与工具链，拉开与同岗竞争力' }
  ]
  const seen = new Set()
  return stageDefs
    .map((stage) => {
      const items = (skillRank || [])
        .filter((s) => (s.categories || []).some((c) => stage.cats.includes(c)))
        .filter((s) => !seen.has(s.skill)) // 去重：跨类技能只在首次命中的阶段出现
        .map((s) => {
          const p = scoreMap.get(s.skill)
          const required = (s.levels && s.levels['必备']) || 0
          return {
            skill: s.skill,
            count: s.count,
            required,
            score: p ? p.score : s.count,
            reason: `在 ${s.count} 个岗位出现${required ? `，其中 ${required} 个标为必备` : ''}`
          }
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 6)
      items.forEach((it) => seen.add(it.skill))
      return { stage: stage.key, desc: stage.desc, items }
    })
    .filter((stage) => stage.items.length > 0)
}

// 稳健解析 current_skills：库中存的是三层嵌套 "[ "[\"React\",...]" ]" 编码，
// 需递归拍平 + 对字符串元素尝试 JSON.parse，否则会把 React/Vue/TS 等真实技能漏判成缺口。
function flattenSkills(cur) {
  const deep = (x) => {
    if (Array.isArray(x)) return x.flatMap(deep)
    if (typeof x === 'string') {
      try {
        const p = JSON.parse(x)
        return Array.isArray(p) ? deep(p) : [x]
      } catch {
        return [x]
      }
    }
    return []
  }
  return deep(cur)
}

// 个人缺口：目标岗要求 vs 用户已掌握（user_profile.current_skills）。
// 守边界：user_profile 为空时只返回提示，不编造用户技能。
export function personalGap(userProfile, skillRank, priority = [], topN = 20, masteredSkills = new Set()) {
  const cur = userProfile && userProfile.current_skills ? userProfile.current_skills : null
  if (!cur) {
    return {
      hasBaseline: false,
      message: 'user_profile.current_skills 为空，个人缺口需先录入技能基线：在 user_profile 表填 current_skills（JSON 数组/对象），或 user_skill_mastery 表标记已掌握状态。',
      knownCount: 0,
      masteredCount: 0,
      totalHigh: priority.slice(0, topN).length,
      gaps: []
    }
  }
  const known = flattenSkills(cur)
  // 已知技能集也走同源归一（拆 / + 别名 + 基础形态），避免 persona 内 "JavaScript(ES6+)/ES6+" 漏匹规范的 "JavaScript"
  const knownSet = new Set()
  for (const s of known) {
    const str = String(s).trim().toLowerCase()
    if (str) knownSet.add(str)
    for (const n of splitAndNormalizeSkill(s)) knownSet.add(n.toLowerCase())
    knownSet.add(baseForm(s))
  }
  // 学习闭环（Phase3）：已掌握技能同样视为"已知"，从缺口移除，并计入进度
  for (const m of masteredSkills) knownSet.add(String(m).trim().toLowerCase())
  const topSlice = priority.slice(0, topN)
  const gaps = topSlice
    .filter((p) => !knownSet.has(p.skill.toLowerCase()) && !knownSet.has(baseForm(p.skill)))
    .map((p) => ({ skill: p.skill, score: p.score, count: p.count, topLevel: p.topLevel }))
  const masteredCount = topSlice.filter(
    (p) => masteredSkills.has(p.skill.toLowerCase()) || masteredSkills.has(baseForm(p.skill)),
  ).length
  return { hasBaseline: true, knownCount: knownSet.size, masteredCount, totalHigh: topSlice.length, gaps }
}

// 整合：aggregate + 三个增强，供 /api/analytics 与 CLI --insights 复用。
// 方案 C：scope = { role, city } 限定市场范围（看板切换"看哪个市场"）。
export function insights(db, targetRole = 'AI Agent 前端', scope = null) {
  const agg = aggregate(db, targetRole, scope)
  let up = null
  try {
    up = db.prepare("SELECT * FROM user_profile WHERE id='me'").get() || null
  } catch {
    up = null
  }
  const primaryCatMap = buildPrimaryCategoryMap(db)
  const cp = categoryPriority(agg.skillRank, primaryCatMap)
  // 学习闭环（§21）：从 user_skill_mastery 取"已掌握"技能集，并入 personalGap，
  // 使已标记掌握的技能从缺口移除，并计入学习进度（masteredCount）。
  // 仅 status='已掌握' 计入；'学习中' 仍属缺口（只是状态标记，UI 用来区分）。
  let masteredSet = new Set()
  try {
    const mrows = db.prepare("SELECT skill FROM user_skill_mastery WHERE status = '已掌握'").all()
    for (const r of mrows) masteredSet.add(String(r.skill).trim().toLowerCase())
  } catch {
    /* 表可能尚未创建，忽略 */
  }
  return {
    ...agg,
    categoryPriority: cp,
    learningPath: learningPath(agg.skillRank, agg.priority),
    personalGap: personalGap(up, agg.skillRank, agg.priority, 20, masteredSet),
    salary: salaryStats(db, targetRole, scope),
    skillTiers: deriveSkillTiers(cp, agg.skillRank),
  }
}

// ── 角色细报表（前端「细报表」页用） ───────────────────────────────────────────
// 复用 insights()（已含薪资中位/技能排名/优先级/学历经验分布/缺口路径），
// 再补报告特有而 insights 缺失的三项：薪资分位数、薪资置信分布、公司 TOP，
// 并从 skillRank 派生「按类别/按等级」分组，避免重复 SQL 聚合。
const SALARY_CONF_YELLOW = 0.85
const SALARY_CONF_RED = 0.7
export function roleDetail(db, targetRole = 'AI Agent 前端', scope = null) {
  const agg = insights(db, targetRole, scope)
  const sf = scopeFilter(scope)

  // 薪资分位数：基于每条薪资的下限 minK（与 /api/analytics 同口径）
  const salRows = db
    .prepare(`SELECT salary FROM jobs WHERE salary IS NOT NULL AND salary <> '' ${sf.and}`)
    .all(...sf.params)
  const mins = []
  for (const r of salRows) {
    const p = parseSalary(r.salary)
    if (p) mins.push(p.minK)
  }
  const pctOf = (arr, p) => {
    if (!arr.length) return null
    const s = [...arr].sort((a, b) => a - b)
    const idx = Math.min(s.length - 1, Math.round((p / 100) * (s.length - 1)))
    return s[idx]
  }

  // 薪资置信分布（salary_confidence 档）
  const confRows = db
    .prepare(`SELECT salary_confidence AS c FROM jobs WHERE salary_confidence IS NOT NULL ${sf.and}`)
    .all(...sf.params)
  let high = 0
  let yellow = 0
  let red = 0
  for (const r of confRows) {
    const c = Number(r.c)
    if (c >= SALARY_CONF_YELLOW) high++
    else if (c >= SALARY_CONF_RED) yellow++
    else red++
  }

  // 公司 TOP（数据质量甄别用）
  const companyTop = db
    .prepare(
      `SELECT company, COUNT(*) AS c FROM jobs WHERE company IS NOT NULL AND company <> '' ${sf.and} GROUP BY company ORDER BY c DESC LIMIT 12`
    )
    .all(...sf.params)
    .map((r) => ({ company: r.company, count: r.c }))

  // 技能按类别/等级分组 TOP（从 agg.skillRank 派生，主分类取 categories[0]）
  const byCategory = {}
  for (const s of agg.skillRank) {
    const cat = (s.categories && s.categories[0]) || '其他'
    ;(byCategory[cat] ||= []).push(s)
  }
  const skillByCategory = Object.fromEntries(
    Object.entries(byCategory).map(([k, v]) => [k, v.slice(0, 10)])
  )
  const skillByLevel = { 必备: [], 常见: [], 稀缺: [], 加分: [] }
  for (const s of agg.skillRank) {
    for (const [lvl, c] of Object.entries(s.levels || {})) {
      if (skillByLevel[lvl]) skillByLevel[lvl].push({ skill: s.skill, count: c })
    }
  }
  for (const k of Object.keys(skillByLevel)) {
    skillByLevel[k] = skillByLevel[k].sort((a, b) => b.count - a.count).slice(0, 10)
  }

  return {
    ...agg,
    salaryPercentiles: { p25: pctOf(mins, 25), p50: pctOf(mins, 50), p75: pctOf(mins, 75), p90: pctOf(mins, 90) },
    salaryConfidence: { high, yellow, red, null: 0, total: confRows.length },
    companyTop,
    skillByCategory,
    skillByLevel,
  }
}

// ── Persona 初始化（PRD §3 / §4.3：前端扎实、AI 从零） ─────────────────────────
// PRD 定义的目标用户画像：前端主栈扎实（React/Vue/TS/可视化/工程化），
// AI 侧真正从零起步（仅用过 AI 编码助手），目标岗 = AI Agent 前端。
// 「已掌握技能」刻意对齐到 jobs 库里真实出现的技能名（大小写归一后匹配），
// 这样 personalGap 能精确区分「已知」vs「缺口」，不靠模糊匹配编造用户能力。
export const PERSONA_FRONTEND_SOLID_AI_ZERO = {
  id: 'me',
  target_role: 'AI Agent 前端',
  current_skills: [
    // 前端主栈（数据中出现且 persona 扎实）
    'React', 'Vue', 'TypeScript', 'JavaScript', 'JavaScript(ES6+)', 'ES6+',
    'HTML5', 'CSS3', 'HTML/CSS', 'Node.js', 'Ajax', 'Git', 'Webpack', 'Echarts',
    // 工程化 / 基建
    '前端工程化', '前端工程化体系', '工程化能力', '模块化', '状态管理',
    '性能优化', '前端架构', '前端基础设施建设', '通用组件', '兼容性', 'CI/CD',
    'Ant Design', 'Umi Max', 'Taro', 'Vite/Webpack',
    // AI 编码助手（工具层用过，但不算 AI 工程化能力）
    'Cursor', 'Claude Code', 'GitHub Copilot', 'ChatGPT', 'Trae', 'Gemini', 'AI Coding'
  ],
  ai_exposure: {
    level: '仅用过 AI 编码助手',
    tools: ['GitHub Copilot', 'Cursor', 'ChatGPT'],
    note: '未参与过 AI 模型训练 / 推理服务 / Agent 工程化落地'
  },
  ai_engineering_gap: [
    'AI Agent 工程化（多轮对话 / 工具调用 / 流式响应）',
    'RAG / 检索增强生成',
    '大模型应用（LLM API 调用 / Prompt Engineering）',
    'ComfyUI / AI 视觉工作流',
    'Python / PyTorch 基础（看得懂能改）'
  ],
  note: 'PRD Persona：前端扎实（React/Vue/TS/可视化/工程化），AI 从零（仅用过 AI 编码助手）。目标岗 = AI Agent 前端。'
}

// 写入/覆盖 user_profile 单行（id='me'）。供 --init-profile 与初始化脚本复用。
export function initUserProfile(db, persona = PERSONA_FRONTEND_SOLID_AI_ZERO) {
  db.prepare(
    `INSERT INTO user_profile (id, target_role, current_skills, ai_exposure, ai_engineering_gap, note)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       target_role=excluded.target_role,
       current_skills=excluded.current_skills,
       ai_exposure=excluded.ai_exposure,
       ai_engineering_gap=excluded.ai_engineering_gap,
       note=excluded.note`
  ).run(
    persona.id,
    persona.target_role,
    JSON.stringify(persona.current_skills),
    JSON.stringify(persona.ai_exposure),
    JSON.stringify(persona.ai_engineering_gap),
    persona.note
  )
  return persona
}

// 技能去重（大小写归一，保留首次出现原写法），并限制数量，防脏数据撑爆列。
function dedupeSkills(arr) {
  const seen = new Set()
  const out = []
  for (const s of arr) {
    const str = String(s).trim()
    if (!str) continue
    const key = str.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(str)
  }
  return out.slice(0, 500)
}

// 兼容两种入参：数组直接用；JSON 字符串（GET 原样回传）解析为数组；否则单值/逗号拆分兜底。
function coerceStringArray(v) {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') {
    const s = v.trim()
    if (!s) return []
    try {
      const p = JSON.parse(s)
      if (Array.isArray(p)) return p
    } catch {
      /* 非 JSON，走下方兜底 */
    }
    if (s.includes(',')) return s.split(',').map((x) => x.trim())
    return [s]
  }
  return []
}

// JSON 字段入库：若已是字符串（来自 DB 原样），保持原样；否则序列化。
// 防止「DB 读出的字符串再 JSON.stringify 一次」导致双重编码。
function toStoredJson(v) {
  return typeof v === 'string' ? v : JSON.stringify(v ?? null)
}

// 编辑/保存 user_profile（id='me'）。供 PUT /api/profile 复用。
// 部分更新：未提供的字段保留现有值，避免前端漏传导致数据被清空。
export function saveProfile(db, patch) {
  const existing = getProfile(db) || { id: 'me' }
  const merged = { ...existing }

  if (patch.target_role !== undefined) {
    merged.target_role = String(patch.target_role).trim().slice(0, 120)
  }
  if (patch.current_skills !== undefined) {
    merged.current_skills = dedupeSkills(coerceStringArray(patch.current_skills))
  }
  if (
    patch.ai_exposure !== undefined &&
    patch.ai_exposure &&
    typeof patch.ai_exposure === 'object' &&
    !Array.isArray(patch.ai_exposure)
  ) {
    merged.ai_exposure = patch.ai_exposure
  } else if (patch.ai_exposure !== undefined && typeof patch.ai_exposure === 'string') {
    // 容忍 GET 返回的 JSON 字符串（前端未 parse 直接回传）
    try {
      const p = JSON.parse(patch.ai_exposure)
      if (p && typeof p === 'object' && !Array.isArray(p)) merged.ai_exposure = p
    } catch {
      /* 忽略非法字符串，保留原值 */
    }
  }
  if (patch.ai_engineering_gap !== undefined) {
    merged.ai_engineering_gap = coerceStringArray(patch.ai_engineering_gap)
      .map((x) => String(x).trim())
      .filter(Boolean)
      .slice(0, 200)
  }
  if (patch.note !== undefined) {
    merged.note = String(patch.note).slice(0, 1000)
  }

  db.prepare(
    `INSERT INTO user_profile (id, target_role, current_skills, ai_exposure, ai_engineering_gap, note)
     VALUES (@id,@target_role,@current_skills,@ai_exposure,@ai_engineering_gap,@note)
     ON CONFLICT(id) DO UPDATE SET
       target_role=excluded.target_role,
       current_skills=excluded.current_skills,
       ai_exposure=excluded.ai_exposure,
       ai_engineering_gap=excluded.ai_engineering_gap,
       note=excluded.note`
  ).run({
    id: 'me',
    target_role: merged.target_role || 'AI Agent 前端',
    current_skills: toStoredJson(merged.current_skills || []),
    ai_exposure: toStoredJson(merged.ai_exposure || {}),
    ai_engineering_gap: toStoredJson(merged.ai_engineering_gap || []),
    note: merged.note || ''
  })
  return merged
}

// 读取 user_profile（无表/无行时返回 null，不抛错）。
export function getProfile(db) {
  try {
    return db.prepare("SELECT * FROM user_profile WHERE id='me'").get() || null
  } catch {
    return null
  }
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  loadDotEnv()
  if (args.includes('--merge')) {
    const file = args[args.indexOf('--merge') + 1]
    const map = JSON.parse(readFileSync(file, 'utf-8'))
    const db = openDb()
    const n = mergeExtractions(db, map)
    console.log(`[analyze] 已合并 ${n} 条抽取结果 → status=analyzed`)
    db.close()
  } else if (args.includes('--insights')) {
    const db = openDb()
    const rep = insights(db)
    console.log(JSON.stringify(rep, null, 2))
    db.close()
  } else if (args.includes('--font-test')) {
    // 离线校验一个抓到的 Boss 加密字体：打印方法/映射数/样本解密/逐码点映射。
    const idx = args.indexOf('--font-test')
    const fontPath = args[idx + 1]
    if (!fontPath) {
      console.error('[analyze] --font-test 需要字体文件路径，例如：node src/analyze.js --font-test data/boss_salary_font.bin')
      process.exit(1)
    }
    const buf = readFileSync(fontPath)
    const dec = prepareDecoder(buf)
    console.log(`[font-test] 方法=${dec.method} 映射数=${dec.mapSize} 有参考字体=${dec.hasReference}`)
    const samplePath = join(dataDir, 'salary_sample.json')
    if (existsSync(samplePath)) {
      const s = JSON.parse(readFileSync(samplePath, 'utf-8'))
      if (s.encryptedSample) console.log(`[font-test] 样本解密：${s.encryptedSample} -> ${dec.decode(s.encryptedSample)}`)
    }
    console.log('[font-test] 映射（码点 -> 数字）：')
    const seen = new Set()
    let dup = 0
    for (const [cp, d] of dec.map.entries()) {
      if (seen.has(d)) dup++
      seen.add(d)
      console.log('  U+' + cp.toString(16).toUpperCase().padStart(4, '0') + ' -> ' + d)
    }
    const missing = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => !seen.has(d))
    console.log(`[font-test] 健全性：覆盖数字 ${seen.size}/10，缺失=[${missing.join(',')}]，重复=${dup}`)
    if (dup > 0) console.log('[font-test] ⚠️ 有数字被重复映射（同一数字对应多个 PUA 码点），映射可能不可靠，请回页面核对。')
    if (missing.length) console.log('[font-test] ℹ️ 缺失部分数字（该字体可能只用了子集，日薪/实习常见），不必然错误。')
  } else if (args.includes('--init-profile')) {
    // 按 PRD persona「前端扎实、AI 从零」初始化 user_profile，使 personalGap 出真实缺口。
    const db = openDb()
    const p = initUserProfile(db)
    console.log(`[analyze] 已初始化 user_profile(id='me')：target_role=${p.target_role}，已知技能 ${p.current_skills.length} 项`)
    db.close()
  } else if (args.includes('--migrate')) {
    // 方案 B 迁移：确保结构 + 增量回填；幂等，可重复运行。
    const db = openDb()
    ensureNormalizedSchema(db)
    const r = backfillNormalized(db)
    console.log(`[analyze] 迁移完成：假analyzed回退 ${r.fakeAnalyzedFixed} 行，education_level 补齐 ${r.eduBackfilled} 行，experience 补齐 ${r.expBackfilled} 行，job_skills 补齐 ${r.skillsBackfilled} 行，置信度归一 ${r.confidenceNormalized} 行，薪资清洗 ${r.salaryCleaned} 行`)
    db.close()
  } else if (args.includes('--repair')) {
    // 存量污染修复：解析-title blob、纠正 company='查看全部' 的 152 行。启发式，先预览样本、真库执行前建议备份。
    const db = openDb()
    ensureNormalizedSchema(db)
    const rep = repairPollutedRows(db)
    console.log(`[analyze] 污染修复：目标 ${rep.total} 行，已修复 ${rep.fixed} 行，跳过(唯一冲突) ${rep.skipped} 行`)
    if (rep.samples.length) {
      console.log('  样本预览（before 截断 / after 标题 / after 公司）：')
      for (const s of rep.samples) console.log(`   - ${s.before}…  =>  [${s.afterTitle}] @ ${s.afterCompany}`)
    }
    if (args.includes('--dedup')) {
      const dd = dedupPollutedRows(db)
      console.log(`[analyze] 去重删除：移除 ${dd.removed} 个重复污染行（均有干净孪生副本），保留 ${dd.kept} 行`)
    }
    db.close()
  } else if (args.includes('--rebuild-skills')) {
    // 同义词表变更后全量重建 job_skills（让归一规则立即生效）
    const db = openDb()
    ensureNormalizedSchema(db)
    const n = rebuildJobSkills(db)
    console.log(`[analyze] job_skills 已全量重建：${n} 条 analyzed 技能重算`)
    db.close()
  } else if (args.includes('--rebuild-role')) {
    // 角色归一词表变更后全量重建 role（让同义标题合并规则立即生效）
    const db = openDb()
    ensureNormalizedSchema(db)
    const n = rebuildRole(db)
    console.log(`[analyze] role 已全量重建：${n} 条岗位重算规范岗位名`)
    db.close()
  } else if (args.includes('--analyze-all')) {
    // 策略 A：循环未分析的行调 LLM（需 OPENAI_API_KEY）
    const apiKey = process.env.OPENAI_API_KEY
    const baseURL = process.env.OPENAI_BASE_URL
    const model = process.env.OPENAI_MODEL
    const jsonMode = process.env.OPENAI_JSON_MODE !== 'false' // 本地推理服务不支持 json_object 时设 OPENAI_JSON_MODE=false
    const roleIdx = args.indexOf('--role')
    const roleFilter = roleIdx !== -1 ? args[roleIdx + 1] : null
    const limitIdx = args.indexOf('--limit')
    const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : null
    const db = openDb()
    const params = []
    let pendingSql = "SELECT id, raw FROM jobs WHERE (status='collected' OR extracted IS NULL OR extracted='') AND raw IS NOT NULL AND raw<>''"
    if (roleFilter) { pendingSql += ' AND role = ?'; params.push(roleFilter) }
    if (limit && !isNaN(limit) && limit > 0) { pendingSql += ' LIMIT ?'; params.push(limit) }
    const pending = db.prepare(pendingSql).all(...params)
    console.log(`[analyze] 策略 A：待分析 ${pending.length} 条${roleFilter ? `（role=${roleFilter}）` : ''}；模型=${model || 'gpt-4o-mini'}`)
    let ok = 0, fail = 0
    const CONCURRENCY = parseInt(process.env.OPENAI_CONCURRENCY || '3', 10)
    const REQ_DELAY = parseInt(process.env.REQUEST_DELAY_MS || '0', 10)
    // 自适应退避：遇限流(429/RPM)自动拉长请求间隔，通畅后缓慢回落，
    // 避免智谱低配账户 RPM 下疯狂重试撞墙（crawler pipeline 默认 REQ_DELAY=6000，仍不够时靠此兜底）。
    let dynDelay = REQ_DELAY
    const MAX_DELAY = parseInt(process.env.OPENAI_MAX_DELAY_MS || '60000', 10)
    const isRateLimited = (msg) => /429|rate.?limit|您的账户已达到速率|too many requests|aborted/i.test(msg || '')
    for (let i = 0; i < pending.length; i += CONCURRENCY) {
      const batch = pending.slice(i, i + CONCURRENCY)
      const results = await Promise.all(batch.map(async (r) => {
        try {
          if (dynDelay > 0) await new Promise(rs => setTimeout(rs, dynDelay))
          const ex = await extractViaLLMWithRetry(r.raw, { apiKey, baseURL, model, jsonMode })
          saveExtraction(db, r.id, ex, { salary: ex.salary, experience: ex.experience, education: ex.education })
          // 成功：限流压力缓解，间隔缓慢回落（每次减 3s，回到底线 REQ_DELAY）
          if (dynDelay > REQ_DELAY) dynDelay = Math.max(REQ_DELAY, dynDelay - 3000)
          return { id: r.id, ok: true }
        } catch (e) {
          const msg = (e && e.message) || ''
          if (isRateLimited(msg)) {
            // 翻倍退避（封顶 MAX_DELAY），下次请求间隔自动拉长
            dynDelay = Math.min(MAX_DELAY, Math.max(dynDelay, REQ_DELAY || 1000) * 2)
            console.warn(`    ⚠ 检测到限流，动态请求间隔提至 ${dynDelay}ms`)
          }
          return { id: r.id, ok: false, msg }
        }
      }))
      for (const res of results) {
        if (res.ok) { ok++; console.log(`  ✓ ${res.id}`) }
        else { fail++; console.warn(`  ✗ ${res.id}: ${res.msg}`) }
      }
      if (i + CONCURRENCY < pending.length) await new Promise(r => setTimeout(r, 800))
    }
    console.log(`[analyze] 策略 A 完成：成功 ${ok} / 失败 ${fail} / 共 ${pending.length}`)
    db.close()
  } else {
    const db = openDb()
    const rep = aggregate(db)
    console.log(JSON.stringify(rep, null, 2))
    db.close()
  }
}
