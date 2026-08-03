import { chromium } from 'playwright'

const base = process.env.BASE_URL || 'http://localhost:5174'
const browser = await chromium.launch({ args: ['--no-sandbox'] })
const page = await browser.newPage()
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message))

console.log('goto', base)
await page.goto(base, { waitUntil: 'networkidle', timeout: 30000 })
await page.waitForSelector('#root', { timeout: 15000 })
await page.waitForTimeout(2000)

const title = await page.title()
const links = await page.$$eval('a', els => els.map(e => ({ href: e.getAttribute('href'), text: (e.textContent || '').trim() })))
const rootLen = await page.$eval('#root', e => e.innerHTML.length)
const h1 = await page.$$eval('h1,h2,h3', els => els.slice(0, 10).map(e => (e.textContent || '').trim()))

console.log('TITLE:', title)
console.log('ROOT_HTML_LEN:', rootLen)
console.log('HEADINGS:', JSON.stringify(h1))
console.log('LINKS:', JSON.stringify(links, null, 1))
console.log('ERRORS:', JSON.stringify(errors, null, 1))

await browser.close()
