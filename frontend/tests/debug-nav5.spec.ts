import { test, expect } from '@playwright/test'

test('debug anchor vs NavLink', async ({ page }) => {
  const logs: string[] = []
  page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`))
  page.on('pageerror', err => logs.push(`[PAGE ERROR] ${err.message}`))
  
  await page.goto('/market')
  await page.waitForTimeout(1000)
  console.log('=== Initial /market root HTML length:', (await page.$eval('#root', el => (el as HTMLElement).innerHTML)).length)
  
  // Try clicking profile via anchor href
  logs.length = 0
  await page.evaluate(() => {
    const el = document.createElement('a')
    el.href = '/profile'
    el.textContent = '我的画像'
    el.click()
  })
  await page.waitForTimeout(1500)
  console.log('=== After anchor click ===')
  console.log('URL:', page.url())
  console.log('Root HTML length:', (await page.$eval('#root', el => (el as HTMLElement).innerHTML)).length)
  console.log('Logs:', logs.join('\n'))
  
  await expect(page).toHaveURL(/\/profile/)
})
