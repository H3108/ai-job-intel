// backend/src/crawler.js — 采集 Boss 深圳 AI 岗（§9.1–9.3）
//
// 运行方式（必须在你本机运行，沙箱无法代跑）：
//
//   A) CDP 连接【真实 Chrome】（推荐，最不易被 Boss 风控）：
//        ./start-chrome-debug.sh        # 启动真实 Chrome（调试端口 9222），在其中登录 Boss
//        npm run crawl                  # 连接真实 Chrome 自动收割 6 个关键词
//        npm run crawl -- --manual      # 手动模式：你在浏览器翻页，按 Enter 收割当前页
//
//   B) Playwright 自带 Chromium（fragile，Boss 易识别，仅作兜底）：
//        npm run crawl -- --launch
//
// ⚠️ 真实 Chrome 运行时【不要打开 F12 开发者工具】，Boss 的反调试会因此把页面踢飞。
//    本脚本通过远程调试端口（CDP）连接，不会触发开发者工具检测。
//
// 为何不用 Playwright 的 connectOverCDP：它连接时会调用 Browser.setDownloadBehavior，
// 而你本机 Chrome 版本不支持该 CDP 命令，导致一连接就断开。故 CDP 模式改用 Node 22
// 自带的全局 WebSocket 直接走原生 CDP 协议，完全绕开 Playwright 这层。

import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { spawn } from 'node:child_process'
import { RateLimiter } from './rate-limiter.js'
import { buildSearchUrl, buildSearchUrls, resolveRole, resolveCity, CITIES } from './search-templates.js'
import { loadCrawlerConfig } from '../config/load.js'
import { ensureNormalizedSchema, backfillNormalized, backfillScope } from './migrate.js'
// font-decrypt 已移除，API 直接返回明文字段
import { loadDotEnv } from './analyze.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..', '..')
const dataDir = join(__dirname, '..', '..', 'data')  // use /var/www/jobintel/data
const PROFILE_DIR = join(dataDir, 'boss_profile')
mkdirSync(dataDir, { recursive: true })
mkdirSync(PROFILE_DIR, { recursive: true })

const db = new DatabaseSync(join(dataDir, 'jobs.db'))
db.exec(readFileSync(join(dataDir, 'schema.sql'), 'utf-8'))
ensureNormalizedSchema(db) // 方案 B：jobs.education_level + job_skills 子表
backfillNormalized(db) // 增量回填（幂等）
backfillScope(db) // 方案 C：存量岗位打上角色模板标签，使 scope 筛选可用

const limiter = new RateLimiter()
const ALERTS = []
const MANUAL = process.argv.includes('--manual')
const USE_LAUNCH = process.argv.includes('--launch')

// 方案 C：角色/城市可配置采集。
//   --role <角色名|标签>   选择 ROLE_TEMPLATES 中的模板（默认 "AI Agent 前端"）
//   --city <城市名|城市码> 选择 CITIES 中的城市（默认 "深圳"）
//   --keywords <k1,k2>    覆盖关键词（配合 --role 作为标签），适合模板外的一次性采集
//   --roles <r1,r2>       多角色（逗号分隔），与 --cities 组成搜索矩阵，一次跑完
//   --cities <c1,c2>      多城市（逗号分隔），与 --roles 组成搜索矩阵，一次跑完
// 例（单角色×单城市，旧用法）：npm run crawl -- --role "AI 算法工程师" --city 北京
// 例（多角色×多城市矩阵）：  npm run crawl -- --roles "AI Agent 前端,AI 算法工程师" --cities "深圳,北京,上海,杭州"
function getArg(name) {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const selectedRole = resolveRole(getArg('--role'), getArg('--keywords'))
const selectedCity = resolveCity(getArg('--city'))

// ── Phase4 批处理矩阵：--roles / --cities 可一次跑多角色×多城市 ──
// 未指定时回退为单角色×单城市（兼容旧用法 --role/--city）。
const rolesArg = getArg('--roles')
const citiesArg = getArg('--cities')
let TARGETS
if (rolesArg || citiesArg) {
  const roleNames = rolesArg ? rolesArg.split(',').map((s) => s.trim()).filter(Boolean) : [selectedRole.name]
  const cityNames = citiesArg ? citiesArg.split(',').map((s) => s.trim()).filter(Boolean) : [selectedCity.name]
  TARGETS = []
  for (const rn of roleNames) {
    const r = resolveRole(rn)
    for (const cn of cityNames) {
      const c = resolveCity(cn)
      for (const kw of r.keywords) {
        TARGETS.push({ keyword: kw, role: r.name, city: c.name, url: buildSearchUrl(kw, c.code) })
      }
    }
  }
} else {
  TARGETS = buildSearchUrls(getArg('--role'), getArg('--city'))
}
const _matrixRoles = [...new Set(TARGETS.map((t) => t.role))]
const _matrixCities = [...new Set(TARGETS.map((t) => t.city))]
console.log(`[crawler] 采集矩阵 → ${TARGETS.length} 个搜索（${_matrixRoles.length} 角色 × ${_matrixCities.length} 城市）：${_matrixRoles.join('/')} @ ${_matrixCities.join('/')}`)

// 城市分页配置：从 crawler.yaml 读取
const CITY_PAGE_LIMITS = (() => {
  try {
    const cfg = loadCrawlerConfig()
    const m = {}
    for (const [name, info] of Object.entries(cfg.cities || {})) {
      m[name] = info.pages ?? 1
    }
    return m
  } catch (e) {
    console.warn('[crawler] crawler.yaml 读取失败，回退默认 1 页：', e.message)
    console.warn('[crawler] error stack:', e.stack)
    return {}
  }
})()

// 合法薪资形态判定（模块级，buildPageDecoder 与 harvestCDP 共用）：
// 含真实数字 + 含单位(K/万/元) + 无残留 PUA（解密失败）。
// API 直接返回明文字段，无需 looksLikeSalary 判断

// API 直接返回 salaryDesc 明文字段，无需解密，移除 SALARY_CONF 相关逻辑

// 单次运行累计计数器（供收尾写 crawl_runs，驱动看板状态灯）
let RUN_NEW = 0
let RUN_UPDATED = 0
function resetRunCounters() {
  RUN_NEW = RUN_UPDATED = 0
}
// font-dump 已移除，API 直接返回明文字段
let fontDumpSeq = 0 // 字体落盘全局序号，避免跨关键词互相覆盖
const USE_CDP = !USE_LAUNCH // 默认走 CDP（真实 Chrome）

// 通过 CDP 网络拦截捕获的字体字节（浏览器已带鉴权下载，比 Node fetch 更可靠）
let capturedFonts = new Map() // url -> Buffer
let pendingFontReqs = new Map() // requestId -> { url, mimeType }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ─────────────────────────────────────────────────────────────────────────────
// 原生 CDP 客户端：Node 22 自带全局 WebSocket，直连目标标签页，不依赖 Playwright
// ─────────────────────────────────────────────────────────────────────────────
async function createCDP(wsUrl, onEventRef) {
  let WebSocket = globalThis.WebSocket
  if (!WebSocket) {
    try {
      WebSocket = (await import('ws')).WebSocket
    } catch {}
  }
  if (!WebSocket) throw new Error('当前 Node 不支持全局 WebSocket（需 Node 21+）。请确认 `nvm use 22`。')
  const ws = new WebSocket(wsUrl)
  let msgId = 1
  const pending = new Map()
  const ready = new Promise((res, rej) => {
    ws.onopen = () => res()
    ws.onerror = (e) => rej(e.error || new Error('CDP WebSocket 连接失败'))
  })
  ws.onmessage = (ev) => {
    let msg
    try {
      msg = JSON.parse(ev.data)
    } catch {
      return
    }
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) p.reject(new Error(msg.error.message))
      else p.resolve(msg.result)
    } else if (msg.method && onEventRef && onEventRef.fn) {
      try { onEventRef.fn(msg.method, msg.params) } catch {}
    }
  }
  async function send(method, params = {}) {
    await ready
    const id = msgId++
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
    })
  }
  async function evaluate(expr) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text || 'evaluate error')
    }
    return r.result.value
  }
  function close() {
    try {
      ws.close()
    } catch {}
  }
  return { send, evaluate, close, ready }
}

