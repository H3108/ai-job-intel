import { chromium } from 'playwright-core'
const BASE = process.env.BASE_URL || 'http://localhost:5174'
const b = await chromium.launch({ headless: true })
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
page.on('pageerror', (e) => { console.log('PAGEERROR:', e.message); console.log(e.stack) })
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE.ERR:', m.text()) })
await page.goto(BASE + '/gap', { waitUntil: 'networkidle' }).catch((e) => console.log('goto err', e.message))
await page.waitForTimeout(1500)
// Try importing the modules to see if any fail to evaluate
const r = await page.evaluate(() => {
  return { html: document.body.innerHTML.slice(0, 200), text: document.body.innerText.slice(0, 100) }
})
console.log('BODY:', JSON.stringify(r))
await b.close()
