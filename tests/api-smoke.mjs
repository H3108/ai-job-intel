// tests/api-smoke.mjs — 后端 API 冒烟测试（纯 DB 端点，不触发 AI 调用）
// 运行：BASE_URL=http://localhost:3002 node tests/api-smoke.mjs
// 设计：覆盖 9 个 GET/PUT/POST 端点；插入的脏数据用 node:sqlite 自动清理，
//       profile 改动用「读-改-恢复」往返保证不污染真实库。
// v2：CI 环境下仓库不携带 data/*.db（.gitignore 排除），jobs 表默认为空。
//     为使测试自包含、不依赖仓库数据，启动时检测：若 jobs 表为空，则通过
//     真实 API `POST /api/jobs/import` 导入若干「测试自有种子」（含断言所需
//     角色 AI Agent 前端 + 城市 东莞），测完由清理逻辑一并删除。
//     本地有真实数据时表非空 → 跳过 seed，行为与旧版一致，不污染线上库。
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const BASE = process.env.BASE_URL || 'http://localhost:3002'
const __dirname = dirname(fileURLToPath(import.meta.url))

// 清理/检测用的库路径：优先环境变量（与 CI 起后端的 JOBS_DB_PATH 对齐），
// 缺省回落到仓库 data/jobs.db（本地直跑场景）。
const DB_PATH =
  process.env.JOBS_DB_PATH || join(__dirname, '..', 'data', 'jobs.db')

const MARKER = '__SMOKE_TEST_MARKER__'
const SEED_ROLE = 'AI Agent 前端'
const SEED_CITY = '东莞'

// 仅当 jobs 表为空（CI 无库）时导入的测试种子。id 带 MARKER 前缀便于清理，
// 且不携带真实 JD 内容（避免种子本身成为隐私泄风险）。
const SEED_JOBS = [
  { title: `${MARKER}-01`, company: 'SmokeCo', location: SEED_CITY, role: SEED_ROLE, salary: '20-35K' },
  { title: `${MARKER}-02`, company: 'SmokeCo', location: '深圳', role: SEED_ROLE, salary: '15-25K' },
  { title: `${MARKER}-03`, company: 'SmokeCo', location: '北京', role: 'AI 算法工程师', salary: '30-50K' },
  { title: `${MARKER}-04`, company: 'SmokeCo', location: '上海', role: 'AI 算法工程师', salary: '25-45K' },
  { title: `${MARKER}-05`, company: 'SmokeCo', location: '杭州', role: 'AI 产品经理', salary: '20-40K' }
]

