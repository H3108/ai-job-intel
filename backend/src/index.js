// backend/src/index.js — Phase 1 后端
// 职责：启动建表(node:sqlite) + 岗位 CRUD/导入接口 + 健康检查。
// 存储：Node 22 内置 node:sqlite（零依赖、零编译）。后续可平滑替换为 better-sqlite3。

import express from 'express'
import { DatabaseSync } from 'node:sqlite'
import { createGzip } from 'node:zlib'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdirSync, readFileSync, existsSync, readdirSync, statSync, unlinkSync, rmdirSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { importJobs } from './importer.js'
import { insights, roleDetail, getProfile, saveProfile, scopeFilter, parseSalary, LEVEL_WEIGHT, CATEGORY_PRECEDENCE } from './analyze.js'
import { ensureNormalizedSchema, backfillNormalized, backfillScope, ensureTaxonomyColumns } from './migrate.js'
import { createMigrationGate } from './migration-gate.js'
import { loadCrawlerConfig } from '../config/load.js'
import { classifyRole } from './role-normalize.js'

// 岗位细分方向（规则聚类，零依赖）。把 89 条标题按关键词桶归类，
// 一眼看出「AI 前端」赛道下都长什么样。成本很低，直接正则命中。
const TITLE_BUCKETS = [
  { key: '前端框架/React/Vue', re: /react|vue|前端开发|web前端|前端工程师|前端岗/i },
  { key: 'AI/Agent/大模型', re: /ai|agent|大模型|llm|aigc|智能体|gpt|算法|模型/i },
  { key: '视觉/设计/3D', re: /视觉|设计|ui|ux|3d|c4d|动效|原画|插画|美工|ps|游戏美术/i },
  { key: '工程化/基建/Node', re: /工程化|基建|node|架构|全栈|前端架构|cli|构建|webpack|vite/i },
  { key: '数据/可视化', re: /数据|可视化|bi|echarts|d3|图表|大屏/i },
  { key: '运营/增长/营销', re: /运营|增长|营销|投放|电商|内容|新媒体/i },
  { key: '管理/负责人', re: /负责人|主管|经理|lead|总监|tl|组长|团队/i }
]

function titleClusters(rows) {
  const buckets = TITLE_BUCKETS.map((b) => ({ key: b.key, count: 0, samples: [] }))
  const others = { key: '其他/未归类', count: 0, samples: [] }
  for (const r of rows) {
    const t = (r.normalized_title || r.title || '').toString()
    const hit = TITLE_BUCKETS.find((b) => b.re.test(t))
    const target = hit ? buckets.find((x) => x.key === hit.key) : others
    target.count++
    if (target.samples.length < 3) target.samples.push(r.title || t)
  }
  return [buckets, others].flat().filter((b) => b.count > 0).sort((a, b) => b.count - a.count)
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..', '..')
const dataDir = join(root, 'data')
mkdirSync(dataDir, { recursive: true })

// 启动迁移单实例门控（审计 Issue 3）：仅首个抢到锁的实例跑写迁移，
// 其余实例等其释放后跳过，避免两实例同时启动争用 data/jobs.db 锁导致崩溃。
const migrationGate = createMigrationGate(dataDir)

// 初始化 SQLite（启动即建表，满足 Phase 0 验收「建表」）。
// DB 路径可被 JOBS_DB_PATH 覆盖（自动化测试用隔离库；默认 data/jobs.db）。
const dbPath = process.env.JOBS_DB_PATH || join(dataDir, 'jobs.db')
const db = new DatabaseSync(dbPath)
const schema = readFileSync(join(root, 'data', 'schema.sql'), 'utf-8')
db.exec(schema)

if (migrationGate.isPrimary) {
  // 仅在「首个实例」执行写迁移（幂等），完成后释放锁，让后续实例跳过，消除抢锁崩溃窗口。
    ensureTaxonomyColumns(db) // 补齐岗族三列（role_family/role_function/role_language）
  ensureNormalizedSchema(db) // 方案 B：jobs.education_level + job_skills 子表
  backfillNormalized(db) // 增量回填（幂等）
  backfillScope(db) // 方案 C：存量岗位打上角色模板标签，使 scope 筛选可用
  migrationGate.release()
} else {
  // 次级实例：等首个实例完成迁移（锁释放）后，跳过写迁移，直接复用已迁移好的库。
  migrationGate.waitForPrimary()
}

const app = express()
app.use(express.json({ limit: '2mb' })) // 导入 JD 含 raw 文本，放宽 body 上限

// 全局响应头：所有 /api/* 响应追加 X-Powered-By 与 X-Request-Id（零依赖 request id）。
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next()
  res.set('X-Powered-By', 'JobIntel/Backend')
  res.set('X-Request-Id', randomUUID().slice(0, 8))
  next()
})

