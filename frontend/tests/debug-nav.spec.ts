import { test, expect } from '@playwright/test'

test('debug navigation', async ({ page }) => {
  await page.goto('/')
  await page.waitForTimeout(2000)
  
  // Capture console logs
  const logs: string[] = []
  page.on('console', msg => {
    logs.push(`[${msg.type()}] ${msg.text()}`)
  })
  
  // Capture page errors
  page.on('pageerror', err => {
    logs.push(`[PAGE ERROR] ${err.message}`)
  })
  
  // Click market
  await page.getByRole('link', { name: '岗位市场' }).click()
  await page.waitForTimeout(2000)
  
  console.log('=== URL:', page.url())
  console.log('=== Title:', await page.title())
  console.log('=== Root innerHTML:', await page.$eval('#root', el => (el as HTMLElement).innerHTML.substring(0, 500)))
  console.log('=== Body text:', await page.innerText('body'))
  console.log('=== Console logs:', logs.join('\n'))
  
  await expect(page).toHaveURL(/\/market/)
})
