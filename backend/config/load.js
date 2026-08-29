// config/load.js — 读取 crawler.yaml 并导出配置
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { load as yamlLoad } from 'js-yaml'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = join(__dirname, '..', '..')
const CONFIG_PATH = join(ROOT, 'backend', 'config', 'crawler.yaml')

let __config = null

export function loadCrawlerConfig() {
  if (__config) return __config

  const raw = readFileSync(CONFIG_PATH, 'utf-8')
  const data = yamlLoad(raw)
  if (!data || typeof data !== 'object') {
    throw new Error(`crawler.yaml 加载失败：${CONFIG_PATH}`)
  }

  // 兼容旧导出字段
  data.EXACT_KEYWORDS = data.roles?.[data.defaultRole]?.keywords || []
  data.CITY = data.defaultCity
  data.CITY_CODE = data.cities?.[data.defaultCity]?.code || ''

  // 暴露每城市每页数
  data.cityPageLimits = {}
  for (const [name, info] of Object.entries(data.cities || {})) {
    data.cityPageLimits[name] = info.pages ?? 1
  }''

  __config = data
  return __config
}

export function getCrawlerConfig() {
  return loadCrawlerConfig()
}