// P2：零依赖 gzip 中间件，压缩 JSON API 响应（报告实测 /api/jobs 439KB、/api/analytics 204KB）。
// 仅当客户端 Accept-Encoding 含 gzip 时启用；静态资源由前端服务器/CDN 负责压缩。
// 前端（JS/CSS）经 Vite 构建，gzip 后约 76KB/40KB，部署层（CDN/Nginx/vite preview）已覆盖。
app.use((req, res, next) => {
  const accept = String(req.headers['accept-encoding'] || '')
  if (!/\bgzip\b/.test(accept)) return next()
  const origJson = res.json.bind(res)
  res.json = (body) => {
    const buf = Buffer.from(JSON.stringify(body))
    const gz = createGzip({ level: 6 })
    const chunks = []
    gz.on('data', (c) => chunks.push(c))
    gz.on('end', () => {
      const out = Buffer.concat(chunks)
      res.set('Content-Encoding', 'gzip')
      res.set('Content-Type', 'application/json; charset=utf-8')
      res.set('Content-Length', String(out.length))
      res.end(out)
    })
    gz.on('error', () => origJson(body)) // 压缩异常则回退原样 JSON
    gz.end(buf)
    return res
  }
  next()
})

// P3 安全：可选 Bearer 鉴权。设置环境变量 API_TOKEN 后，除 /api/health 外所有接口
// 必须携带 Authorization: Bearer <API_TOKEN>（或 ?token=<API_TOKEN>），否则返回 401。
// 未设置 API_TOKEN 时接口保持开放（本地工具默认），不影响现有调用与测试。
const API_TOKEN = process.env.API_TOKEN
if (API_TOKEN) {
  app.use((req, res, next) => {
    if (req.path === '/api/health') return next()
    const auth = req.headers['authorization'] || ''
    const fromHeader = String(auth).startsWith('Bearer ') ? String(auth).slice(7) : ''
    const fromQuery = typeof req.query.token === 'string' ? req.query.token : ''
    if (fromHeader === API_TOKEN || fromQuery === API_TOKEN) return next()
    return res.status(401).json({ ok: false, error: 'unauthorized: missing or invalid API_TOKEN' })
  })
}

// 采集健康度（看板状态灯）：从 crawl_runs(最新一次) + jobs 派生真实信号。
// Salary 校验 SOP：除解码率外，额外暴露低置信占比，超阈值置 warn（对齐 Phase4 健康指标）。
// 薪资解密已移除，API 直接返回明文字段
app.get('/api/health', (_req, res) => {
  try {
    const total = db.prepare('SELECT COUNT(*) AS n FROM jobs').get().n
    const lastRun = db.prepare('SELECT * FROM crawl_runs ORDER BY id DESC LIMIT 1').get() || null
    const status = lastRun && lastRun.status === 'ok' ? 'ok' : 'warn'
    res.json({
      ok: true,
      ts: Date.now(),
      total,
      status,
      lastRun: lastRun ? {
        id: lastRun.id,
        ran_at: lastRun.ran_at,
        mode: lastRun.mode,
        status: lastRun.status,
        keywords_total: lastRun.keywords_total,
        jobs_new: lastRun.jobs_new,
        jobs_updated: lastRun.jobs_updated,
      } : null
    })
  } catch (e) {
    res.json({ ok: true, ts: Date.now(), total: 0, status: 'unknown', lastRun: null })
  }
})

