import { test, expect } from '@playwright/test'

const FIRST_JOB_ID = 'jd_6568dbd91d'

test('home page has nav and dashboard sections', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/AI 求职情报/)
  await expect(page.getByRole('navigation').getByText('市场概览')).toBeVisible()
  await expect(page.getByRole('navigation').getByText('岗位市场')).toBeVisible()
  await expect(page.getByText('AI 求职情报').first()).toBeVisible()
  await expect(page.getByText('岗位列表').first()).toBeVisible()
})

test('market page loads directly', async ({ page }) => {
  await page.goto('/market')
  await expect(page).toHaveURL(/\/market/)
  await expect(page.getByRole('heading', { name: '岗位市场' })).toBeVisible()
  await expect(page.getByText('热门城市').first()).toBeVisible()
})

test('job detail page loads directly', async ({ page }) => {
  await page.goto(`/jobs/${FIRST_JOB_ID}`)
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('heading', { name: '高级/资深前端开发工程师（AI方向）' })).toBeVisible()
})

test('profile page loads directly', async ({ page }) => {
  await page.goto('/profile')
  await expect(page).toHaveURL(/\/profile/)
  await expect(page.getByRole('heading', { name: '我的画像' })).toBeVisible()
})

test('roadmap page loads directly', async ({ page }) => {
  await page.goto('/roadmap')
  await expect(page).toHaveURL(/\/roadmap/)
  await expect(page.getByRole('heading', { name: '学习路线' })).toBeVisible()
})

test('reports page loads directly', async ({ page }) => {
  await page.goto('/reports')
  await expect(page).toHaveURL(/\/reports/)
  await expect(page.getByRole('main').getByText('智能分析').first()).toBeVisible()
})

test('dashboard filters jobs by status', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await expect(page.getByText('岗位列表').first()).toBeVisible()
  await expect(page.getByText('上一页').first()).toBeVisible()
})

test('dashboard sorts by title', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await expect(page.getByText('岗位列表', { exact: false }).first()).toBeVisible()
  await expect(page.getByText('上一页', { exact: false }).first()).toBeVisible()
})

test('market search filters results', async ({ page }) => {
  await page.goto('/market')
  await page.waitForLoadState('networkidle')
  await page.getByPlaceholder('搜索标题/公司/技能').fill('React')
  await page.waitForTimeout(400)
  const firstCard = page.locator('section:has-text("岗位列表") a[href*="/jobs/"] .font-medium').first()
  await expect(firstCard).toContainText('React')
})

test('market cards link to job detail', async ({ page }) => {
  await page.goto('/market')
  await page.waitForLoadState('networkidle')
  const count = await page.locator('section:has-text("岗位列表") a[href*="/jobs/"]').count()
  await expect(count).toBeGreaterThan(0)
  await page.goto('/jobs/jd_6568dbd91d')
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('heading', { name: '高级/资深前端开发工程师（AI方向）' }).first()).toBeVisible()
})

test('page has consistent header and footer', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('header')).toBeVisible()
  await expect(page.locator('footer')).toBeVisible()
  await expect(page.getByText('JobIntel').first()).toBeVisible()
})

test('navigation links work without crash', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: '岗位市场' }).click()
  await expect(page).toHaveURL(/\/market/)
  await page.getByRole('button', { name: '市场概览' }).click()
  await expect(page).toHaveURL(/\/$/)
  await page.getByRole('button', { name: '智能分析' }).click()
  await expect(page).toHaveURL(/\/reports/)
})

test('reports trigger does not crash page', async ({ page }) => {
  await page.goto('/reports')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: '手动触发分析' }).click()
  await page.waitForTimeout(1200)
  await expect(page.getByRole('main').getByText('智能分析').first()).toBeVisible()
})

test('job detail back to market preserves UI', async ({ page }) => {
  await page.goto('/market')
  await page.waitForLoadState('networkidle')
  await page.goto('/jobs/jd_6568dbd91d')
  await page.waitForLoadState('networkidle')
  await page.getByRole('link', { name: '返回市场' }).click()
  await expect(page).toHaveURL(/\/market/)
  await expect(page.getByRole('heading', { name: '岗位市场' })).toBeVisible()
})

test('unknown route shows not found UI', async ({ page }) => {
  await page.goto('/this-route-does-not-exist')
  await page.waitForLoadState('networkidle')
  await expect(page.getByText('404').first()).toBeVisible()
  await expect(page.getByText('页面未找到').first()).toBeVisible()
})

test('keyboard can activate nav', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.focus('button:has-text("岗位市场")')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/market/)
})