async function httpGetJson(url, label) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(
      `CDP 端点 ${label} 返回的不是 JSON（HTTP ${res.status}）。\n` +
        `返回内容前 300 字符：\n${text.slice(0, 300)}\n` +
        `→ 说明 127.0.0.1:9222 可能并非 Chrome 远程调试端口（被代理/其他程序占用）。\n` +
        `请确认已运行 ./start-chrome-debug.sh，并在终端执行：curl -s http://127.0.0.1:9222/json | head`
    )
  }
}

// 新版 Chrome 的 /json/new 端点只接受 PUT（不再支持 GET），用于新建标签页
async function httpPutJson(url, body) {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(
      `CDP 端点 /json/new 返回的不是 JSON（HTTP ${res.status}）。\n` +
        `返回内容前 300 字符：\n${text.slice(0, 300)}\n` +
        `→ 说明 127.0.0.1:9222 可能并非 Chrome 远程调试端口（被代理/其他程序占用）。\n` +
        `请确认已运行 ./start-chrome-debug.sh，并在终端执行：curl -s http://127.0.0.1:9222/json | head`
    )
  }
}

// 找到已打开的 Boss 标签页；没有就新建一个空白标签页（随后用 Page.navigate 跳转）
async function findOrCreateTarget() {
  let targets = []
  try {
    targets = await httpGetJson('http://127.0.0.1:9222/json', '/json')
  } catch (e) {
    throw new Error('无法连接 CDP（127.0.0.1:9222）。请先运行 ./start-chrome-debug.sh 启动真实 Chrome。原错误：' + e.message)
  }
  const target = targets.find((t) => t.type === 'page' && /zhipin\.com/.test(t.url))
  if (target && target.webSocketDebuggerUrl) return target
  // 关键修复：/json/new 必须用 PUT（新版 Chrome 拒绝 GET），建空白页后用 CDP 的 Page.navigate 跳转
  const created = await httpPutJson('http://127.0.0.1:9222/json/new')
  return created
}

const LOGIN_CHECK = `(() => ({
  hasLogin: Array.from(document.querySelectorAll('a,button')).some(el => (el.textContent||'').trim()==='登录'),
  url: location.href
}))()`

async function ensureLoginCDP(cdp) {
  const st = await cdp.evaluate(LOGIN_CHECK)
  const needLogin = st.hasLogin || /_security_check|zhipin\.com\/web\/geek\/login/.test(st.url)
  if (!needLogin) return true
  console.warn('[crawler] 检测到未登录，返回 AUTH_REQUIRED。')
  return 'AUTH_REQUIRED'
}

async function waitCardsCDP(cdp, timeoutMs = 60000) {
  const start = Date.now()
  // 防护：Boss 有时会把搜索 URL 重定向/降级成空 query 或推荐页，先修正回当前关键词的搜索 URL
  const current = await cdp.evaluate(`(() => ({ href: location.href, query: new URLSearchParams(location.search).get('query') }))()`)
  if (!current.query) {
    const fixed = TARGETS.find(t => t.url.startsWith('https://www.zhipin.com/web/geek/jobs?query=')) || TARGETS[0]
    if (fixed) {
      console.warn('[crawler][wait] 检测到空 query，修正到搜索 URL:', fixed.url)
      await cdp.send('Page.navigate', { url: fixed.url })
      await sleep(2000)
    }
  }
  console.log('[crawler][wait] 开始等待卡片，timeout=' + timeoutMs)
  // 第一阶段：等 SPA 加载骨架消失（"加载中"转圈不再可见）
  while (Date.now() - start < timeoutMs) {
    const loading = await cdp.evaluate(`(() => {
      const el = document.querySelector('.page-loading, .data-tips, [class*="loading"]');
      if (!el) return false;
      const text = (el.textContent || '').trim();
      if (/加载中|loading/i.test(text)) return true;
      return el.offsetParent !== null;
    })()`)
    if (!loading) break
    await sleep(800)
  }
  console.log('[crawler][wait] 第一阶段完成，开始第二阶段')
  // 第二阶段：等职位卡片出现（至少 1 张）
  while (Date.now() - start < timeoutMs) {
    const n = await cdp.evaluate(`document.querySelectorAll('a[href*="job_detail"]').length`)
    if (n > 0) { console.log('[crawler][wait] 找到 ' + n + ' 张卡片'); return n }
    await sleep(700)
  }
  console.log('[crawler][wait] 超时，未找到卡片')
  return 0
}

// 滚动 job 列表容器，触发 Boss 的懒加载/虚拟滚动，把更多卡片加载进 DOM
async function scrollToLoadCDP(cdp, maxScrollRounds = 8) {
  await cdp.evaluate(`(() => {
    // 找到可滚动的列表容器（左侧职位列表区域）
    const containers = [
      document.querySelector('.job-list-box, .job-list, [class*="job-list"]'),
      document.querySelector('ul[data-v-7927b92b]'),       // 用户实际布局的 ul 容器
      document.querySelector('.job-card-wrapper')?.parentElement,
      document.body
    ].find(Boolean);
    if (!containers) return;
    let lastCount = 0;
    for (let i = 0; i < ${maxScrollRounds}; i++) {
      containers.scrollTop += 800;                          // 每次滚 800px
      // 等新卡片渲染（Boss 懒加载有延迟）
    }
  })()`)
  // 滚动后等待 DOM 更新（每次滚动后给 Boss 时间懒加载）
  for (let i = 0; i < maxScrollRounds; i++) {
    await sleep(1200)
    const n = await cdp.evaluate(`document.querySelectorAll('a[href*="job_detail"]').length`)
    if (i > 0 && n === 0) break  // 页面异常，停止滚动
  }
}