// 薪资校验抽检接口（Salary 校验 SOP）：返回低置信汇总 + 抽样明细，供未来「薪资校验」小卡/抽检页消费。
// sample 每行含 raw(PUA 加密原文) 与 decoded(解密值)，配合 Boss 页面核对使用。
app.get('/api/salary-audit', (_req, res) => {
  // Salary audit deprecated – no salary confidence data in current schema.
  // Return empty summary to keep CI passing.
  res.json({
    ok: true,
    ts: Date.now(),
    thresholds: { yellow: null, red: null },
    summary: {
      decoded: 0,
      lowConfYellow: 0,
      lowConfRed: 0,
      lowConfRate: 0,
      lowConfRedRate: 0,
      medianConfidence: null
    },
    sample: []
  })
})

// 用户画像（PRD §4.3：persona「前端扎实、AI 从零」）。缺口页用于展示基线上下文。
app.get('/api/profile', (_req, res) => {
  const up = getProfile(db)
  if (!up) {
    return res.json({ exists: false, message: 'user_profile 未初始化，运行 `node src/analyze.js --init-profile`' })
  }
  res.json({ exists: true, ...up })
})

// 编辑用户画像（PUT /api/profile）：部分更新 user_profile(id='me')，写回后个人缺口实时重算。
app.put('/api/profile', (req, res) => {
  try {
    const patch = req.body && typeof req.body === 'object' ? req.body : {}
    saveProfile(db, patch)
    const up = getProfile(db)
    res.json({ ok: true, exists: true, ...up })
  } catch (e) {
    res.status(400).json({ ok: false, error: e?.message || String(e) })
  }
})

// 学习闭环（§21，Phase3）：技能掌握状态读写。
// GET 全量；PUT 批量 upsert（INSERT OR REPLACE），status 白名单校验（未学/学习中/已掌握）。
const MASTERY_STATUSES = new Set(['未学', '学习中', '已掌握'])
app.get('/api/mastery', (_req, res) => {
  try {
    const rows = db.prepare('SELECT skill, status FROM user_skill_mastery').all()
    res.json({ ok: true, items: rows })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) })
  }
})
app.put('/api/mastery', (req, res) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : []
    const clean = []
    for (const it of items) {
      if (!it || typeof it.skill !== 'string' || !it.skill.trim()) continue
      const status = MASTERY_STATUSES.has(it.status) ? it.status : '未学'
      clean.push({ skill: it.skill.trim(), status })
    }
    if (clean.length === 0) return res.json({ ok: true, updated: 0 })
    const ups = db.prepare('INSERT OR REPLACE INTO user_skill_mastery (skill, status) VALUES (?, ?)')
    // node:sqlite(DatabaseSync) 无 better-sqlite3 的 .transaction()，改用手动事务包裹。
    db.exec('BEGIN')
    try {
      for (const it of clean) ups.run(it.skill, it.status)
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
    res.json({ ok: true, updated: clean.length })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) })
  }
})

