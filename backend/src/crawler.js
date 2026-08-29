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
import { buildSearchUrl, buildSearchUrls, resolveRole, resolveCity } from './search-templates.js'
import { ensureSalaryColumns } from './importer.js'
import { ensureNormalizedSchema, backfillNormalized, backfillScope } from './migrate.js'
import { prepareDecoder, findReferenceFonts } from './font-decrypt.js'
import { loadDotEnv } from './analyze.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..', '..')
const dataDir = join(root, 'data')
const PROFILE_DIR = join(dataDir, 'boss_profile')
mkdirSync(dataDir, { recursive: true })
mkdirSync(PROFILE_DIR, { recursive: true })

const db = new DatabaseSync(join(dataDir, 'jobs.db'))
db.exec(readFileSync(join(dataDir, 'schema.sql'), 'utf-8'))
ensureSalaryColumns(db) // 补齐薪资解密列（已存在的库）
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

// 合法薪资形态判定（模块级，buildPageDecoder 与 harvestCDP 共用）：
// 含真实数字 + 含单位(K/万/元) + 无残留 PUA（解密失败）。
function looksLikeSalary(s) {
  if (!s) return false
  if (/[\uE000-\uF8FF]/.test(s)) return false // 残留 PUA 私有区 → 解密失败
  if (!/\d/.test(s)) return false // 必须含真实数字
  if (!/[Kk万¥元￥]/.test(s)) return false // 必须含单位
  return true
}

// 薪资解密置信度阈值（Salary 校验 SOP，见 docs/Salary_Validation_SOP.md）：
//   < RED(0.7)     → 红：低置信，需重跑 --font-dump / --font-test 复核
//   < YELLOW(0.85) → 黄：可置信但建议抽检（近似字形 6/8、7/8 风险区）
//   ≥ YELLOW       → 绿：轮廓法高可信
// 数据依据：真实库置信度分布 0.77–0.9，原路线图 <0.6 在当前数据下恒为 0（失效），故据实上调。
const SALARY_CONF_RED = 0.7
const SALARY_CONF_YELLOW = 0.85
const SALARY_LOWCNF_WARN_RATE = 0.1 // 低置信占比超 10% 即告警（对齐 Phase4 健康指标）

// 单次运行累计计数器（供收尾写 crawl_runs，驱动看板状态灯）
let RUN_NEW = 0
let RUN_UPDATED = 0
let RUN_SALARY_DECODED = 0
let RUN_SALARY_ATTEMPTED = 0
let RUN_SALARY_LOWCONF = 0
function resetRunCounters() {
  RUN_NEW = RUN_UPDATED = RUN_SALARY_DECODED = RUN_SALARY_ATTEMPTED = RUN_SALARY_LOWCONF = 0
}
const DUMP_FONT = process.argv.includes('--font-dump') // 把命中的加密字体+样本存盘，供离线 --font-test 验证
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
  // 第二阶段：等职位卡片出现（至少 1 张）
  while (Date.now() - start < timeoutMs) {
    const n = await cdp.evaluate(`document.querySelectorAll('a[href*="job_detail"]').length`)
    if (n > 0) return n
    await sleep(700)
  }
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