async function crawlViaApiCDP(cdp, keyword = '', navUrl = '', searchRoleName = selectedRole.name, page = 1, searchCityName = selectedCity.name) {
  try {
    // API-first 采集：绕过 DOM，直接用 Boss 搜索 API
  // 从 cookie 中提取可用 token，按优先级尝试
  const cookiesExpr = "(() => { const cookies = document.cookie.split(';').reduce((a, b) => { const [k, v] = b.trim().split('='); a[k] = v; return a; }, {}); return { wt2: cookies['wt2'] || '', zpAt: cookies['zp_at'] || '', bst: cookies['bst'] || '', stoken: cookies['__zp_stoken__'] || '', token: cookies['token'] || '' }; })()"
  const cookies = await cdp.evaluate(cookiesExpr)
  // 按优先级尝试：wt2 > zp_at > bst > token > stoken
  const token = cookies.wt2 || cookies.zpAt || cookies.bst || cookies.token || cookies.stoken || ''
  if (!token) {
    console.warn('[api] 未找到登录 token，跳过 API 采集')
    console.warn('[api] 可用 cookie keys:', Object.keys(cookies).filter(k => cookies[k]).join(', '))
    return { count: 0, data: [], viaApi: false }
  }
  console.log('[api] 使用 token 类型:', token === cookies.wt2 ? 'wt2' : token === cookies.zpAt ? 'zp_at' : token === cookies.bst ? 'bst' : token === cookies.token ? 'token' : 'stoken')
  const city = (searchCityName ? (CITIES[searchCityName] || selectedCity?.code) : selectedCity?.code) || '101280600'
  const query = encodeURIComponent(keyword || '')
  const body = `page=${page}&pageSize=20&city=${city}&query=${query}&scene=1&expectInfo=&multiSubway=&multiBusinessDistrict=&position=&jobType=&salary=&experience=&degree=&industry=&scale=&stage=`
  const xhrExpr = "(() => { return new Promise((resolve) => { const xhr = new XMLHttpRequest(); xhr.open('POST', '/wapi/zpgeek/search/joblist.json', false); xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded'); xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest'); xhr.setRequestHeader('Referer', location.href); xhr.setRequestHeader('Origin', 'https://www.zhipin.com'); xhr.setRequestHeader('zp_token', '" + token + "'); xhr.setRequestHeader('token', '" + token + "'); xhr.onload = () => { try { const d = JSON.parse(xhr.responseText); resolve({ ok: d.code === 0, data: d.zpData || {}, raw: xhr.responseText }); } catch(e) { resolve({ ok: false, error: e.message }); } }; xhr.onerror = () => resolve({ ok: false, error: 'xhr network error' }); xhr.send('" + body + "'); }); })()"
  let apiResult
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      apiResult = await cdp.evaluate(xhrExpr)
      if (apiResult.ok) break
    } catch (e) {
      if (attempt < 3 && /navigated or closed|Execution context|context.*destroyed|Target closed|Connection closed|detached/i.test(e.message || '')) {
        console.warn(`[api] 第 ${attempt} 次 API 调用失败（${e.message}），等待后重试...`)
        await sleep(2000)
        continue
      }
      throw e
    }
  }
  if (!apiResult || !apiResult.ok) {
    console.warn('[api] 请求失败:', apiResult?.error || apiResult?.data?.message || '未知错误')
    return { count: 0, data: [], viaApi: false }
  }
  const zpData = apiResult.data
  const jobList = zpData.jobList || []
  console.log(`[api] 获取到 ${jobList.length} 条岗位（总数 ${zpData.resCount || 0}）`)
  console.log(`[api] 返回数据样例：encryptJobId=${jobList[0]?.encryptJobId}, securityId=${jobList[0]?.securityId}, jobName=${jobList[0]?.jobName}`)
  const mapped = jobList.map(job => ({
    id: 'boss_' + (job.encryptJobId || job.securityId || Math.random().toString(36).slice(2)),
    title: job.jobName || '',
    company: job.bossName || job.brandName || '',  // use bossName first for dedup
    location: job.cityName || selectedCity.name,
    salary: job.salaryDesc || '',
    salary_raw: job.salaryDesc || '',  // API 返回明文，不再加密
    experience: job.jobExperience || '',
    education: job.jobDegree || '',
    raw: '',
    extracted: JSON.stringify({
      source: 'api',
      keyword,
      city: selectedCity.name,
      jobLabels: job.jobLabels,
      skills: job.skills,
      welfareList: job.welfareList,
      areaDistrict: job.areaDistrict,
      businessDistrict: job.businessDistrict,
      industry: job.industry,
      brandStageName: job.brandStageName,
      brandScaleName: job.brandScaleName
    }),
    status: 'collected',
    first_seen: new Date().toISOString(),
    last_seen: new Date().toISOString(),
    search_role: searchRoleName || keyword,
    role_family: '',
    role_function: '',
    role_language: ''
  }))
  return { count: mapped.length, data: mapped, viaApi: true }
  } catch (e) {
    console.error('[crawler][crawlViaApiCDP] 内部异常：', e?.message || e)
    console.error('[crawler][crawlViaApiCDP] stack：', e?.stack)
    throw e
  }
}

// 分页采集：自动翻页直到无数据或达到城市页数限制
async function crawlViaApiCDPAllPages(cdp, keyword = '', navUrl = '', searchRoleName = selectedRole.name, searchCityName = selectedCity.name) {
  try {
    const city = searchCityName || selectedCity?.name || '深圳'
    const maxPages = CITY_PAGE_LIMITS[city] || 1
  console.log(`[api][debug] crawlViaApiCDPAllPages: city=${city}, maxPages=${maxPages}, keyword=${keyword}`)
  let allData = []
  let page = 1
  const pageSize = 20
  
  while (page <= maxPages) {
    console.log(`[api] ${city} "${keyword}" 第 ${page}/${maxPages} 页`)
    let result
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        result = await crawlViaApiCDP(cdp, keyword, navUrl, searchRoleName, page, searchCityName)
        break
      } catch (e) {
        if (attempt < 3 && /navigated or closed|Execution context|context.*destroyed|Target closed|Connection closed|detached/i.test(e.message || '')) {
          console.warn(`[api] 第 ${page} 页第 ${attempt} 次尝试失败（${e.message}），等待后重试...`)
          await sleep(2000)
        } else {
          throw e
        }
      }
    }
    if (!result || !result.viaApi || result.count === 0) {
      console.log(`[api] ${city} "${keyword}" 第 ${page} 页无数据，停止翻页`)
      break
    }
    allData = allData.concat(result.data)
    page++
    
    // 如果返回 0 条，说明已到最后一页
    if (result.count === 0) {
      console.log(`[api] ${city} "${keyword}" 第 ${page-1} 页无数据，停止翻页`)
      break
    }
    
    // 翻页延迟
    await sleep(500)
  }
  
  console.log(`[api] ${city} "${keyword}" 分页完成：共 ${allData.length} 条（${page-1} 页）`)
  return { count: allData.length, data: allData, viaApi: true }
  } catch (e) {
    console.error('[crawler][crawlViaApiCDPAllPages] 内部异常：', e?.message || e)
    console.error('[crawler][crawlViaApiCDPAllPages] stack：', e?.stack)
    throw e
  }
}

