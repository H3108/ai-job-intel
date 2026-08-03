// 与后端 /api/jobs 对齐的岗位类型（字段对应 §4.1 + §15）
export interface Job {
  id: string
  title: string
  normalized_title?: string | null
  company?: string | null
  location?: string | null
  salary?: string | null
  experience?: string | null
  education?: string | null
  raw?: string | null
  extracted?: unknown
  status?: string
  first_seen?: string | null
  last_seen?: string | null
  applied_at?: string | null
  user_note?: string | null
  created_at?: string | null
  // 解密相关（crawler 落库）
  salary_raw?: string | null
  salary_confidence?: string | null
  // 后端 /api/jobs/:id 附加：parseSalary 解析结果（minK/maxK 为折算后月薪 K，unit 为原单位标签）
  salaryParsed?: { minK: number; maxK: number; unit: string } | null
  role?: string | null
  search_role?: string | null
  education_level?: string | null
  experience_level?: string | null
  exp_min?: number | null
  exp_max?: number | null
}

// 职位—技能归一化关联（job_skills 表），详情页用于展示该职位要求的核心技能。
export interface JobSkill {
  skill: string
  category: string
  level: string // 必备 / 加分 / 了解 ...
}

// 单条职位详情：Job 全字段 + 关联技能列表（GET /api/jobs/:id 返回 { ok, job, skills }）
export interface JobDetail extends Job {
  skills: JobSkill[]
}

// 作用域（方案 C：多角色/多城市）。为空表示"全部市场"。
export interface Scope {
  role?: string
  city?: string
}

// 列表接口分页响应（P0-2：后端返回 { total, limit, offset, jobs }，列表不再含 extracted）。
export interface JobsList {
  total: number
  limit: number
  offset: number
  jobs: Job[]
}

// 列表：尊重 ?role=&city= 作用域；opts 支持 ?limit=&offset= 分页（职位市场浏览器用）。
// 注意：列表不含 extracted，JobCard 展开时按需从 /api/jobs/:id 拉取。
export async function fetchJobs(
  scope?: Scope,
  opts?: { limit?: number; offset?: number },
): Promise<JobsList> {
  const p = new URLSearchParams()
  if (scope?.role) p.set('role', scope.role)
  if (scope?.city) p.set('city', scope.city)
  if (opts?.limit != null) p.set('limit', String(opts.limit))
  if (opts?.offset != null) p.set('offset', String(opts.offset))
  const qs = p.toString()
  const res = await fetch(`/api/jobs${qs ? `?${qs}` : ''}`)
  if (!res.ok) throw new Error(`fetch /api/jobs failed: ${res.status}`)
  return res.json()
}

// 单条职位详情（职位明细页用）。后端返回 { ok, job, skills }。
export async function fetchJob(id: string): Promise<JobDetail> {
  const res = await fetch(`/api/jobs/${encodeURIComponent(id)}`)
  if (!res.ok) throw new Error(`fetch /api/jobs/${id} failed: ${res.status}`)
  const data = await res.json()
  return { ...(data.job ?? data), skills: data.skills ?? [] }
}

function buildQuery(scope: Scope): string {
  const p = new URLSearchParams()
  if (scope.role) p.set('role', scope.role)
  if (scope.city) p.set('city', scope.city)
  const s = p.toString()
  return s ? `?${s}` : ''
}

// 分析看板聚合数据（技能优先级 / 经验 / 学历 / 岗位细分），来自后端 /api/analytics。
export interface Analytics {
  targetRole: string
  total: number
  analyzedCount: number
  pendingCount: number
  skillRank: { skill: string; count: number; categories: string[]; levels: Record<string, number> }[]
  priority: { skill: string; score: number; count: number; topLevel?: string }[]
  salaryDist: Record<string, number>
  // 解密后的真实薪资分布（analyze.js salaryStats 产出；无数据时为 { count:0 }）
  salary: {
    count: number
    sampleSize: number
    medianMinK: number
    medianMaxK: number
    medianMidK: number
    buckets: { label: string; count: number }[]
  }
  expDist: Record<string, number>
  eduDist: Record<string, number>
  titleClusters: { key: string; count: number; samples: string[] }[]
  roleDist: { role: string; count: number }[]
  // ── Phase 3 增强字段（analyze.js insights() 产出） ──
  categoryPriority: {
    category: string
    totalCount: number
    requiredCount: number
    skillCount: number
    skills: string[]
    weight: number
  }[]
  learningPath: {
    stage: string
    desc: string
    items: { skill: string; count: number; required: number; score: number; reason: string }[]
  }[]
  personalGap: {
    hasBaseline: boolean
    message?: string
    knownCount: number
    masteredCount: number
    totalHigh: number
    gaps: { skill: string; score: number; count: number; topLevel?: string }[]
  }
  // 能力分层三档（后端 insights() 统一派生，前端零拼装）：必备底座 / 加分稀缺 / AI 工具。
  skillTiers: {
    base: { skill: string; count: number }[]
    premium: { skill: string; count: number }[]
    tools: { skill: string; count: number }[]
  }
}