async function scrapeViaCDP(cdp) {
  // 稳健抽取：不依赖 .job-card-wrapper（你的 Boss 布局用的是 div/li[data-v-xxxx]）。
  // 直接定位职位标题链接 a[href*="job_detail"]，向上找含公司链接的卡片容器，按 href 去重。
  return cdp.evaluate(`(() => {
    const titleLinks = Array.from(document.querySelectorAll('a[href*="job_detail"]'));
    const cards = [];
    const seen = new Set();
    for (const a of titleLinks) {
      const href = a.getAttribute('href') || '';
      if (href.includes('securityId')) continue;       // 跳过“查看更多信息”等带令牌的链接
      if (!/job_detail\\//.test(href)) continue;
      // title 来自职位标题链接；Boss 该链接 textContent 常含整张卡片文本（标题+薪资+公司+城市），
      // 故只取首个非空行作为真实标题，避免把薪资/公司/城市塞进 title。
      const titleLines = (a.textContent || '').split('\\n').map((s) => s.trim()).filter(Boolean)
      const title = titleLines[0] || ''
      if (!title) continue;
      if (new RegExp('职位搜索|职位详情|BOSS直聘|立即登录|登录/注册|查看更多|查看全部').test(title)) continue;  // 丢弃页面级脏标题
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
      // 薪资在卡片上、用加密字体渲染：取 .salary（或含 salary 类）元素的文本，得到的是 PUA 码点（待解密）
      const salaryEl = card ? card.querySelector('span.salary, [class*="salary"]') : null;
      const salaryEnc = salaryEl ? (salaryEl.textContent || '').trim() : '';
      if (seen.has(href)) continue;
      seen.add(href);
      cards.push({
        title,
        company,
        detailHref: href.startsWith('http') ? href : 'https://www.zhipin.com' + href,
        salaryEnc
      });
    }
    return { count: cards.length, data: cards, url: location.href };
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
// 薪资字体解密（§9.x）：页面 CSS/内联样式里找 kanzhun 加密字体 → 下载 → 解析 PUA→数字 映射
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
  const refs = findReferenceFonts()
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
      const dec = prepareDecoder(buf, refs)
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
async function loadRemoteFallbackDecoders(encryptedSample, refs) {
  const dir = join(dataDir, 'boss_fonts')
  let manifest = { fonts: [] }
  try { manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf-8')) } catch {}
  const urls = [...new Set((manifest.fonts || []).map(f => f.url).filter(Boolean))]
  const out = []
  const looksLikeSalary = (s) => {
    if (!s) return false
    if (/[\uE000-\uF8FF]/.test(s)) return false
    if (!/\d/.test(s)) return false
    if (!/[Kk万¥元￥]/.test(s)) return false
    return true
  }
  for (const url of urls) {
    try {
      const buf = Buffer.from(await (await fetch(url, { headers: { Referer: 'https://www.zhipin.com/', 'User-Agent': UA, Accept: '*/*' } })).arrayBuffer())
      const dec = prepareDecoder(buf, refs)
      if (dec.mapSize === 0) continue
      const decoded = encryptedSample ? dec.decode(encryptedSample) : ''
      const conf = encryptedSample ? dec.decodeConfidence(encryptedSample) : null
      if (encryptedSample && !looksLikeSalary(decoded)) continue
      out.push({ fn: `remote:${url.split('/').pop()}`, dec, conf: conf ?? -1, decoded })
    } catch {}
  }
  out.sort((a, b) => b.conf - a.conf)
  return out
}

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
async function buildPageDecoder(cdp, encryptedSample = '', keyword = '') {
  try {
  // 合法薪资形态判定：含真实数字 + 含单位(K/万/元) + 无残留 PUA（解密失败）。
  // 支持日薪「元/天」、月薪「元/月」、周薪「K」、年薪「万」等 Boss 全部形态。
  const looksLikeSalary = (s) => {
    if (!s) return false
    if (/[\uE000-\uF8FF]/.test(s)) return false // 残留 PUA 私有区 → 解密失败
    if (!/\d/.test(s)) return false // 必须含真实数字
    if (!/[Kk万¥元￥]/.test(s)) return false // 必须含单位
    return true
  }
  // 薪资元素真实使用的 font-family（用于优先匹配正确字体）
    const salaryFontFamily = await cdp.evaluate(
      `(() => { const el = document.querySelector('.salary'); return el ? getComputedStyle(el).fontFamily : ''; })()`
    )
    // 收集外链 CSS（抓取后解析）+ 内联 <style>
    const cands = await getSalaryFontCandidates(cdp)
    const cssTexts = []
    const fallbackUrls = new Set()
    for (const c of cands) {
      if (c.startsWith('CSS:')) {
        try {
          const css = await (await fetch(c.slice(4))).text()
          cssTexts.push(css)
          const re = /url\(\s*['"]?([^'")]+\.(?:woff2?|ttf))['"]?\s*\)/gi
          let m
          while ((m = re.exec(css))) {
            try { fallbackUrls.add(new URL(m[1], c.slice(4)).href) } catch {}
          }
        } catch {}
      } else if (c.startsWith('INLINE:')) {
        cssTexts.push(c.slice(7))
      }
    }
    // 解析 @font-face：family -> [urls]（含 data: 内联 base64 字体）
    const faceSet = new Map()
    const grabFace = (css) => {
      const re = /@font-face\s*\{([\s\S]*?)\}/g
      let m
      while ((m = re.exec(css))) {
        const body = m[1]
        const fam = (body.match(/font-family:\s*([^;]+)/) || [])[1]
        const src = (body.match(/src:\s*([^;]+)/) || [])[1] || ''
        const urls = [...src.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)].map((x) => x[1])
        if (fam) {
          const key = fam.trim().replace(/^['"]|['"]$/g, '')
          const list = faceSet.get(key) || []
          for (const u of urls) list.push(u)
          faceSet.set(key, list)
        }
      }
    }
    for (const css of cssTexts) grabFace(css)
    const salaryFam = (salaryFontFamily || '').split(',')[0].trim().replace(/^['"]|['"]$/g, '').toLowerCase()
    const isSalaryFace = (fam) => salaryFam && (fam || '').toLowerCase().includes(salaryFam)
    // 候选排序：薪资元素字体优先(pri0) > 其他 @font-face(pri1) > 兜底 url(pri2)
    const ordered = []
    for (const [fam, urls] of faceSet) {
      const pri = isSalaryFace(fam) ? 0 : 1
      for (const u of urls) ordered.push({ pri, fam, url: u })
    }
    for (const u of fallbackUrls) ordered.push({ pri: 2, fam: '', url: u })
    ordered.sort((a, b) => a.pri - b.pri)
    console.log(`[salary] 薪资元素 font-family=${salaryFontFamily || '(无)'}；候选字体 ${ordered.length} 个`)
    if (ordered.length === 0) {
      console.warn('[salary] 未在页面字体中找到 PUA 映射，薪资留空（如需排查可加 --font-dump）')
      return null
    }
    const fetchBuf = async (url) => {
      if (url.startsWith('data:')) {
        const b64 = url.slice(url.indexOf('base64,') + 7)
        return Buffer.from(b64, 'base64')
      }
      // 优先用 CDP 捕获的浏览器已下载字体（最权威，绕开 Referer 限制）
      if (capturedFonts.has(url)) return capturedFonts.get(url)
      const base = url.split('?')[0].split('/').pop() // @font-face URL 与实际网络 URL 可能仅 query 不同
      for (const [u, buf] of capturedFonts) {
        if (u.split('?')[0].split('/').pop() === base) return buf
      }
      // 兜底：Node 重新下载（带 Referer，static.zhipin.com 需同源 Referer 才放行）
      try {
        return Buffer.from(
          await (await fetch(url, { headers: { Referer: 'https://www.zhipin.com/', 'User-Agent': UA, Accept: '*/*' } })).arrayBuffer()
        )
      } catch (e) {
        throw new Error(`下载失败 ${url}: ${e.message}`)
      }
    }
    let chosen = null
    const dumped = []
    let lastErr = ''
    for (const { fam, url } of ordered) {
      try {
        const buf = await fetchBuf(url)
        const dec = prepareDecoder(buf)
        if (dec.mapSize === 0) { lastErr = `字体 ${fam || url} 无 PUA 映射`; continue }
        const decoded = encryptedSample ? dec.decode(encryptedSample) : ''
        const ok = looksLikeSalary(decoded)
        const conf = encryptedSample ? dec.decodeConfidence(encryptedSample) : null
        console.log(
          `[salary] 候选 font=${fam || '(未知)'} 方法=${dec.method} 映射数=${dec.mapSize} decode=${decoded ? JSON.stringify(decoded) : '(无样本)'} 置信=${conf == null ? '-' : conf.toFixed(2)} ${ok ? '✓命中' : ''}`
        )
        if (DUMP_FONT) {
          const dir = join(dataDir, 'boss_fonts')
          mkdirSync(dir, { recursive: true })
          const slug = (keyword || 'page').replace(/[^A-Za-z0-9一-鿿-]/g, '_').slice(0, 24)
          const fn = join(dir, `font_${String(fontDumpSeq++).padStart(3, '0')}_${slug}.bin`)
          writeFileSync(fn, buf)
          dumped.push({ file: fn, family: fam, url, method: dec.method, mapSize: dec.mapSize, decodedSample: decoded, confidence: conf })
        }
        if (!chosen && (ok || !encryptedSample)) { chosen = dec; chosen.lastConfidence = conf }
        if (ok) { chosen = dec; chosen.lastConfidence = conf; break }
      } catch (e) {
        lastErr = `字体 ${fam || url} 获取失败：${e.message}`
        if (DUMP_FONT) console.warn(`[salary] 候选字体获取失败：${fam || '(未知)'} ${url} -> ${e.message}`)
      }
    }
    if (DUMP_FONT && dumped.length) {
      // manifest 跨关键词累积，避免后一个关键词覆盖前一个的落盘记录
      const mPath = join(dataDir, 'boss_fonts', 'manifest.json')
      let all = []
      if (existsSync(mPath)) {
        try {
          all = JSON.parse(readFileSync(mPath, 'utf-8')).fonts || []
        } catch {}
      }
      all = all.concat(dumped)
      writeFileSync(mPath, JSON.stringify({ salaryFontFamily, chosenMethod: chosen ? chosen.method : null, fonts: all }, null, 2))
      writeFileSync(
        join(dataDir, 'salary_sample.json'),
        JSON.stringify(
          { salaryFontFamily, method: chosen ? chosen.method : null, encryptedSample, decodedSample: chosen && encryptedSample ? chosen.decode(encryptedSample) : '' },
          null,
          2
        )
      )
      console.log(`[salary] 已落盘 ${dumped.length} 个字体到 data/boss_fonts/（manifest 累计 ${all.length} 个）+ salary_sample.json（可离线 node src/analyze.js --font-test 校验）`)
    }
    if (!chosen) {
      // 本地离线字体兜底
      const offs = loadOfflineDecoders()
      let bestOff = null
      for (const { fn, dec } of offs) {
        if (encryptedSample) {
          const decoded = dec.decode(encryptedSample)
          const conf = dec.decodeConfidence(encryptedSample)
          if (looksLikeSalary(decoded) && (conf == null || conf >= SALARY_CONF_RED)) {
            if (!bestOff || (conf ?? -1) > (bestOff.lastConfidence ?? -1)) bestOff = { dec, lastConfidence: conf, decoded }
          }
        } else {
          if (!bestOff) bestOff = { dec, lastConfidence: null, decoded: '' }
          break
        }
      }
      if (bestOff) {
        chosen = bestOff.dec
        chosen.lastConfidence = bestOff.lastConfidence
        console.log(`[salary] 离线字体兜底命中置信最高：${bestOff.decoded}（置信 ${bestOff.lastConfidence == null ? '-' : bestOff.lastConfidence.toFixed(2)}）`)
      }
    }
    if (!chosen) {
      // 在线字体二次兜底：本地 .bin 均失败时，按 manifest URL 下载原始字体重试。
      // 该 fallback 必须在 buildPageDecoder 的 try 块内，可访问 encryptedSample / looksLikeSalary。
      const refs = findReferenceFonts()
      const remotes = await loadRemoteFallbackDecoders(encryptedSample, refs)
      if (remotes.length) {
        chosen = remotes[0].dec
        chosen.lastConfidence = remotes[0].conf
        console.log(`[salary] 在线字体兜底命中：${remotes[0].decoded}（置信 ${remotes[0].conf == null ? '-' : remotes[0].conf.toFixed(2)}）`)
      }
    }
    if (!chosen) {
      console.warn('[salary] 候选字体均未解出合法薪资形态，薪资留空' + (lastErr ? `（最后错误：${lastErr}）` : '') + (DUMP_FONT ? '；已落盘供排查' : '（如需排查可加 --font-dump）'))
      return null
    }
    return chosen
  } catch (e) {
    console.warn('[salary] 解密准备失败：' + e.message)
    return null
  }
}

async function harvestCDP(cdp, keyword = '', navUrl = '', searchRoleName = selectedRole.name, searchCityName = selectedCity.name) {
  const st = await cdp.evaluate(`(() => ({ url: location.href }))()`)
  if (/_security_check|zhipin\.com\/web\/geek\/login/.test(st.url)) {
    console.warn('[crawler] 当前页是登录墙/安全校验，跳过。')
    return
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
  await waitCardsCDP(cdp)
  // 滚动触发懒加载（Boss 用虚拟滚动，首屏只有部分卡片在 DOM 中）
  await scrollToLoadCDP(cdp)
  const res = await scrapeViaCDP(cdp)
  console.log(`[crawler] 解析到 ${res.count} 张卡片${keyword ? `（关键词「${keyword}」）` : ''}`)
  if (res.count === 0) {
    const snippet = await cdp.evaluate(`(() => document.body ? document.body.innerHTML.slice(0, 1500) : '')()`)
    console.warn('[crawler] 0 卡片，页面片段（用于校准选择器）：\n' + snippet)
    return
  }
  // 本页建一次解码器（字体通常整页共用），首个带薪资的卡片作为离线落盘样本
  const firstEnc = res.data.find((c) => c.salaryEnc)?.salaryEnc || ''
  const decoder = await buildPageDecoder(cdp, firstEnc, keyword)
  let sampleLogged = false
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
    // raw 取详情页 JD 文本；抓不到时退化为详情链接（保证入库非空，后续可再补全）
    let salary = null
    // 根因修复：无论当页解码器是否成功，均先保留加密原文 salary_raw。
    // 旧逻辑把 salaryRaw=c.salaryEnc 写在 `if (decoder && c.salaryEnc)` 内，一旦 buildPageDecoder
    // 返回 null（当页未捕获到可用薪资字体），salary_raw 既不入库、薪资也丢失，且无法离线重解。
    // 现在先留原文，解码失败仅 salary 留空，后续可用离线字体(--font-dump 落盘)重解。
    let salaryRaw = c.salaryEnc || null
    let salaryConfidence = null
    if (decoder && c.salaryEnc) {
      RUN_SALARY_ATTEMPTED++
      const decoded = decoder.decode(c.salaryEnc)
      // 仅当解码出合法薪资形态才写入 salary 与置信度；否则 salary 保持 NULL，
      // 仅保留 salary_raw 供离线重解（避免未解密字形污染 salary 列且被误判高置信度）
      if (looksLikeSalary(decoded)) {
        salary = decoded
        salaryConfidence = typeof decoder.lastConfidence === 'number' ? decoder.lastConfidence : (decoder.method === 'outline' ? 1 : 0.5)
        RUN_SALARY_DECODED++
        // 低置信累计（红阈值）：供收尾告警与 crawl_runs 持久化
        if (typeof salaryConfidence === 'number' && salaryConfidence < SALARY_CONF_RED) RUN_SALARY_LOWCONF++
      }
      if (!sampleLogged) {
        console.log(`[salary] 样本解密：${salaryRaw} -> ${salary ?? '(未解出合法薪资，仅留 salary_raw)'}（method=${decoder.method}）`)
        sampleLogged = true
      }
    }
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
        salary_confidence: salaryConfidence
      }
    ])
    inserted += r.inserted
    updated += r.updated
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
    // 若拿到的标签页还不是 Boss 页面（如刚建的空白页），先跳到第一个关键词
    const firstUrl = TARGETS[0]?.url
    if (!/zhipin\.com/.test(target.url || '')) {
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
  if (!loginOk) return

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
        await cdp.send('Page.navigate', { url })
        await sleep(1500)
        await harvestCDP(cdp, keyword, url, role, city)
      } catch (e) {
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
    inserted += r.inserted
    updated += r.updated
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
  // 薪资校验 SOP：低置信占比超阈值即告警（独立于风控告警，置 warn 让看板状态灯转黄/红）
  if (RUN_SALARY_DECODED > 0) {
    const rate = RUN_SALARY_LOWCONF / RUN_SALARY_DECODED
    const msg = `[salary-audit] 低置信薪资 ${RUN_SALARY_LOWCONF}/${RUN_SALARY_DECODED}（占比 ${(rate * 100).toFixed(1)}%，红阈值<${SALARY_CONF_RED}）；超 ${SALARY_LOWCNF_WARN_RATE * 100}% 即需复核字体映射`
    if (rate > SALARY_LOWCNF_WARN_RATE) {
      console.warn('\n' + msg + ' ⚠️')
      ALERTS.push(msg)
    } else {
      console.log('\n' + msg + ' ✓')
    }
  }
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
      RUN_SALARY_DECODED,
      RUN_SALARY_ATTEMPTED,
      RUN_SALARY_LOWCONF,
      ALERTS.length,
      JSON.stringify(ALERTS)
    )
    console.log(`[crawler] 已记录采集运行（状态=${ALERTS.length ? 'warn' : 'ok'}，新${RUN_NEW}/更${RUN_UPDATED}，薪资解密 ${RUN_SALARY_DECODED}/${RUN_SALARY_ATTEMPTED}）`)
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