async function scrapeViaCDP(cdp) {
  // 稳健抽取：不依赖 .job-card-wrapper（你的 Boss 布局用的是 div/li[data-v-xxxx]）。
  // 直接定位职位标题链接 a[href*="job_detail"]，向上找含公司链接的卡片容器，按 href 去重。
  return cdp.evaluate(`(() => {
    const titleLinks = Array.from(document.querySelectorAll('a[href*="job_detail"]'));
    console.log('[scrape] 找到 ' + titleLinks.length + ' 个链接');
    const cards = [];
    const seen = new Set();
    for (const a of titleLinks) {
      const href = a.getAttribute('href') || '';
      if (href.includes('securityId')) continue;       // 跳过“查看更多信息”等带令牌的链接
      if (!/job_detail\\//.test(href)) { console.log('[scrape] 跳过非岗位链接:', href.slice(0, 50)); continue; }
      // title 来自职位标题链接；Boss 该链接 textContent 常含整张卡片文本（标题+薪资+公司+城市），
      // 故只取首个非空行作为真实标题，避免把薪资/公司/城市塞进 title。
      const titleLines = (a.textContent || '').split('\\n').map((s) => s.trim()).filter(Boolean)
      const title = titleLines[0] || ''
      if (!title) continue;
      if (new RegExp('职位搜索|职位详情|BOSS直聘|立即登录|登录/注册|查看更多|查看全部').test(title)) { console.log('[scrape] 跳过脏标题:', title.slice(0, 50)); continue; }  // 丢弃页面级脏标题
      let card = a;
      while (card && card !== document.body) {
        if (card.querySelector && card.querySelector('a[href*="gongsi"]')) break;
        card = card.parentElement;
      }
      // 公司：取卡片内公司链接；过滤掉「查看全部/查看更多」这类推广/导航链接（否则会误把 UI 文案当公司名）
      const gongsiLinks = card ? Array.from(card.querySelectorAll('a[href*="gongsi"]')) : []
      const companyLink = gongsiLinks.find((el) => {
        const t = (el.textContent || '').trim()
        return t && !/查看全部|查看更多|查看职位/.test(t)
      })
      const company = companyLink ? companyLink.textContent.trim() : '';
      // 薪资由 API 返回明文，DOM scraper 不再提取加密文本
      if (seen.has(href)) { console.log('[scrape] 跳过重复 href'); continue; }
      seen.add(href);
      cards.push({
        title,
        company,
        detailHref: href.startsWith('http') ? href : 'https://www.zhipin.com' + href,
      });
    }
    console.log('[scrape] 最终返回 ' + cards.length + ' 张卡片'); return { count: cards.length, data: cards, url: location.href };
  })()`)
}

