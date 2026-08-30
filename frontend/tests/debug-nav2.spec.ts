import { test, expect } from '@playwright/test'

const pages = ['/market', '/profile', '/roadmap', '/reports']

for (const pagePath of pages) {
  test(`debug ${pagePath}`, async ({ page }) => {
    const logs: string[] = []
    page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`))
    page.on('pageerror', err => logs.push(`[PAGE ERROR] ${err.message}`))
    
    await page.goto('/')
    await page.waitForTimeout(500)
    await page.goto(pagePath)
    await page.waitForTimeout(1500)
    
    console.log(`=== ${pagePath} ===`)
    console.log('URL:', page.url())
    console.log('Root HTML length:', (await page.$eval('#root', el => (el as HTMLElement).innerHTML)).length)
    console.log('Body text:', await page.innerText('body'))
    console.log('Logs:', logs.join('\n'))
    
    await expect(page).toHaveURL(new RegExp(pagePath.replace('/', '\\/')))
  })
}
