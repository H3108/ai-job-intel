import { test, expect } from '@playwright/test'

test('debug nav click market', async ({ page }) => {
  const logs: string[] = []
  page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`))
  page.on('pageerror', err => logs.push(`[PAGE ERROR] ${err.message}`))
  
  await page.goto('/')
  await page.waitForTimeout(1000)
  
  console.log('=== Before click ===')
  console.log('Root HTML length:', (await page.$eval('#root', el => (el as HTMLElement).innerHTML)).length)
  console.log('Body text length:', (await page.innerText('body')).length)
  
  await page.getByRole('link', { name: '岗位市场' }).click()
  await page.waitForTimeout(2000)
  
  console.log('=== After click ===')
  console.log('URL:', page.url())
  console.log('Root HTML length:', (await page.$eval('#root', el => (el as HTMLElement).innerHTML)).length)
  console.log('Body text:', await page.innerText('body'))
  console.log('Logs:', logs.join('\n'))
  
  await expect(page).toHaveURL(/\/market/)
})