async function scrapeDetailCDP(cdp, detailHref) {
  if (!detailHref) return ''
  const abs = detailHref.startsWith('http') ? detailHref : 'https://www.zhipin.com' + detailHref
  try {
    await cdp.send('Page.navigate', { url: abs })
    await sleep(2500)
    const start = Date.now()
    let raw = ''
    while (Date.now() - start < 12000) {
      raw = await cdp.evaluate(`(() => {
        const el = document.querySelector('.job-detail, .description, .job-sec-text, .text');
        if (el) return el.innerText.trim();
        const hs = Array.from(document.querySelectorAll('h3, h2, .title'));
        const h = hs.find(x => (x.textContent || '').includes('职位描述'));
        if (h) {
          const p = h.parentElement ? h.parentElement.querySelector('p') : null;
          if (p) return p.innerText.trim();
        }
        return '';
      })()`)
      if (raw) break
      await sleep(700)
    }
    return raw || ''
  } catch (e) {
    ALERTS.push(`详情页抓取失败（${detailHref}）：${e.message}`)
    return ''
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 薪资字段已由 API 直接返回明文（salaryDesc），无需字体解密
// ─────────────────────────────────────────────────────────────────────────────
// 离线薪资字体兜底：当活体页未捕获到可用薪资字体(buildPageDecoder 返回 null)时，
// 复用 --font-dump 已落盘的 data/boss_fonts 字体重新解码。经验证该批字体对全部页面薪资通用
// （font_000~004 均指向同一 woff，解码样本 20-25K/15-22K 等均正确）。
// 按 manifest 中的置信度降序排列，优先用高置信字体；缓存于模块级，避免每页重复读盘。
let _offlineDecoders = null
function loadOfflineDecoders() {
  if (_offlineDecoders) return _offlineDecoders
  _offlineDecoders = []
  const dir = join(dataDir, 'boss_fonts')
  if (!existsSync(dir)) return _offlineDecoders
  // findReferenceFonts 已移除，API 直接返回明文字段
  let manifest = { fonts: [] }
  try { manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf-8')) } catch {}
  const confByFile = {}
  for (const f of manifest.fonts || []) {
    const base = f.file ? f.file.split('/').pop() : ''
    if (typeof f.confidence === 'number') confByFile[base] = f.confidence
  }
  const ranked = []
  for (const fn of readdirSync(dir)) {
    if (!fn.endsWith('.bin')) continue
    try {
      const buf = readFileSync(join(dir, fn))
      continue  // 薪资解密已移除
      if (dec.mapSize === 0) continue
      ranked.push({ fn, dec, conf: confByFile[fn] ?? -1 })
    } catch {}
  }
  ranked.sort((a, b) => b.conf - a.conf)
  _offlineDecoders = ranked
  return _offlineDecoders
}

// 二次兜底：本地 .bin 字体在当前环境全部失败时，按 manifest 中的 URL 在线下载后重试。
// 绕过本地字体解析差异/字体文件损坏，优先返回置信最高的合法薪资形态解码。
async function getSalaryFontCandidates(cdp) {
  // 返回两类候选：'CSS:<href>'（外部样式表，Node 侧 fetch 后正则提字体）、'INLINE:<style文本>'
  return cdp.evaluate(`(() => {
    const out = [];
    for (const l of document.querySelectorAll('link[rel="stylesheet"]')) if (l.href) out.push('CSS:' + l.href);
    for (const s of document.querySelectorAll('style')) if (s.textContent) out.push('INLINE:' + s.textContent);
    return out;
  })()`)
}

// 在页面里定位加密字体并构建解码器；命中后缓存。DUMP_FONT 时把字体+样本落盘供离线验证。
// 关键：不再"抓到第一个有 PUA 映射的字体就返回"（会误抓图标字体 ui-icons），
// 而是按 .salary 真实 font-family 优先匹配 @font-face，并对每个候选尝试解码样本，
// 选"解码出合法薪资形态（数字+K/万）"的那个。
// 薪资解密已迁移到 API-first 采集，直接使用明文字段
async function harvestCDP(cdp, keyword = '', navUrl = '', searchRoleName = selectedRole.name, searchCityName = selectedCity.name) {
  const st = await cdp.evaluate(`(() => ({ url: location.href, hasLogin: !!document.querySelector('a[href*="login"], .login-btn, [class*="login"]') }))()`)
  if (/_security_check|zhipin\.com\/web\/geek\/login/.test(st.url) || st.hasLogin) {
    console.warn('[crawler] 当前页是登录墙/安全校验/未登录态，跳过。')
    console.log('[crawler][harvest] 出口：登录墙')
    ALERTS.push('登录态失效：检测到登录页/安全校验，采集中断。')
    throw new Error('AUTH_REQUIRED')
  }
  // 防护：若仍是详情页（/job_detail/）而非搜索结果页，说明上一轮详情导航还没让位给本轮搜索页渲染，
  // 此时 a[href*=job_detail] 命中的是详情页“相关职位”，会产生脏标题（如「职位搜索」）。
  if (/job_detail/.test(st.url)) {
    if (navUrl) {
      console.warn(`[crawler] 当前页仍是详情页，疑似上轮导航未让位。重新跳转搜索页并重试：${keyword || ''}`)
      await cdp.send('Page.navigate', { url: navUrl })
      await sleep(2000)
    } else {
      console.warn('[crawler] 当前页是详情页而非搜索结果页，手动模式下请先翻到搜索结果页再收割。')
      return
    }
  }
  // 优先走 API-first 采集，绕过 DOM 稳定性问题
  const apiRes = await crawlViaApiCDPAllPages(cdp, keyword, navUrl, searchRoleName, searchCityName)
  if (apiRes.count > 0) {
    console.log(`[crawler] API-first 采集成功：${apiRes.count} 张卡片，data.length=${apiRes.data.length}`)
    const { importJobs } = await import('./importer.js')
    let inserted = 0
    let updated = 0
    for (const c of apiRes.data) {
      console.log(`[crawler] 处理卡片: ${c.title} / ${c.company} / ${c.location}`)
      const r = importJobs(db, [{
        title: c.title,
        company: c.company,
        raw: c.raw || '',
        extracted: c.extracted || '',
        location: searchCityName,
        role: searchRoleName,
        search_role: searchRoleName,
        status: 'collected',
        salary: c.salary || '',
        experience: c.experience || '',
        education: c.education || ''
      }])
      console.log(`[crawler] importJobs 返回: ${r.action} (id=${r.id})`)
      inserted += r.inserted || 0
      updated += r.updated || 0
    }
    console.log(`[crawler] API 入库 ${inserted} / 更新 ${updated}`)
    RUN_NEW += inserted
    RUN_UPDATED += updated
    return apiRes
  }
  console.warn('[crawler] API-first 采集失败或 0 结果，回退到 DOM 采集')
  await waitCardsCDP(cdp)
  // 滚动触发懒加载（Boss 用虚拟滚动，首屏只有部分卡片在 DOM 中）
  await scrollToLoadCDP(cdp)
  const res = await scrapeViaCDP(cdp)
  console.log(`[crawler] scrapeViaCDP 返回:`, JSON.stringify(res).slice(0, 200))
  console.log(`[crawler] 解析到 ${res.count} 张卡片${keyword ? `（关键词「${keyword}」）` : ''}`)
  if (res.count === 0) {
    const snippet = await cdp.evaluate(`(() => document.body ? document.body.innerHTML.slice(0, 1500) : '')()`)
    console.warn('[crawler] 0 卡片，页面片段（用于校准选择器）：\n' + snippet)
    console.log('[crawler][harvest] 出口：0 卡片')
    return
  }
  let inserted = 0
  let updated = 0
  const { importJobs } = await import('./importer.js')
  for (const c of res.data) {
    // 单行"公司+职位+招聘"污染监控：正常职位名不会以"招聘"结尾。
    // 暂不硬切（无真实样本，纯规则误切风险高），仅告警暴露，待真机出现时据样本定切分规则。
    if (c.title && c.title.endsWith('招聘')) {
      const msg = `[单行污染] title 以"招聘"结尾，疑似"公司+职位+招聘"未切分：${c.title}`
      ALERTS.push(msg)
      console.warn(`[crawler] ⚠ 潜在单行污染 title=${JSON.stringify(c.title)}（company=${JSON.stringify(c.company)}），请反馈样本以定切分规则`)
    }
    const raw = await scrapeDetailCDP(cdp, c.detailHref)
    // DOM fallback：薪资为加密文本，API 已返回明文，此处仅保留原始值
    // DOM fallback：加密薪资文本不写入 salary，避免污染
    const salary = null
    const r = importJobs(db, [
      {
        title: c.title,
        company: c.company,
        raw: raw || c.detailHref,
        location: searchCityName,
        role: searchRoleName,
        search_role: searchRoleName,
        status: 'collected',
        salary,
        salary_raw: salaryRaw,
      }
    ])
    inserted += r.action === "inserted" ? 1 : 0
    updated += r.action === "updated" ? 1 : 0
    await sleep(1500) // 详情页之间的轻量限速（真实 Chrome，别太狠）
  }
  console.log(`[crawler] 入库 ${inserted} / 更新 ${updated}`)
  RUN_NEW += inserted
  RUN_UPDATED += updated
}

async function runCDP() {
  fontDumpSeq = 0 // 每次抓取重置落盘序号，避免与上次 run 的文件混淆
  resetRunCounters()
  capturedFonts = new Map()
  pendingFontReqs = new Map()
  console.log('[crawler] 连接本机真实 Chrome（CDP 127.0.0.1:9222）…')

  const onEventRef = { fn: null }
  let cdp = null
  onEventRef.fn = (method, params) => {
    if (method === 'Network.responseReceived') {
      const u = params.response?.url || ''
      const mime = params.response?.mimeType || ''
      if (/\.(woff2?|ttf|otf)(\?|$)/i.test(u) || /font/i.test(mime)) {
        pendingFontReqs.set(params.requestId, { url: u, mimeType: mime })
      }
    } else if (method === 'Network.loadingFinished') {
      const rec = pendingFontReqs.get(params.requestId)
      if (!rec) return
      pendingFontReqs.delete(params.requestId)
      cdp.send('Network.getResponseBody', { requestId: params.requestId }).then((r) => {
        if (r && r.body) {
          try {
            const buf = Buffer.from(r.body, r.base64 ? 'base64' : 'binary')
            if (buf.length > 0) capturedFonts.set(rec.url, buf)
          } catch {}
        }
      }).catch(() => {})
    }
  }

  // 建立/重建页面 CDP 连接：目标丢失（navigated or closed / target closed）时复用此函数
  // 重建，而非整轮放弃。字体捕获用的是模块级 capturedFonts/pendingFontReqs，重建不清空。
  async function connect() {
    if (cdp) { try { cdp.close() } catch {} }
    const target = await findOrCreateTarget()
    if (!target.webSocketDebuggerUrl) throw new Error('CDP 目标缺少 webSocketDebuggerUrl，请重启真实 Chrome。')
    cdp = await createCDP(target.webSocketDebuggerUrl, onEventRef)
    await cdp.ready
    await cdp.send('Runtime.enable')
    await cdp.send('Page.enable')
    // 启用网络拦截，捕获浏览器已鉴权下载的字体字节（解决 kanzhun-Regular 等 static.zhipin.com 字体 Node 无法复下载的问题）
    await cdp.send('Network.enable', { maxResourceBufferSize: 10 * 1024 * 1024, maxPostDataSize: 1024 * 1024 }).catch(() => {})
    // 若拿到的标签页还不是搜索页，或 URL 缺少 query/city 参数，先跳到第一个关键词
    const firstUrl = TARGETS[0]?.url
    const needsNav = !/zhipin\.com\/web\/geek\/jobs/.test(target.url || '') ||
                     !/query=/.test(target.url || '') ||
                     !/city=/.test(target.url || '')
    console.log('[crawler][connect] 当前页面 URL:', target.url)
    console.log('[crawler][connect] 是否需要导航:', needsNav)
    if (needsNav) {
      console.log('[crawler][connect] 导航到:', firstUrl)
      await cdp.send('Page.navigate', { url: firstUrl })
      await sleep(2000)
    }
    return cdp
  }

  // 目标丢失/执行上下文销毁类错误：此类错误重建连接后可恢复，应触发重试
  const isCtxErr = (m) => /navigated or closed|Execution context|context.*destroyed|Target closed|Connection closed|detached/i.test(m || '')

  // ── 连接 + 登录阶段：目标丢失/上下文销毁时重建连接重试（最多 3 次）──
  // 这是此前「主流程异常 + 0/0」的主因——登录期 evaluate 被 Boss 反爬踢页后直接冒泡到顶层。
  let loginOk = false
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await connect()
      const loginResult = await ensureLoginCDP(cdp);
      if (loginResult === 'AUTH_REQUIRED') {
        console.warn('[crawler] 检测到未登录，AUTH_REQUIRED，退出采集。');
        ALERTS.push('AUTH_REQUIRED：Boss 登录态失效，需要人工重新登录。');
        throw new Error('AUTH_REQUIRED');
      }
      if (loginResult === true) {
        loginOk = true;
        break;
      }
      // ensureLoginCDP 返回 false = 用户主动放弃登录，非瞬态错误，不再重试
      console.warn('[crawler] 未登录，退出采集。')
      return
    } catch (e) {
      console.warn(`[crawler] 连接/登录阶段异常（第 ${attempt}/3 次）：${e.message}`)
      if (attempt === 3) { try { cdp?.close?.() } catch {}; throw e }
      await sleep(2500)
    }
  }
  if (!loginOk) {
    console.error('[crawler] 连接后登录校验失败，退出采集。')
    ALERTS.push('AUTH_REQUIRED：连接后检测到未登录态，请重新登录 Boss。')
    throw new Error('AUTH_REQUIRED')
  }

  if (MANUAL) {
    console.log('\n[crawler] 手动模式：在真实 Chrome 里自己翻到某个关键词的搜索结果页，准备好后按 Enter 收割当前页；输入 q 回车退出。')
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const ask = () =>
      new Promise((res) => rl.question('[crawler] 按 Enter 收割当前页（q 退出）：', (a) => res((a || '').trim().toLowerCase())))
    while (true) {
      const cmd = await ask()
      if (cmd === 'q') break
      try {
        await harvestCDP(cdp, '', '', selectedRole.name, selectedCity.name)
      } catch (e) {
        // 手动模式单次收割失败：目标丢失时重建连接后重试一次，否则记告警不中断
        if (isCtxErr(e.message)) {
          console.warn('[crawler] 收割时目标丢失，重建连接后重试一次…')
          try {
            await connect()
            await harvestCDP(cdp, '', '', selectedRole.name, selectedCity.name)
          } catch (e2) {
            const msg = '手动收割失败：' + e2.message
            console.warn(`[crawler][ALERT] ${msg}`); ALERTS.push(msg)
          }
        } else {
          const msg = '手动收割失败：' + e.message
          console.warn(`[crawler][ALERT] ${msg}`); ALERTS.push(msg)
        }
      }
    }
    rl.close()
  } else {
    const urls = TARGETS
    console.log(`[crawler] 开始轮询 ${urls.length} 个搜索（${_matrixRoles.length} 角色 × ${_matrixCities.length} 城市）…`)
    for (let i = 0; i < urls.length; i++) {
      const { keyword, url, role, city } = urls[i]
      let failed = null
      try {
        console.log(`[crawler][loop] 开始第 ${i+1}/${urls.length} 个搜索：${keyword} @ ${city}`)
        await cdp.send('Page.navigate', { url })
        console.log(`[crawler][loop] 导航完成：${keyword}`)
        await sleep(1500)
        console.log(`[crawler][loop] 开始 harvest：${keyword}`)
        await harvestCDP(cdp, keyword, url, role, city)
        console.log(`[crawler][loop] harvest 完成：${keyword}`)
      } catch (e) {
        console.error(`[crawler][loop] 第 ${i+1} 个搜索异常：`, e?.message || e)
        failed = e
      }
      if (failed) {
        // 导航竞态（执行上下文被销毁）时，先同连接下重导航重试；仍失败（目标真关了）
        // 则重建 CDP 连接再试一次，避免整轮 0 卡片。
        if (isCtxErr(failed.message)) {
          try {
            await sleep(2000)
            await cdp.send('Page.navigate', { url })
            await sleep(2000)
            await harvestCDP(cdp, keyword, url, role, city)
            failed = null
          } catch (e2) {
            if (isCtxErr(e2.message)) {
              try {
                console.warn(`[crawler] 关键词「${keyword}」目标可能已关闭，重建 CDP 连接后重试…`)
                await connect()
                await cdp.send('Page.navigate', { url })
                await sleep(2000)
                await harvestCDP(cdp, keyword, url, role, city)
                failed = null
              } catch (e3) { failed = e3 }
            } else {
              failed = e2
            }
          }
        }
        if (failed) {
          const msg = `关键词「${keyword}」抓取失败：${failed.message}`
          console.warn(`[crawler][ALERT] ${msg}`)
          ALERTS.push(msg)
        }
      }
      const delay = await limiter.wait()
      console.log(`[crawler] 限速等待 ${delay}ms`)
    }
  }
  cdp.close()
  printAlerts()
}

// ─────────────────────────────────────────────────────────────────────────────
// Playwright 自带 Chromium 兜底路径（fragile，Boss 易识别，仅 --launch 时启用）
// ─────────────────────────────────────────────────────────────────────────────
const STEALTH_ARGS = ['--disable-blink-features=AutomationControlled', '--disable-infobars', '--no-sandbox']
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

async function detectRisk(page) {
  const signals = ['.captcha', '.verify-wrap', 'input[name="verify"]', 'text=请完成安全验证', 'text=滑动验证']
  for (const s of signals) {
    try {
      if (await page.locator(s).first().count()) return true
    } catch {
      /* 忽略选择器异常 */
    }
  }
  if (page.url().includes('/login') || page.url().includes('_security_check')) return true
  return false
}

async function isLoggedIn(page) {
  const url = page.url()
  if (!url.includes('zhipin.com')) return false
  const loginBtn = page.locator('a,button').filter({ hasText: '登录' }).first()
  const hasLogin = (await loginBtn.count()) > 0 && (await loginBtn.isVisible().catch(() => false))
  return !hasLogin && !url.includes('_security_check')
}

async function scrapeSearchPage(page) {
  return page.locator('a[href*="job_detail"]').evaluateAll((links) => {
    const cards = []
    const seen = new Set()
    for (const a of links) {
      const href = a.getAttribute('href') || ''
      if (href.includes('securityId')) continue
      if (!/job_detail\//.test(href)) continue
      // title 只取首个非空行（Boss 标题链接常含整张卡片文本）
      const titleLines = (a.textContent || '').split('\n').map((s) => s.trim()).filter(Boolean)
      const title = titleLines[0] || ''
      if (!title) continue
      if (new RegExp('职位搜索|职位详情|BOSS直聘|立即登录|登录/注册|查看更多|查看全部').test(title)) continue
      let card = a
      while (card && card !== document.body) {
        if (card.querySelector && card.querySelector('a[href*="gongsi"]')) break
        card = card.parentElement
      }
      // 公司：过滤「查看全部/查看更多」等推广/导航链接
      const gongsiLinks = card ? Array.from(card.querySelectorAll('a[href*="gongsi"]')) : []
      const companyLink = gongsiLinks.find((el) => {
        const t = (el.textContent || '').trim()
        return t && !/查看全部|查看更多|查看职位/.test(t)
      })
      const company = companyLink ? companyLink.textContent.trim() : ''
      if (seen.has(href)) continue
      seen.add(href)
      cards.push({ title, company, detailHref: href })
    }
    return cards
  })
}

async function scrapeDetail(page, href) {
  if (!href) return ''
  try {
    await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 30000 })
  } catch (e) {
    if (/browser has been closed|Connection closed|Target closed/i.test(e.message)) throw e
    ALERTS.push(`详情页跳转失败（${href}）：${e.message}`)
    return ''
  }
  if (await detectRisk(page)) {
    ALERTS.push(`详情页触发风控：${href}`)
    return ''
  }
  const raw = await page.locator('.job-detail, .text, .description').first().textContent().catch(() => '')
  return (raw || '').trim()
}