let pass = 0
let fail = 0
const failures = []

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}
function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg} | expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`)
}
async function get(p) {
  const r = await fetch(BASE + p)
  return { status: r.status, json: await r.json().catch(() => null) }
}
async function send(method, p, body) {
  const r = await fetch(BASE + p, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  return { status: r.status, json: await r.json().catch(() => null) }
}
async function check(name, fn) {
  try {
    await fn()
    pass++
    console.log('  \u2705 PASS  ' + name)
  } catch (e) {
    fail++
    failures.push(name + ' -> ' + e.message)
    console.log('  \u274c FAIL  ' + name + '  (' + e.message + ')')
  }
}

async function main() {
  console.log(`\n\u{1F9EA} API 冒烟测试 → ${BASE}\n`)

  // ── 环境准备：jobs 表为空（CI 无库）→ 导入测试自包含种子 ──────────────────
  // 用后端 API 检测（GET /api/jobs 的 total），避免另开 SQLite 连接与后端争锁。
  let seeded = false
  try {
    const probe = await get('/api/jobs')
    const n = probe.json?.total
    if (typeof n === 'number' && n === 0) {
      const r = await send('POST', '/api/jobs/import', SEED_JOBS)
      if (r.status !== 200 || !r.json?.ok) {
        throw new Error(`seed 导入失败 status=${r.status} ${JSON.stringify(r.json)}`)
      }
      seeded = true
      console.log(`  \u{1F331} 环境无数据，已导入 ${r.json.inserted} 条测试种子（${SEED_ROLE} × ${SEED_CITY}）`)
    }
  } catch (e) {
    console.warn('  ⚠️ 空库检测异常（继续，依赖后续断言暴露问题）:', e.message)
  }

  await check('GET /api/health 返回 200 且 ok', async () => {
    const { status, json } = await get('/api/health')
    eq(status, 200, 'status')
    assert(json && json.ok === true, 'ok===true')
    assert(typeof json.total === 'number' && json.total > 0, 'total 为正整数')
  })

  const total = (await get('/api/health')).json.total

  await check('GET /api/scopes 返回角色/城市列表', async () => {
    const { status, json } = await get('/api/scopes')
    eq(status, 200, 'status')
    assert(json.ok === true, 'ok')
    assert(Array.isArray(json.roles) && json.roles.length > 0, 'roles 非空')
    assert(json.roles.includes(SEED_ROLE), `roles 含默认角色 ${SEED_ROLE}`)
    assert(Array.isArray(json.cities), 'cities 为数组')
  })

  const firstCity = (await get('/api/scopes')).json.cities?.[0]

  await check('GET /api/jobs 返回全量且长度=health.total', async () => {
    const { status, json } = await get('/api/jobs')
    eq(status, 200, 'status')
    // 现行响应为分页对象 { total, limit, offset, jobs }（jobs 为数组）
    assert(json && typeof json === 'object', 'body 为对象')
    assert(Array.isArray(json.jobs), 'jobs 为数组')
    eq(json.jobs.length, total, 'jobs 长度等于 total')
  })

  await check(`GET /api/jobs?role=${SEED_ROLE} 过滤返回子集且响应含 role`, async () => {
    const all = (await get('/api/jobs')).json.total
    const { status, json } = await get(`/api/jobs?role=${encodeURIComponent(SEED_ROLE)}`)
    eq(status, 200, 'status')
    assert(Array.isArray(json.jobs) && json.jobs.length > 0, '非空数组')
    assert(json.total < all, '是过滤子集而非全量')
    eq(json.jobs[0].role, SEED_ROLE, '响应投影含 role 且匹配过滤值')
  })

  await check('GET /api/jobs?role=不存在角色 返回空数组（边界）', async () => {
    const { status, json } = await get('/api/jobs?role=' + encodeURIComponent('__NO_SUCH_ROLE__'))
    eq(status, 200, 'status')
    assert(Array.isArray(json.jobs) && json.jobs.length === 0, '空数组')
  })

  if (firstCity) {
    await check(`GET /api/jobs?city=${firstCity} 城市过滤正确`, async () => {
      const { status, json } = await get('/api/jobs?city=' + encodeURIComponent(firstCity))
      eq(status, 200, 'status')
      assert(Array.isArray(json.jobs), '数组')
      for (const j of json.jobs) eq(j.location, firstCity, `第${j.id}条 location 匹配`)
    })
  }

  await check('GET /api/salary-audit 返回汇总', async () => {
    const { status, json } = await get('/api/salary-audit')
    eq(status, 200, 'status')
    assert(json && json.summary && typeof json.summary === 'object', 'summary 对象存在')
  })

  await check('GET /api/profile 返回画像（含 exists 标志）', async () => {
    const { status, json } = await get('/api/profile')
    eq(status, 200, 'status')
    assert(typeof json.exists === 'boolean', 'exists 为布尔')
  })

  // PUT /api/profile 安全往返：读-改-恢复，避免污染真实画像
  await check('PUT /api/profile 更新+恢复（不污染数据）', async () => {
    const before = await get('/api/profile')
    const origTarget = before.json.target_role
    const r1 = await send('PUT', '/api/profile', { target_role: '__SMOKE_TARGET__' })
    eq(r1.status, 200, 'put status')
    const after = await get('/api/profile')
    eq(after.json.target_role, '__SMOKE_TARGET__', '更新生效')
    const restore = await send('PUT', '/api/profile', { target_role: origTarget })
    eq(restore.status, 200, 'restore status')
    if (origTarget !== undefined && origTarget !== '__SMOKE_TARGET__') {
      const back = await get('/api/profile')
      eq(back.json.target_role, origTarget, '恢复原值')
    }
  })

  // 批量导入端点 POST /api/jobs/import（代码已不再提供单条 POST /api/jobs）
  // 边界：缺 title → importJobs 校验失败 → 400 且 errors 说明原因
  await check('POST /api/jobs/import 缺 title → 400 且 errors 说明原因', async () => {
    const r = await send('POST', '/api/jobs/import', [{ company: 'X' }])
    eq(r.status, 400, 'status=400（缺必填字段必须非 200）')
    assert(r.json && r.json.ok === false, 'ok===false')
    assert(r.json && Array.isArray(r.json.errors) && r.json.errors.length > 0, 'errors 含校验错误')
  })

  await check('POST /api/jobs/import 非数组且无 jobs → 400', async () => {
    const r = await send('POST', '/api/jobs/import', { foo: 'bar' })
    eq(r.status, 400, 'status=400')
  })

  await check('POST /api/jobs/import 合法插入可被写入', async () => {
    const r = await send('POST', '/api/jobs/import', [{
      title: MARKER,
      company: 'SmokeCo',
      location: '深圳',
      role: SEED_ROLE,
      salary: '20-35K'
    }])
    eq(r.status, 200, 'status')
    assert(r.json && r.json.inserted >= 1, 'inserted>=1')
  })

  // 清理冒烟插入的脏数据（软去重 key 含 title，marker 唯一，只删自己插入的）
  try {
    const db = new DatabaseSync(DB_PATH)
    const removed = db.prepare('DELETE FROM jobs WHERE title LIKE ?').run(`${MARKER}%`)
    db.close()
    console.log(`  \u{1F9F9} 已清理冒烟数据（删除 ${removed.changes} 行）`)
  } catch (e) {
    console.log('  \u26A0\uFE0F 清理失败，需手动删 title=' + MARKER + ' : ' + e.message)
  }

  console.log(`\n==== 结果：PASS ${pass} / FAIL ${fail} ====`)
  if (fail) {
    console.log('失败项：\n - ' + failures.join('\n - '))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('测试运行异常:', e)
  process.exit(2)
})