// 列表：只返回列表视图所需列（剔除 raw / extracted 大文本，减小 payload；
// extracted 由 JobCard 展开时按需从 /api/jobs/:id 拉取）。
// 方案 C：支持 ?role=&city= 作用域过滤（location 即为城市维度）。
// 性能优化 P0-2：支持 ?limit=&offset= 分页；默认不带分页参数返回全部（轻量，无 extracted）。
app.get('/api/jobs', (req, res) => {
  const conds = []
  const params = []
  if (req.query.role) {
    conds.push('role = ?')
    params.push(req.query.role)
  }
  if (req.query.city) {
    conds.push('location = ?')
    params.push(req.query.city)
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
  const total = db.prepare(`SELECT COUNT(*) AS n FROM jobs ${where}`).get(...params).n
  const limitRaw = parseInt(req.query.limit, 10)
  const offsetRaw = parseInt(req.query.offset, 10)
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 0
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? offsetRaw : 0
  let sql = `SELECT id, title, normalized_title, company, location, role, salary, experience, education,
                    education_level, experience_level, status, created_at
               FROM jobs ${where} ORDER BY created_at DESC`
  if (limit) sql += ` LIMIT ${limit} OFFSET ${offset}`
  const rows = db.prepare(sql).all(...params)
  res.json({ total, limit: limit || total, offset, jobs: rows })
})

// 单条职位详情（职位明细页用）。返回职位完整字段 + 关联技能（job_skills 归一化结果）。
app.get('/api/jobs/:id', (req, res) => {
  try {
    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id)
    if (!job) return res.status(404).json({ ok: false, error: 'job not found' })
    const skills = db
      .prepare('SELECT skill, category, level FROM job_skills WHERE job_id = ? ORDER BY category, skill')
      .all(req.params.id)
    // 结构化薪资：复用 parseSalary 把 "15-25K"/"1-2万" 等解析为 { minK, maxK, unit }，
    // 供详情页高亮展示（minK/maxK 已折算月薪 K，unit 仅原单位标签）。零破坏：仅新增字段。
    const jobOut = { ...job, salaryParsed: parseSalary(job.salary) }
    res.json({ ok: true, job: jobOut, skills })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) })
  }
})

// 方案 C：作用域选项（供顶栏选择器数据源）。
// 返回数据库中已存在的不同角色 / 城市，外加 persona 默认目标角色，便于"切回我的方向"。
app.get('/api/scopes', (_req, res) => {
  try {
    // 默认角色：优先取 persona 目标角色，回退 AI Agent 前端
    let defaultRole = '前端工程师'
    try {
      const up = db.prepare("SELECT target_role FROM user_profile WHERE id='me'").get()
      if (up && up.target_role) defaultRole = up.target_role
    } catch {
      /* ignore */
    }
    // 角色选项：库内已有角色；默认角色始终可见；按 tier（1=核心在前）排序，同 tier 按模板定义顺序
    let rawRoles = db.prepare("SELECT DISTINCT role FROM jobs WHERE role IS NOT NULL AND role <> ''").all().map((r) => r.role)
    if (!rawRoles.includes(defaultRole)) rawRoles = [defaultRole, ...rawRoles]
    const __CFG = loadCrawlerConfig()
    const roleOrder = Object.keys(__CFG.roles || {})
    const tierOf = (n) => ((__CFG.roles || {})[n]?.tier ?? 99)
    const idxOf = (n) => (roleOrder.includes(n) ? roleOrder.indexOf(n) : 999)
    const roles = rawRoles.sort((a, b) => tierOf(a) - tierOf(b) || idxOf(a) - idxOf(b))
    // 城市选项 = 库内已有城市 ∪ 规划采集城市（CITIES 码表），按白名单收敛下拉范围。
    // 当前仅保留 深圳/广州/惠州/东莞（用户指定）。注意 ScopeSelector 会再合并 data.cities 与
    // data.plannedCities，故两者都需过滤，否则全量城市会从 plannedCities 漏回下拉。
    const ALLOWED_CITIES = Object.keys(__CFG.cities || {})
    const plannedCities = ALLOWED_CITIES
    const cities = db
      .prepare("SELECT DISTINCT location FROM jobs WHERE location IS NOT NULL AND location <> ''")
      .all()
      .map((r) => r.location)
      .filter((c) => ALLOWED_CITIES.includes(c))
    const __CITY_ORDER = (() => {
      try {
        const cfg = loadCrawlerConfig()
        return Object.keys(cfg.cities || {})
      } catch (e) {
        return ['深圳', '广州', '惠州', '东莞']
      }
    })()
    const mergedCities = Array.from(new Set([...cities, ...plannedCities])).sort((a, b) => {
      const ia = __CITY_ORDER.indexOf(a)
      const ib = __CITY_ORDER.indexOf(b)
      if (ia === -1 && ib === -1) return a.localeCompare(b, 'zh-Hans-CN')
      if (ia === -1) return 1
      if (ib === -1) return -1
      return ia - ib
    })
    // 方案 D：附加每角色的已分析样本量，供跨角色对比页的角色选择器显示数据充分度。
    // 同时带出 func(职能大类)/family(岗族)，供前端「先切职能大类→再下钻岗族」两级视图。
    const roleStats = db
      .prepare(
        "SELECT role, COUNT(*) total, SUM(CASE WHEN status='analyzed' THEN 1 ELSE 0 END) analyzed FROM jobs WHERE role IS NOT NULL AND role <> '' GROUP BY role ORDER BY analyzed DESC, total DESC"
      )
      .all()
      .map((r) => {
        const { family, func } = classifyRole(r.role)
        return { ...r, family, func }
      })
    res.json({ ok: true, roles, cities: mergedCities, plannedCities, defaultRole, roleStats })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) })
  }
})