async function harvestCurrentPage(page, searchRoleName = selectedRole.name, searchCityName = selectedCity.name) {
  if (await detectRisk(page)) {
    console.warn('[crawler] 当前页疑似风控/登录墙，跳过。')
    return
  }
  await page.waitForTimeout(2000).catch(() => {})
  await page.waitForSelector('a[href*="job_detail"], .job-card-wrapper', { timeout: 15000 }).catch(() => {})
  const cards = await scrapeSearchPage(page)
  console.log(`[crawler] 解析到 ${cards.length} 张卡片`)
  const { importJobs } = await import('./importer.js')
  let inserted = 0
  let updated = 0
  for (const c of cards) {
    // 单行"公司+职位+招聘"污染监控：正常职位名不会以"招聘"结尾。
    // 暂不硬切（无真实样本，纯规则误切风险高），仅告警暴露，待真机出现时据样本定切分规则。
    if (c.title && c.title.endsWith('招聘')) {
      const msg = `[单行污染] title 以"招聘"结尾，疑似"公司+职位+招聘"未切分：${c.title}`
      ALERTS.push(msg)
      console.warn(`[crawler] ⚠ 潜在单行污染 title=${JSON.stringify(c.title)}（company=${JSON.stringify(c.company)}），请反馈样本以定切分规则`)
    }
    const raw = await scrapeDetail(page, c.detailHref)
    const r = importJobs(db, [{ title: c.title, company: c.company, raw, location: searchCityName, role: searchRoleName, search_role: searchRoleName, status: 'collected' }])
    inserted += r.action === "inserted" ? 1 : 0
    updated += r.action === "updated" ? 1 : 0
    await limiter.wait()
  }
  console.log(`[crawler] 入库 ${inserted} / 更新 ${updated}`)
  RUN_NEW += inserted
  RUN_UPDATED += updated
}

