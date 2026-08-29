import http from 'node:http'
import { WebSocket } from 'ws'

const listUrl = 'http://127.0.0.1:9222/json/list'
const listData = await new Promise((resolve, reject) => {
  http.get(listUrl, (res) => {
    const chunks = []
    res.on('data', (chunk) => chunks.push(chunk))
    res.on('end', () => resolve(Buffer.concat(chunks).toString()))
  }).on('error', reject)
})

const tabs = JSON.parse(listData)
const target = tabs.find(t => t.url && t.url.includes('zhipin.com/web/geek/jobs'))
if (!target) {
  console.error('未找到 Boss 标签页')
  process.exit(1)
}

console.log('Target:', target.url)

const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.on('open', resolve)
  ws.on('error', reject)
  setTimeout(() => reject(new Error('WS timeout')), 10000)
})

const send = (id, method, params = {}) =>
  new Promise((resolve) => {
    const handler = (raw) => {
      const msg = JSON.parse(raw.toString())
      if (msg.id === id) {
        ws.removeListener('message', handler)
        resolve(msg.result)
      }
    }
    ws.on('message', handler)
    ws.send(JSON.stringify({ id, method, params }))
  })

await send(1, 'Runtime.enable')

const checks = [
  'location.href',
  'document.title',
  'document.querySelectorAll(\'a[href*="job_detail"]\').length',
  'document.querySelectorAll(\'.job-card-wrapper\').length',
  'document.querySelector(\'.job-list-box\')?.className || null',
  'document.querySelector(\'.data-tips\')?.innerText?.trim() || null',
  'document.querySelector(\'.page-loading\')?.offsetParent !== null',
]

const results = {}
for (let i = 0; i < checks.length; i++) {
  try {
    const r = await send(10 + i, 'Runtime.evaluate', {
      expression: `(() => (${checks[i]}))()`,
      returnByValue: true,
      awaitPromise: true,
    })
    results[checks[i]] = r.result.value
  } catch (e) {
    results[checks[i]] = 'ERROR: ' + e.message
  }
}

console.log(JSON.stringify({
  url: results['location.href'],
  title: results['document.title'],
  job_links: results['document.querySelectorAll(\'a[href*="job_detail"]\').length'],
  job_cards: results['document.querySelectorAll(\'.job-card-wrapper\').length'],
  list_box: results['document.querySelector(\'.job-list-box\')?.className || null'],
  data_tips: results['document.querySelector(\'.data-tips\')?.innerText?.trim() || null'],
  loading_visible: results['document.querySelector(\'.page-loading\')?.offsetParent !== null'],
}, null, 2))

ws.close()
process.exit(0)
