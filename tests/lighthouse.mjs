// tests/lighthouse.mjs — Lighthouse 标准评分（性能/可访问性/最佳实践/SEO）
// 复用已安装的 Playwright chromium 作为引擎，避免重复下载 chrome。
// 运行：BASE_URL=http://localhost:5174 node tests/lighthouse.mjs
import lighthouse from 'lighthouse'
import { chromium } from 'playwright'
import { setTimeout as sleep } from 'timers/promises'

const BASE = process.env.BASE_URL || 'http://localhost:5174'
const PAGES = [
  { name: '总览', path: '/' },
  { name: '缺口', path: '/gap' },
  { name: '路线', path: '/roadmap' },
  { name: '图谱', path: '/clusters' },
  { name: '数据', path: '/data' },
  { name: '画像', path: '/persona' }
]

// 用 Playwright 启动带远程调试端口的 chrome，供 Lighthouse 连接
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--remote-debugging-port=9222']
})
await sleep(1500)
console.log(`\n🏮 Lighthouse（dev 模式基线）→ ${BASE}\n`)
for (const p of PAGES) {
  try {
    const res = await lighthouse(BASE + p.path, {
      port: 9222,
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo']
    })
    const c = res.lhr.categories
    const s = (k) => (c[k] && c[k].score != null ? Math.round(c[k].score * 100) : 'NA')
    console.log(`[${p.name} ${p.path}] 性能=${s('performance')} 可访问性=${s('accessibility')} 最佳实践=${s('best-practices')} SEO=${s('seo')}`)
  } catch (e) {
    console.log(`[${p.name} ${p.path}] Lighthouse 失败: ${e.message}`)
  }
}
await browser.close()
console.log('\n（dev 模式：性能分受未打包 JS 体积影响，生产 build + gzip 后复测更准确）')