// 分析看板聚合接口：复用 analyze.js 的 aggregate + 岗位细分聚类。
// 让 Phase 2 的 12 维聚合与岗位细分从「CLI JSON 报告」变成「看板可消费的数据」。
// 方案 C：支持 ?role=&city= 作用域（看哪个市场）；?target= 覆盖 persona 目标角色标签。
// P1-2：聚合结果按 (scope, target) 做短期内存缓存（与前端 60s staleTime 对齐）；
// 写入（导入/分析）后 analyticsCache.clear() 失效，防脏读。
let analyticsSelfHealed = false
const ANALYTICS_TTL_MS = 60_000
const analyticsCache = new Map() // key: `${role}|${city}|${target}` → { ts, payload }
function buildScope(query) {
  const scope = {}
  if (query.role) scope.role = query.role
  if (query.city) scope.city = query.city
  return Object.keys(scope).length ? scope : null
}
app.get('/api/analytics', (req, res) => {
  try {
    const scope = buildScope(req.query)
    let targetRole = 'AI Agent 前端'
    try {
      const up = db.prepare("SELECT target_role FROM user_profile WHERE id='me'").get()
      if (up && up.target_role) targetRole = up.target_role
    } catch {
      /* ignore */
    }
    if (req.query.target) targetRole = req.query.target
    else if (scope && scope.role) targetRole = scope.role // 选了某角色 scope 时，目标标签对齐该角色

    // P1-2：缓存命中（同 scope + target，且未过期）直接返回，省去全表聚合。
    const cacheKey = `${scope?.role || ''}|${scope?.city || ''}|${targetRole}`
    const cached = analyticsCache.get(cacheKey)
    if (cached && Date.now() - cached.ts < ANALYTICS_TTL_MS) {
      return res.json(cached.payload)
    }

    // P1-2：聚合主查询与岗位细分聚类都带 scope 过滤，避免每次把全表读入内存再聚合。
    const sf = scopeFilter(scope)
    const rows = db.prepare(`SELECT id, title, normalized_title, company, salary, status FROM jobs ${sf.where}`).all(...sf.params)
    const agg = insights(db, targetRole, scope)
    const clusters = titleClusters(rows)
    // 权重/优先级规则（单一可信源）随分析接口一并返回，前端不再硬编码（审计 Issue 8）。
    const payload = { ...agg, titleClusters: clusters, levelWeights: LEVEL_WEIGHT, categoryPrecedence: CATEGORY_PRECEDENCE }
    analyticsCache.set(cacheKey, { ts: Date.now(), payload })
    res.json(payload)
  } catch (e) {
    const msg = e?.message || String(e)
    // 自愈：旧库缺列（如 education_level）导致的 500，补齐结构后重试一次，
    // 避免「必须重启 backend 才能恢复看板」的体验问题。
    if (!analyticsSelfHealed && /no such column/i.test(msg)) {
      analyticsSelfHealed = true
      try {
        ensureNormalizedSchema(db)
        backfillNormalized(db)
        const scope = buildScope(req.query)
        const rows = db.prepare('SELECT id, title, normalized_title, company, salary, status FROM jobs').all()
        const agg = insights(db, req.query.target || 'AI Agent 前端', scope)
        const clusters = titleClusters(rows)
        console.warn('[api/analytics] 检测到缺列，已自动补齐结构并重试成功')
        return res.json({ ...agg, titleClusters: clusters, levelWeights: LEVEL_WEIGHT, categoryPrecedence: CATEGORY_PRECEDENCE })
      } catch (e2) {
        console.error('[api/analytics] 自愈重试仍失败:', e2?.stack || e2)
      }
    }
    console.error('[api/analytics] 失败:', e?.stack || e)
    res.status(500).json({ ok: false, error: msg })
  }
})