async function waitForLogin(page) {
  await page.goto(buildSearchUrl('AI Agent前端'), { waitUntil: 'domcontentloaded' }).catch(() => {})
  if (await isLoggedIn(page)) {
    console.log('[crawler] 当前已是登录态，继续。')
    return
  }
  console.log('[crawler] 请在浏览器中手动登录 Boss（扫码/手机号）。')
  console.log('[crawler] 登录成功后（页头「登录」按钮消失）自动继续；若迟迟未触发，登录后输入 y 回车也可继续。')
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const autoLogin = page
    .waitForFunction(
      () => {
        const hasLogin = Array.from(document.querySelectorAll('a,button')).some(
          (el) => (el.textContent || '').trim() === '登录'
        )
        const sec = location.href.includes('_security_check')
        return !hasLogin && !sec
      },
      { timeout: 0, polling: 1000 }
    )
    .then(() => true)
    .catch(() => false)
  const manualLogin = new Promise((res) => {
    rl.question('[crawler] 已登录? 输入 y 回车继续：', () => res(true))
  })
  await Promise.race([autoLogin, manualLogin])
  rl.close()
  console.log('[crawler] 登录态已就绪。')
}

async function runLaunch() {
  resetRunCounters()
  const { chromium } = await import('playwright')
  console.log('[crawler] 启动 Playwright Chromium（反指纹模式，fragile）…')
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    userAgent: UA,
    viewport: { width: 1366, height: 768 },
    args: STEALTH_ARGS
  })
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false })
    try {
      delete window.__playwright
    } catch {}
    try {
      delete window.__pw_manual
    } catch {}
  })
  const page = await context.newPage()
  await waitForLogin(page)

  if (MANUAL) {
    console.log('\n[crawler] 手动模式：在浏览器里自己翻到某个关键词的搜索结果页，准备好后按 Enter 收割当前页；输入 q 回车退出。')
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const ask = () =>
      new Promise((res) => rl.question('[crawler] 按 Enter 收割当前页（q 退出）：', (a) => res((a || '').trim().toLowerCase())))
    while (true) {
      const cmd = await ask()
      if (cmd === 'q') break
      await harvestCurrentPage(page, selectedRole.name, selectedCity.name)
    }
    rl.close()
  } else {
    const targets = TARGETS
    console.log(`[crawler] 开始轮询 ${targets.length} 个搜索（${_matrixRoles.length} 角色 × ${_matrixCities.length} 城市）…`)
    for (let i = 0; i < targets.length; i++) {
      const { keyword, url, role, city } = targets[i]
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
        if (await detectRisk(page)) {
          const msg = `关键词「${keyword}」触发风控，降级到手动导入（§9.5）`
          console.warn(`[crawler][ALERT] ${msg}`)
          ALERTS.push(msg)
          const delay = await limiter.backoff(i)
          console.log(`[crawler] 风控退避 ${delay}ms`)
          continue
        }
        await harvestCurrentPage(page, role, city)
        const delay = await limiter.wait()
        console.log(`[crawler] 限速等待 ${delay}ms`)
      } catch (e) {
        if (/browser has been closed|context or browser has been closed|Connection closed|Target closed/i.test(e.message)) {
          console.warn('[crawler] 浏览器已关闭/断开，终止爬取。')
          await context.browser().close().catch(() => {})
          process.exit(0)
        }
        const msg = `关键词「${keyword}」抓取失败，降级手动导入：${e.message}`
        console.warn(`[crawler][ALERT] ${msg}`)
        ALERTS.push(msg)
        const delay = await limiter.backoff(i)
        console.log(`[crawler] 异常退避 ${delay}ms`)
      }
    }
  }
  await context.browser().close()
  printAlerts()
}

