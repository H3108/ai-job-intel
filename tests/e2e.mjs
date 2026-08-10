// tests/e2e.mjs — 前端 E2E 关键路径（Playwright，纯脚本自包含 runner）
//
// ⚠️ 运行前提（本机，不在沙箱）：
//   1) 装浏览器： npx playwright install chromium
//   2) 起后端：   PORT=3002 node backend/src/index.js
//   3) 起前端隔离预览（代理 /api → 3002，跳过 @fontsource）：
//        cd frontend && npx vite --config vite.preview.config.ts --port 5174
//   4) 跑本测试： BASE_URL=http://localhost:5174 node tests/e2e.mjs
//
// 选择器策略：优先语义化角色/文本（getByRole/getByText），不依赖 data-testid；
//   导航断言只验证「SPA 路由切换 + 主区域渲染」，不硬编码业务文案，降低脆弱性。
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:5174'
const BRAND = 'AI 求职情报' // 侧栏品牌文字（AppShell 品牌区），用作 SPA 挂载标志

// 侧栏导航项（label 用 accessible name 匹配；path 仅用于信息展示/调试）
const NAV = [
  { label: '缺口', path: '/gap' },
  { label: '路线', path: '/roadmap' },
  { label: '图谱', path: '/clusters' },
  { label: '数据', path: '/data' },
  { label: '画像', path: '/persona' }
]

let pass = 0
let fail = 0
const failures = []

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}
async function check(name, fn) {
  try {
    await fn()
    pass++
    console.log('  ✅ PASS  ' + name)
  } catch (e) {
    fail++
    failures.push(name + ' -> ' + e.message)
    console.log('  ❌ FAIL  ' + name + '  (' + e.message + ')')
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage()
  const consoleErrors = []
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text())
  })
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message))

  console.log(`\n🎭 E2E 关键路径 → ${BASE}\n`)

  // 1) 首页加载 + SPA 挂载 + 总览入口存在
  await check('首页加载：SPA 挂载且品牌「' + BRAND + '」可见', async () => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 20000 })
    await page.getByText(BRAND, { exact: false }).first().waitFor({ timeout: 10000 })
    // 侧栏应存在「总览」导航入口（首页自身路由）
    const overview = page.getByRole('link', { name: '总览', exact: false })
    assert((await overview.count()) > 0, '侧栏含「总览」链接')
  })

  // 2) 逐页导航：从首页点击侧栏链接 → 路由切换 + 主区域渲染
  for (const item of NAV) {
    await check(`导航「${item.label}」(${item.path}) 路由切换且页面渲染`, async () => {
      await page.goto(BASE + '/', { waitUntil: 'networkidle' }).catch(() => {})
      const before = new URL(page.url()).pathname
      const link = page.getByRole('link', { name: item.label, exact: false })
      await link.first().click({ timeout: 8000 })
      // 等待 pathname 发生变化（react-router 客户端导航）
      await page.waitForFunction(
        (b) => new URL(location.href).pathname !== b,
        before,
        { timeout: 8000 }
      )
      const after = new URL(page.url()).pathname
      assert(after !== before && after.length > 0, `URL 发生导航变化 (${before} → ${after})`)
      const childCount = await page.evaluate(() => {
        const main = document.querySelector('main') || document.querySelector('#root')
        return main ? main.children.length : 0
      })
      assert(childCount > 0, '主内容区已渲染（非空）')
    })
  }

  // 3) 作用域 URL 直接访问不崩（方案 C：?role=&city= 单一真相源）
  await check('作用域 URL 直接访问 /?role=AI Agent 前端 不崩', async () => {
    await page.goto(BASE + '/?role=' + encodeURIComponent('AI Agent 前端'), {
      waitUntil: 'networkidle',
      timeout: 20000
    })
    await page.getByText(BRAND, { exact: false }).first().waitFor({ timeout: 10000 })
    assert(true)
  })

  // 4) 画像页表单控件存在（PersonaPage 编辑 UI）
  await check('画像页 /persona 含表单控件', async () => {
    await page.goto(BASE + '/persona', { waitUntil: 'networkidle', timeout: 20000 })
    const inputs = await page.locator('input, textarea, select').count()
    assert(inputs > 0, '画像页至少有 1 个表单控件')
  })

  // 5) 主题切换器：三态切换 + localStorage 持久化 + 刷新保持
  // 控件在桌面侧栏与移动顶栏各一份，getByRole 默认排除隐藏元素，
  // 故桌面视口下只命中侧栏那份；用 .first() 兜底双份情况。
  await check('主题切换器：点「浅色」→ html[data-theme=light] 且 localStorage 持久化', async () => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 20000 })
    await page.getByRole('button', { name: '浅色' }).first().click({ timeout: 8000 })
    await page.waitForFunction(
      () => document.documentElement.getAttribute('data-theme') === 'light',
      { timeout: 5000 }
    )
    const stored = await page.evaluate(() => localStorage.getItem('ai-job-theme'))
    assert(stored === 'light', 'localStorage[ai-job-theme] = ' + stored)
  })

  await check('主题切换器：刷新后保持「浅色」(localStorage 持久化生效)', async () => {
    await page.reload({ waitUntil: 'networkidle', timeout: 20000 })
    await page.waitForFunction(
      () => document.documentElement.getAttribute('data-theme') === 'light',
      { timeout: 5000 }
    )
    const stored = await page.evaluate(() => localStorage.getItem('ai-job-theme'))
    assert(stored === 'light', '刷新后 localStorage[ai-job-theme] = ' + stored)
  })

  await check('主题切换器：点「深色」→ html[data-theme=dark] 且 localStorage= dark', async () => {
    await page.getByRole('button', { name: '深色' }).first().click({ timeout: 8000 })
    await page.waitForFunction(
      () => document.documentElement.getAttribute('data-theme') === 'dark',
      { timeout: 5000 }
    )
    const stored = await page.evaluate(() => localStorage.getItem('ai-job-theme'))
    assert(stored === 'dark', 'localStorage[ai-job-theme] = ' + stored)
  })

  await check('主题切换器：点「跟随」→ localStorage=auto 且解析为系统偏好', async () => {
    await page.getByRole('button', { name: '跟随' }).first().click({ timeout: 8000 })
    const stored = await page.evaluate(() => localStorage.getItem('ai-job-theme'))
    assert(stored === 'auto', 'localStorage[ai-job-theme] = ' + stored)
    // 跟随模式：实际主题应等于系统偏好（无头 chromium 默认 light，不硬编码 dark）
    const sysPref = await page.evaluate(() =>
      window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
    )
    await page.waitForFunction(
      (p) => document.documentElement.getAttribute('data-theme') === p,
      sysPref,
      { timeout: 5000 }
    )
  })

  // 6) 控制台无未捕获 JS 错误（过滤掉后端未起时的 /api 网络错误）
  await check('关键路径无未捕获 JS 错误', async () => {
    const real = consoleErrors.filter(
      (e) => !/Failed to load resource|fetch.*failed|net::|404|500|SyntaxError/i.test(e)
    )
    assert(real.length === 0, '控制台错误: ' + real.join(' | '))
  })

  await browser.close()
  console.log(`\n==== E2E 结果：PASS ${pass} / FAIL ${fail} ====`)
  if (fail) {
    console.log('失败项：\n - ' + failures.join('\n - '))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('E2E 运行异常（确认前端已在 ' + BASE + ' 启动、chromium 已安装）:', e)
  process.exit(2)
})
