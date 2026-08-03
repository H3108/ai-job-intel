// tests/a11y.mjs — 可访问性测试（axe-core 注入，WCAG 2.1 AA）
// 运行：BASE_URL=http://localhost:5174 node tests/a11y.mjs
import { chromium } from 'playwright'
import { readFileSync } from 'fs'

const BASE = process.env.BASE_URL || 'http://localhost:5174'
const ROOT = process.cwd()
const axeSource = readFileSync(ROOT + '/node_modules/axe-core/axe.min.js', 'utf8')

const PAGES = [
  { name: '总览', path: '/' },
  { name: '缺口', path: '/gap' },
  { name: '路线', path: '/roadmap' },
  { name: '图谱', path: '/clusters' },
  { name: '数据', path: '/data' },
  { name: '画像', path: '/persona' }
]

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
let total = 0
console.log(`\n♿ 可访问性（axe-core, WCAG 2.1 AA）→ ${BASE}\n`)
for (const p of PAGES) {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(BASE + p.path, { waitUntil: 'networkidle', timeout: 30000 })
  await page.addScriptTag({ content: axeSource })
  const violations = await page.evaluate(async () => {
    const res = await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }
    })
    return res.violations.map((v) => ({
      id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help,
      targets: v.nodes.slice(0, 3).map((n) => n.target)
    }))
  })
  total += violations.length
  console.log(`[${p.name} ${p.path}] 违规 ${violations.length} 项`)
  for (const v of violations) {
    console.log(`  • [${v.impact}] ${v.id} — ${v.help} (${v.nodes} 处)`)
  }
  if (errors.length) console.log(`  ⚠ 页面 JS 错误: ${errors.join('; ')}`)
  await page.close()
}
await browser.close()
console.log(`\n==== 可访问性结论：共 ${total} 项 WCAG 2.1 AA 违规 ====`)
process.exit(total > 0 ? 1 : 0)
