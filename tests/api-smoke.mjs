// tests/api-smoke.mjs — 后端 API 冒烟测试（纯 DB 端点，不触发 AI 调用）
// 运行：BASE_URL=http://localhost:3002 node tests/api-smoke.mjs
// 设计：覆盖 9 个 GET/PUT/POST 端点；插入的脏数据用 node:sqlite 自动清理，
//       profile 改动用「读-改-恢复」往返保证不污染真实库。
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const BASE = process.env.BASE_URL || 'http://localhost:3002'
const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = join(__dirname, '..', 'data', 'jobs.db')

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

const MARKER = '__SMOKE_TEST_MARKER__'

async function main() {
  console.log(`\n\u{1F9EA} API 冒烟测试 → ${BASE}\n`)

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
    assert(json.roles.includes('AI Agent 前端'), 'roles 含默认角色 AI Agent 前端')
    assert(Array.isArray(json.cities), 'cities 为数组')
  })

  const firstCity = (await get('/api/scopes')).json.cities?.[0]

  await check('GET /api/jobs 返回全量且长度=health.total', async () => {
    const { status, json } = await get('/api/jobs')
    eq(status, 200, 'status')
    assert(Array.isArray(json), 'body 为数组')
    eq(json.length, total, '长度等于 total')
  })

  await check('GET /api/jobs?role=AI Agent 前端 过滤返回子集且响应含 role', async () => {
    const all = (await get('/api/jobs')).json.length
    const { status, json } = await get('/api/jobs?role=' + encodeURIComponent('AI Agent 前端'))
    eq(status, 200, 'status')
    assert(Array.isArray(json) && json.length > 0, '非空数组')
    assert(json.length < all, '是过滤子集而非全量')
    eq(json[0].role, 'AI Agent 前端', '响应投影含 role 且匹配过滤值')
  })

  await check('GET /api/jobs?role=不存在角色 返回空数组（边界）', async () => {
    const { status, json } = await get('/api/jobs?role=' + encodeURIComponent('__NO_SUCH_ROLE__'))
    eq(status, 200, 'status')
    assert(Array.isArray(json) && json.length === 0, '空数组')
  })

  if (firstCity) {
    await check(`GET /api/jobs?city=${firstCity} 城市过滤正确`, async () => {
      const { status, json } = await get('/api/jobs?city=' + encodeURIComponent(firstCity))
      eq(status, 200, 'status')
      assert(Array.isArray(json), '数组')
      for (const j of json) eq(j.location, firstCity, `第${j.id}条 location 匹配`)
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

  // 边界：缺 title → importJobs 返回 errors，修复后接口应返 400（客户端可据状态码感知失败）
  await check('POST /api/jobs 缺 title → 400 且 errors 说明原因', async () => {
    const r = await send('POST', '/api/jobs', { company: 'X' })
    eq(r.status, 400, 'status=400（缺必填字段必须非 200）')
    assert(r.json && r.json.ok === false, 'ok===false')
    assert(r.json && Array.isArray(r.json.errors) && r.json.errors.length > 0, 'errors 含校验错误')
  })

  await check('POST /api/jobs/import 非数组且无 jobs → 400', async () => {
    const r = await send('POST', '/api/jobs/import', { foo: 'bar' })
    eq(r.status, 400, 'status=400')
  })

  await check('POST /api/jobs 合法插入可被写入', async () => {
    const r = await send('POST', '/api/jobs', {
      title: MARKER,
      company: 'SmokeCo',
      location: '深圳',
      role: 'AI Agent 前端',
      salary: '20-35K'
    })
    eq(r.status, 200, 'status')
    assert(r.json && r.json.inserted >= 1, 'inserted>=1')
  })

  // 清理冒烟插入的脏数据（软去重 key 含 title，marker 唯一，只删自己插入的）
  try {
    const db = new DatabaseSync(DB_PATH)
    const removed = db.prepare('DELETE FROM jobs WHERE title = ?').run(MARKER)
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
