import { test, expect } from '@playwright/test'

test('debug nav click sequence', async ({ page }) => {
  const logs: string[] = []
  page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`))
  page.on('pageerror', err => logs.push(`[PAGE ERROR] ${err.message}`))
  
  // First go directly to market
  await page.goto('/market')
  await page.waitForTimeout(1000)
  console.log('=== Direct /market ===')
  console.log('Root HTML length:', (await page.$eval('#root', el => (el as HTMLElement).innerHTML)).length)
  console.log('Has 岗位市场:', await page.getByRole('heading', { name: '岗位市场' }).count())
  
  // Then click profile from market
  logs.length = 0
  await page.getByRole('link', { name: '我的画像' }).click()
  await page.waitForTimeout(1500)
  console.log('=== After click to /profile ===')
  console.log('URL:', page.url())
  console.log('Root HTML length:', (await page.$eval('#root', el => (el as HTMLElement).innerHTML)).length)
  console.log('Logs:', logs.join('\n'))
  
  await expect(page).toHaveURL(/\/profile/)
})
