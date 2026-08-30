# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: debug-dashboard2.spec.ts >> debug dashboard render 2
- Location: tests/debug-dashboard2.spec.ts:3:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByPlaceholder('搜索标题、公司或技能...')
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByPlaceholder('搜索标题、公司或技能...')

```

```yaml
- banner:
  - text: JI JobIntel AI 求职情报
  - navigation:
    - button "市场概览"
    - button "岗位市场"
    - button "我的画像"
    - button "学习路线"
    - button "智能分析"
- main:
  - heading "市场概览" [level=1]
  - paragraph: 已采集 1592 个岗位，当前展示 20 条；支持搜索与分页。
  - link "智能分析":
    - /url: /reports
  - heading "AI 分析" [level=2]
  - paragraph: 等待分析结果
  - text: 等待分析 模型：—
  - heading "岗位列表" [level=2]
  - paragraph: 当前筛选共 1592 条，按第 1 页显示。
  - textbox "搜索标题/公司/技能"
  - link "大前端leader 谭诗慧 · 广州 2026/8/30":
    - /url: /jobs/jd_e260cd5888
  - link "高级/资深前端开发工程师（AI方向） 楚女士 · 广州 2026/8/30":
    - /url: /jobs/jd_6568dbd91d
  - link "高级前端开发（品牌+高客单） 欧女士 · 深圳 2026/8/30":
    - /url: /jobs/jd_5240db7be0
  - link "前端开发工程师（VUE） 甘爽 · 深圳 2026/8/30":
    - /url: /jobs/jd_be40f3f0e0
  - link "React Native 工程师 熊梓陶 · 深圳 2026/8/30":
    - /url: /jobs/jd_0cf325cd1d
  - link "React前端工程师 施艾丽 · 深圳 2026/8/30":
    - /url: /jobs/jd_6336b96da9
  - link "React/Nextjs 工程师 王仁龙 · 深圳 2026/8/30":
    - /url: /jobs/jd_bdc75fcda9
  - link "高级前端开发工程师（React / Next.js） 刘女士 · 深圳 2026/8/30":
    - /url: /jobs/jd_fdf0a92444
  - link "前端开发工程师 - 抖音 任女士 · 深圳 2026/8/30":
    - /url: /jobs/jd_050ff4c802
  - link "前端开发 潘女士 · 深圳 2026/8/30":
    - /url: /jobs/jd_3b6ff9cb96
  - link "资深前端开发工程师 罗文勇 · 东莞 2026/8/30":
    - /url: /jobs/jd_7010698fb3
  - link "资深前端开发工程师 王健 · 东莞 2026/8/30":
    - /url: /jobs/jd_5643087c3b
  - link "前端开发工程师 阙女士 · 东莞 2026/8/30":
    - /url: /jobs/jd_f93d8da607
  - link "APP前端开发工程师 吕先生 · 东莞 2026/8/30":
    - /url: /jobs/jd_39f6a2b909
  - link "前端开发工程师 杨先生 · 东莞 2026/8/30":
    - /url: /jobs/jd_640118a1d5
  - link "Web/小程序全平台高级客户端开发工程师 张女士 · 东莞 2026/8/30":
    - /url: /jobs/jd_5900de20bf
  - link "前端开发工程师 林先生 · 东莞 2026/8/30":
    - /url: /jobs/jd_21736d69ca
  - link "前端开发工程师 付杨 · 东莞 2026/8/30":
    - /url: /jobs/jd_8531aefbf9
  - link "高级web前端开发 林女士 · 东莞 2026/8/30":
    - /url: /jobs/jd_8ddfa66aba
  - link "前端开发工程师 何女士 · 东莞 2026/8/30":
    - /url: /jobs/jd_91e3d5cad4
  - button "上一页" [disabled]
  - text: 第 1 / 80 页
  - button "下一页"
- contentinfo: JobIntel · 数据来自公开岗位采集 · 分析由 Hush AI OS 提供
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test'
  2  | 
  3  | test('debug dashboard render 2', async ({ page }) => {
  4  |   await page.goto('/')
  5  |   await page.waitForLoadState('networkidle')
  6  |   const input = page.getByPlaceholder('搜索标题、公司或技能...')
  7  |   console.log('COUNT', await input.count())
  8  |   console.log('VISIBLE', await input.isVisible().catch(() => 'ERR'))
> 9  |   await expect(input).toBeVisible({ timeout: 10000 })
     |                       ^ Error: expect(locator).toBeVisible() failed
  10 | })
  11 | 
```