export async function fetchAnalytics(scope?: Scope): Promise<Analytics> {
  const qs = scope ? buildQuery(scope) : ''
  const res = await fetch(`/api/analytics${qs}`)
  if (!res.ok) throw new Error(`fetch /api/analytics failed: ${res.status}`)
  return res.json()
}

// 作用域选项（顶栏选择器数据源）：已存在的角色/城市 + persona 默认目标角色。
export interface Scopes {
  ok: boolean
  roles: string[]
  cities: string[]
  // 规划采集城市（后端 CITIES 码表）：库内无数据时下拉仍能展示全部可采城市。
  plannedCities?: string[]
  defaultRole: string
  // 方案 D：每角色的已分析样本量，供跨角色对比选择器显示数据充分度。
  // family/func：岗族 / 职能大类，供前端「先切职能大类 → 再下钻岗族」两级视图。
  roleStats?: { role: string; total: number; analyzed: number; family: string; func: string }[]
}
export async function fetchScopes(): Promise<Scopes> {
  const res = await fetch('/api/scopes')
  if (!res.ok) throw new Error(`fetch /api/scopes failed: ${res.status}`)
  return res.json()
}

// 跨角色对比（方案 D）：每个角色一份 insights 子集，按角色分组返回。
export interface CompareRole {
  role: string
  total: number
  analyzedCount: number
  categoryPriority: Analytics['categoryPriority']
  salary: Analytics['salary']
  personalGap: Analytics['personalGap']
  skillTiers: Analytics['skillTiers']
  skillRankTop: Analytics['skillRank']
  priorityTop: Analytics['priority']
}
export interface CompareResult {
  ok: boolean
  dimension?: 'role' | 'city'
  role?: string
  cities?: string[]
  roles: CompareRole[]
}
export async function fetchCompare(params: {
  mode?: 'role' | 'city'
  roles?: string[]
  role?: string
  cities?: string[]
} = {}): Promise<CompareResult> {
  const sp = new URLSearchParams()
  if (params.mode === 'city') {
    if (params.role) sp.set('role', params.role)
    if (params.cities && params.cities.length) sp.set('cities', params.cities.join(','))
  } else if (params.roles && params.roles.length) {
    sp.set('roles', params.roles.join(','))
  }
  const qs = sp.toString()
  const res = await fetch(`/api/compare${qs ? `?${qs}` : ''}`)
  if (!res.ok) throw new Error(`fetch /api/compare failed: ${res.status}`)
  return res.json()
}

// 角色细报表（「细报表」页）：在 Analytics 基础上补薪资分位数 / 置信分布 / 公司 TOP / 技能按类别·等级分组。
export interface RoleDetailSkillGroup {
  skill: string
  count: number
  categories?: string[]
  levels?: Record<string, number>
}
export interface RoleDetail extends Analytics {
  salaryPercentiles: { p25: number | null; p50: number | null; p75: number | null; p90: number | null }
  salaryConfidence: { high: number; yellow: number; red: number; null: number; total: number }
  companyTop: { company: string; count: number }[]
  skillByCategory: Record<string, RoleDetailSkillGroup[]>
  skillByLevel: Record<string, { skill: string; count: number }[]>
}
export async function fetchRoleDetail(role: string): Promise<RoleDetail> {
  const res = await fetch(`/api/role-detail?role=${encodeURIComponent(role)}`)
  if (!res.ok) throw new Error(`fetch /api/role-detail failed: ${res.status}`)
  return res.json()
}

// 用户画像（PRD §4.3 persona「前端扎实、AI 从零」）。current_skills / ai_exposure /
// ai_engineering_gap 在库中以 JSON 字符串存储，前端自行 parse。
export interface Profile {
  exists: boolean
  id?: string
  target_role?: string
  current_skills?: string
  ai_exposure?: string
  ai_engineering_gap?: string
  note?: string
}

export async function fetchProfile(): Promise<Profile> {
  const res = await fetch('/api/profile')
  if (!res.ok) throw new Error(`fetch /api/profile failed: ${res.status}`)
  return res.json()
}

// 画像写入补丁（PUT /api/profile）。数组字段前端传数组即可，后端也兼容 JSON 字符串（GET 原样回传）。
export type ProfilePatch = {
  target_role?: string
  current_skills?: string[]
  ai_exposure?: { level?: string; tools?: string[]; note?: string }
  ai_engineering_gap?: string[]
  note?: string
}

// 保存用户画像（PUT /api/profile）。部分更新：仅传要改的字段即可。
export async function fetchUpdateProfile(patch: ProfilePatch): Promise<Profile> {
  const res = await fetch('/api/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) {
    let detail = ''
    try {
      detail = (await res.json()).error || ''
    } catch {
      /* ignore */
    }
    throw new Error(`保存画像失败：${res.status}${detail ? ' · ' + detail : ''}`)
  }
  return res.json()
}