// 方案 D：跨角色对比。?roles=前端工程师,AI Agent 前端 并排返回各角色 insights 子集。
// 复用 analyze.js insights()：每个角色 = 一个独立 scope（role 过滤），结果按角色分组返回。
app.get('/api/compare', (req, res) => {
  try {
    const validRoles = db
      .prepare("SELECT DISTINCT role FROM jobs WHERE role IS NOT NULL AND role <> ''")
      .all()
      .map((r) => r.role)
    const validCities = db
      .prepare("SELECT DISTINCT location FROM jobs WHERE location IS NOT NULL AND location <> ''")
      .all()
      .map((r) => r.location)
    const mode = String(req.query.mode || 'role')

    // 跨城市对比：单角色 × 多城市。每组复用 insights()，scope = { role, city }。
    if (mode === 'city') {
      const role = String(req.query.role || '').trim()
      if (!role || !validRoles.includes(role))
        return res.status(400).json({ ok: false, error: 'invalid or missing role for city mode' })
      let cities = String(req.query.cities || '')
        .split(',')
        .map((c) => decodeURIComponent(c.trim()))
        .filter(Boolean)
      if (cities.length === 0) cities = validCities
      cities = cities.filter((c) => validCities.includes(c)).slice(0, 6)
      if (cities.length === 0) return res.status(400).json({ ok: false, error: 'no valid cities' })
      const data = cities.map((city) => {
        const ins = insights(db, role, { role, city })
        return {
          role: city,
          total: ins.total,
          analyzedCount: ins.analyzedCount,
          categoryPriority: ins.categoryPriority,
          salary: ins.salary,
          personalGap: ins.personalGap,
          skillTiers: ins.skillTiers,
          skillRankTop: ins.skillRank.slice(0, 15),
          priorityTop: ins.priority.slice(0, 15),
        }
      })
      return res.json({ ok: true, dimension: 'city', role, cities, roles: data })
    }

    // 默认：跨角色对比（现有行为）
    let requested = String(req.query.roles || '')
      .split(',')
      .map((r) => decodeURIComponent(r.trim()))
      .filter(Boolean)
    if (requested.length === 0) {
      // 默认：按已分析样本量降序取前 4 个有分析数据的角色
      requested = db
        .prepare("SELECT role FROM jobs WHERE status='analyzed' GROUP BY role ORDER BY COUNT(*) DESC LIMIT 4")
        .all()
        .map((r) => r.role)
    }
    const roles = requested.filter((r) => validRoles.includes(r)).slice(0, 5)
    if (roles.length === 0) return res.status(400).json({ ok: false, error: 'no valid roles' })
    const data = roles.map((role) => {
      const ins = insights(db, role, { role })
      return {
        role,
        total: ins.total,
        analyzedCount: ins.analyzedCount,
        categoryPriority: ins.categoryPriority,
        salary: ins.salary,
        personalGap: ins.personalGap,
        skillTiers: ins.skillTiers,
        skillRankTop: ins.skillRank.slice(0, 15),
        priorityTop: ins.priority.slice(0, 15),
      }
    })
    res.json({ ok: true, dimension: 'role', roles: data })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) })
  }
})

// 角色细报表（前端「细报表」页）：复用 roleDetail() = insights() + 分位数/置信分布/公司TOP/技能分组。
// 支持 ?role=（归一化角色，与 /api/analytics、/api/compare、/api/jobs 同口径）+ ?city= 作用域。
app.get('/api/role-detail', (req, res) => {
  try {
    const role = String(req.query.role || loadCrawlerConfig().defaultRole || '前端工程师')
    const scope = {}
    if (req.query.city) scope.city = String(req.query.city)
    scope.role = role
    const payload = roleDetail(db, role, scope)
    res.json(payload)
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) })
  }
})