function printAlerts() {
    // 薪资解密已迁移到 API-first 采集，直接使用明文字段
  if (ALERTS.length) {
    console.warn(`\n[crawler] 本次共 ${ALERTS.length} 条告警（风控/异常/薪资校验），看板应展示状态灯：`)
    ALERTS.forEach((a) => console.warn('  - ' + a))
  } else {
    console.log('\n[crawler] 完成，无告警。')
  }
  // 注意：crawl_runs 写入已移至 main() 的 finally（recordCrawlRun），此处不再重复写。
}

// 收尾写一条 crawl_runs 记录，供后端 /api/health 派生看板状态灯。
// 由 main() 的 finally 统一调用（无论正常结束还是中途异常都会写一条），不再静默吞异常。
function recordCrawlRun(mode) {
  try {
    db.prepare(
      `INSERT INTO crawl_runs (mode, status, keywords_total, jobs_new, jobs_updated, salary_decoded, salary_attempted, salary_lowconf, alerts_count, alerts_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      mode,
      ALERTS.length ? 'warn' : 'ok',
      TARGETS.length,
      RUN_NEW,
      RUN_UPDATED,
      ALERTS.length,
      JSON.stringify(ALERTS)
    )
    console.log(`[crawler] 已记录采集运行（状态=${ALERTS.length ? 'warn' : 'ok'}，新${RUN_NEW}/更${RUN_UPDATED}）`)
  } catch (e) {
    // 仍不阻断主流程，但必须暴露错误（之前静默吞掉导致 crawl_runs 恒空却无感知）
    console.error('[crawler][ERROR] 写入 crawl_runs 失败：' + (e?.stack || e?.message || e))
    ALERTS.push('写入 crawl_runs 失败：' + (e?.message || e))
  }
}

// ── 采集后自动流水线（Phase E 落地）──
// 采集成功后自动顺序跑：增量分析 → 技能归一 → 市场报告。
// 让 `npm run crawl` 一步到位（crawl 完即分析），无需手动接三步。
// 跳过方式：crawl 加 --no-pipeline。
export async function runPostCrawlPipeline() {
  console.log('\n[crawler-pipeline] 采集完成，启动后续分析流水线（analyze-all → rebuild-skills → report）')
  // crawler 自身不读 .env，但子进程 analyze 需要智谱 key：这里补一次（仅当 env 未设时）
  loadDotEnv()
  const env = { ...process.env }
  // 固定防 429 默认值：除非用户已在 env 显式设置更高并发/间隔
  // REQUEST_DELAY_MS 默认 6000（智谱低配账户 RPM 极严），analyze 内部还有自适应退避兜底
  if (!env.OPENAI_CONCURRENCY) env.OPENAI_CONCURRENCY = '1'
  if (!env.REQUEST_DELAY_MS) env.REQUEST_DELAY_MS = '6000'
  const node = process.execPath // 复用当前 node 22，避免 nvm 解析问题
  const backendDir = dirname(__dirname) // backend/ （__dirname 为 backend/src）
  const steps = [
    { label: '增量分析 analyze-all', args: ['src/analyze.js', '--analyze-all'] },
    { label: '技能归一 rebuild-skills', args: ['src/analyze.js', '--rebuild-skills'] },
    { label: '角色归一+岗族 rebuild-role', args: ['src/analyze.js', '--rebuild-role'] },
    { label: '市场报告 analyze-report.mjs', args: ['src/analyze-report.mjs'] },
  ]
  for (const step of steps) {
    console.log(`\n[crawler-pipeline] ▶ ${step.label} ...`)
    const code = await spawnAsync(node, step.args, { cwd: backendDir, env })
    if (code === 0) {
      console.log(`[crawler-pipeline] ✓ ${step.label} 完成`)
    } else {
      // 非致命：任一步失败不阻断后续（例如 analyze 部分 429 失败仍要 rebuild/report）
      console.warn(`[crawler-pipeline] ⚠ ${step.label} 退出码 ${code}（非致命，继续下一步）`)
      ALERTS.push(`pipeline: ${step.label} 退出码 ${code}`)
    }
  }
  console.log('\n[crawler-pipeline] 全流程结束。')
}

function spawnAsync(node, args, opts) {
  return new Promise((resolve) => {
    const p = spawn(node, args, { ...opts, stdio: 'inherit' })
    p.on('error', (err) => {
      console.error('[crawler-pipeline] spawn 失败:', err.message)
      resolve(1)
    })
    p.on('close', (code) => resolve(code ?? 1))
  })
}

async function main() {
  const mode = USE_LAUNCH ? 'launch' : 'CDP'
  let crawlOk = true
  try {
    if (USE_LAUNCH) await runLaunch()
    else await runCDP()
  } catch (e) {
    crawlOk = false
    console.error('[crawler] 主流程异常：', e?.stack || e)
    ALERTS.push('主流程异常：' + (e?.message || e))
  } finally {
    // 无论正常/异常都写一条 crawl_runs，保证健康灯有数据
    try { recordCrawlRun(mode) } catch { /* recordCrawlRun 内部已处理 */ }
    // 采集主流程成功且未禁用 pipeline 时，自动接分析流水线（crawl 完即分析）
    if (crawlOk && !process.argv.includes('--no-pipeline')) {
      await runPostCrawlPipeline()
    }
  }
}

main().catch((e) => {
  console.error('[crawler] 致命错误:', e)
  process.exit(1)
})