// 采集健康度（看板状态灯）。后端 /api/health 从 crawl_runs + jobs 派生。
export interface CrawlRun {
  id: number
  ran_at: string
  mode: string
  status: string
  keywords_total: number
  jobs_new: number
  jobs_updated: number
  salary_decoded: number
  salary_attempted: number
  alerts_count: number
  alerts_json: string
}
export interface Health {
  ok: boolean
  ts: number
  total: number
  salaryDecoded: number
  salaryRate: number // 薪资已解密覆盖比例 %
  salaryLowConf: number // 黄区薪资数（confidence < 0.85）：字形比对打分器正常输出区间，仅分布展示，不点亮告警灯
  salaryLowConfRate: number // 黄区占比 %（仅展示，不再触发 warn）
  salaryLowConfRed: number // 红区薪资数（confidence < 0.70）：真正解码风险区，健康灯以此为准
  salaryLowConfRedRate: number // 红区占比 %（>10 即 warn）
  salaryConfThresholds: { yellow: number; red: number }
  status: 'ok' | 'warn' | 'unknown'
  lastRun: CrawlRun | null
}
export async function fetchHealth(): Promise<Health> {
  const res = await fetch('/api/health')
  if (!res.ok) throw new Error(`fetch /api/health failed: ${res.status}`)
  return res.json()
}

// 薪校抽检（Salary 校验 SOP）：低置信汇总 + 抽样明细（raw=PUA 加密原文，decoded=解密值）。
export interface SalaryAuditSample {
  id: number
  title: string
  company: string
  decoded: string
  raw: string
  confidence: number
}
export interface SalaryAudit {
  ok: boolean
  ts: number
  thresholds: { yellow: number; red: number }
  summary: {
    decoded: number
    lowConfYellow: number
    lowConfRed: number
    lowConfRate: number // 黄区占比（conf<0.85）：字形比对正常打分区间，仅展示，不触发告警
    lowConfRedRate: number // 红区占比（conf<0.70）：真正解码风险区，≥10% 才建议重跑
    medianConfidence: number | null
  }
  sample: SalaryAuditSample[]
}
export async function fetchSalaryAudit(): Promise<SalaryAudit> {
  const res = await fetch('/api/salary-audit')
  if (!res.ok) throw new Error(`fetch /api/salary-audit failed: ${res.status}`)
  return res.json()
}

// 手动导入：接收 §4.1 JSON 数组，或 { jobs: [...] } 包裹（§23 兜底，与爬虫同 schema）
export async function importJobs(payload: Job[] | { jobs: Job[] }): Promise<unknown> {
  const res = await fetch('/api/jobs/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!res.ok) throw new Error(`import /api/jobs/import failed: ${res.status}`)
  return res.json()
}

// 数据调度状态：上次/下次抓取、运行中、最近日志（GET /api/crawl-status）
export interface CrawlStatus {
  ok: boolean
  isRunning: boolean
  lastRun: string | null
  nextRun: string
  schedule: string
  log: string
  // 抓取进度（轮询模式）：已完成的搜索数 / 总数 / 百分比。手动模式或尚未开始为 null。
  progress: { total: number; done: number; percent: number } | null
}
export async function fetchCrawlStatus(): Promise<CrawlStatus> {
  const res = await fetch('/api/crawl-status')
  if (!res.ok) throw new Error(`fetch /api/crawl-status failed: ${res.status}`)
  return res.json()
}

// 手动触发抓取（POST /api/crawl-trigger），后台 detached 运行。
export async function triggerCrawl(): Promise<{ ok: boolean; message?: string; error?: string }> {
  const res = await fetch('/api/crawl-trigger', { method: 'POST' })
  return res.json()
}

// 停止抓取（POST /api/crawl-stop）：按进程组发送 SIGTERM，释放真机资源。
export async function stopCrawl(): Promise<{ ok: boolean; killed: boolean; message?: string }> {
  const res = await fetch('/api/crawl-stop', { method: 'POST' })
  return res.json()
}

// ── 学习闭环（§21，Phase3）：技能掌握状态（user_skill_mastery 表） ──
// 三态：未学 / 学习中 / 已掌握。UI 对每个缺口技能做标记，已掌握会从后端缺口移除并计入进度。
export type MasteryStatus = '未学' | '学习中' | '已掌握'
export interface MasteryItem {
  skill: string
  status: MasteryStatus
}
// 全量掌握状态（GET /api/mastery），用于缺口页三态标记初始化。
export async function fetchMastery(): Promise<MasteryItem[]> {
  const res = await fetch('/api/mastery')
  if (!res.ok) throw new Error(`fetch /api/mastery failed: ${res.status}`)
  const data = await res.json()
  return Array.isArray(data.items) ? data.items : []
}
// 批量更新掌握状态（PUT /api/mastery）。items 每项 { skill, status }，
// 后端做 INSERT OR REPLACE + status 白名单校验（非枚举值回退「未学」）。
export async function putMastery(items: MasteryItem[]): Promise<{ ok: boolean; updated: number }> {
  const res = await fetch('/api/mastery', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  })
  if (!res.ok) throw new Error(`put /api/mastery failed: ${res.status}`)
  return res.json()
}