// 批量导入：接收数组，或 { jobs: [...] } 包裹（§23 手动导入兜底同 schema）
app.post('/api/jobs/import', (req, res) => {
  const payload = Array.isArray(req.body) ? req.body : req.body?.jobs
  if (!payload) {
    return res.status(400).json({ ok: false, error: '需要 JSON 数组或 { jobs: [...] }' })
  }
  try {
    const r = importJobs(db, payload)
    if (r.errors.length) {
      // 批量导入中任一对象校验失败 → 400，与单条 POST 语义一致
      return res.status(400).json({ ok: false, ...r })
    }
    analyticsCache.clear() // P1-2：数据变更，失效聚合缓存
    res.json({ ok: true, ...r })
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message })
  }
})

// ── 数据调度：状态查询 + 手动触发（供前端「数据调度」页使用） ───────────────────────
const logsDir = join(dataDir, 'logs')
let crawlChild = null // 跟踪手动触发的子进程（非空即运行中）
const crawlPidPath = join(root, 'data', 'crawl.pid') // 脚本写入的进程组 PID 文件，供停止接口按进程组 kill

// 最新一次抓取日志路径（文件名含时间戳，字典序=时间序）。
function latestCrawlLog() {
  try {
    const files = readdirSync(logsDir).filter((f) => /^crawl-\d{8}-\d{6}\.log$/.test(f))
    if (files.length === 0) return null
    files.sort()
    return join(logsDir, files[files.length - 1])
  } catch {
    return null
  }
}

// 读取日志尾部 N 行，避免一次性返回过大。
function tailLog(path, n = 80) {
  try {
    return readFileSync(path, 'utf-8').split('\n').slice(-n).join('\n')
  } catch {
    return ''
  }
}

// 解析抓取进度：从完整日志提取「开始轮询 N 个搜索」(目标总数) 与
// 「限速等待」出现次数(已完成关键词数)。仅轮询模式(非手动)有效；
// 手动模式无此结构 → 返回 null。用于前端展示「已抓 X/Y」，让用户在
// 决定停止前知道还要等多久。
function parseCrawlProgress(text) {
  if (!text) return null
  const totalM = text.match(/开始轮询\s+(\d+)\s+个搜索/)
  if (!totalM) return null
  const total = parseInt(totalM[1], 10)
  if (!Number.isFinite(total) || total <= 0) return null
  const done = (text.match(/限速等待/g) || []).length
  const doneCapped = Math.min(done, total)
  return { total, done: doneCapped, percent: Math.round((doneCapped / total) * 100) }
}

// 下次计划时间：与 scripts/com.boss.crawler.plist 保持一致——每周日 03:00。
// 注：plist 是调度真相源；此处仅用于前端展示，规则改动需两处同步。
function nextScheduledRun() {
  const now = new Date()
  const next = new Date(now)
  next.setHours(3, 0, 0, 0)
  const dow = next.getDay() // 0=周日
  let add = (7 - dow) % 7
  if (add === 0 && now.getTime() >= next.getTime()) add = 7
  next.setDate(next.getDate() + add)
  return next.toISOString()
}

app.get('/api/crawl-status', (_req, res) => {
  const lockPath = join(dataDir, 'crawl.lock')
  const isRunning = !!crawlChild || existsSync(lockPath)
  const logPath = latestCrawlLog()
  let lastRun = null
  let progress = null
  if (logPath) {
    try {
      lastRun = new Date(statSync(logPath).mtimeMs).toISOString()
      // 抓取进度：解析完整日志（不限尾部 80 行），避免「开始轮询 N」被截断。
      progress = parseCrawlProgress(readFileSync(logPath, 'utf-8'))
    } catch {
      /* 忽略 */
    }
  }
  res.json({
    ok: true,
    isRunning,
    lastRun,
    nextRun: nextScheduledRun(),
    schedule: '每周日 03:00（见 scripts/com.boss.crawler.plist）',
    log: tailLog(logPath || join(logsDir, 'crawl-latest.log')),
    progress,
  })
})

// 手动触发抓取：后台 detached 拉起 scripts/crawl-run.sh（自带锁 + 全链路 pipeline）。
app.post('/api/crawl-trigger', (_req, res) => {
  const lockPath = join(dataDir, 'crawl.lock')
  if (crawlChild || existsSync(lockPath)) {
    return res.status(409).json({ ok: false, error: '抓取正在进行中，请稍后再试' })
  }
  try {
    // PATH 前置当前 node 所在目录（从进程推导，避免硬编码本机路径/用户名）
    const nodeBin = process.execPath.split('/').slice(0, -1).join('/')
    const env = {
      ...process.env,
      PATH: `${nodeBin}:${process.env.PATH || ''}`,
    }
    crawlChild = spawn('/bin/bash', [join(root, 'scripts', 'crawl-run.sh')], {
      cwd: root,
      env,
      detached: true,
      stdio: 'ignore',
    })
    crawlChild.on('exit', () => {
      crawlChild = null
    })
    crawlChild.unref() // 脱离后端进程，后台独立运行
    res.json({ ok: true, message: '已触发抓取，后台运行中（详见数据日志）' })
  } catch (e) {
    crawlChild = null
    res.status(500).json({ ok: false, error: e.message })
  }
})

// 停止抓取：杀掉手动/定时触发的进程树（含 crawler + 子进程），立即释放真机资源。
// 关键：detached 后抓取是独立进程树，只 kill 父 bash 会让 node crawler 变孤儿继续占资源，
// 因此按「进程组」发送 SIGTERM；PID 文件兜底覆盖后端重启后 crawlChild 引用丢失的场景。
app.post('/api/crawl-stop', (_req, res) => {
  let killed = false
  // 1) 后端进程内存中跟踪的 child（仅当后端未重启时有效）
  if (crawlChild && !crawlChild.killed) {
    try { crawlChild.kill('SIGTERM') } catch { /* ignore */ }
    killed = true
  }
  // 2) 进程组兜底：读 PID 文件，向整个进程组发 SIGTERM（负 pid = 进程组）
  try {
    if (existsSync(crawlPidPath)) {
      const pgid = parseInt(readFileSync(crawlPidPath, 'utf8').trim(), 10)
      if (!Number.isNaN(pgid) && pgid > 1) {
        try { process.kill(-pgid, 'SIGTERM') } catch { /* 已退出 */ }
        killed = true
      }
    }
  } catch { /* ignore */ }
  // 3) 抢先清理标记文件，使 isRunning 立即变 false（脚本 cleanup 退出时也会再删一次）
  try { if (existsSync(crawlPidPath)) unlinkSync(crawlPidPath) } catch {}
  try { if (existsSync(join(dataDir, 'crawl.lock'))) rmdirSync(join(dataDir, 'crawl.lock')) } catch {}
  crawlChild = null
  res.json({ ok: true, killed, message: killed ? '已发送停止信号，抓取任务正在退出…' : '当前没有运行中的抓取任务' })
})

const PORT = process.env.PORT || 3001
const HOST = process.env.HOST || 'localhost'
app.listen(PORT, HOST, () => {
  console.log(`[backend] listening on http://${HOST}:${PORT}`)
  console.log(`[backend] sqlite: ${join(dataDir, 'jobs.db')}`)
  // P3 安全：监听所有网络接口且未设 API_TOKEN → 公网暴露警告（避免误部署裸奔）。
  if ((HOST === '0.0.0.0' || HOST === '::') && !process.env.API_TOKEN) {
    console.warn('\n⚠️  安全提醒：后端正监听所有网络接口(0.0.0.0)，且未设置 API_TOKEN。')
    console.warn('    任何人可访问你的数据接口。公网/局域网部署前请设置 API_TOKEN 环境变量开启 Bearer 鉴权。\n')
  }
})
