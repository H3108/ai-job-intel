import { DatabaseSync } from 'node:sqlite'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..', '..')
const dataDir = join(root, 'data')
const OLD_DB = join(dataDir, 'jobs.db.backup.20260830')
const NEW_DB = join(dataDir, 'jobs_v2.db')
const SCHEMA_SQL = join(dataDir, 'schema-v2.sql')

function ensureDbPaths() {
  mkdirSync(dataDir, { recursive: true })
}

function loadOldSchema(db) {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name)
  const columns = {}
  for (const t of tables) {
    columns[t] = db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name)
  }
  return { tables, columns }
}

function migrate() {
  ensureDbPaths()

  if (!existsSync(OLD_DB)) {
    console.log('[migrate-v2] 未发现旧数据库，无需迁移')
    return
  }

  const oldDb = new DatabaseSync(OLD_DB)
  const oldSchema = loadOldSchema(oldDb)

  const oldJobsCount = oldDb.prepare('SELECT COUNT(*) AS n FROM jobs').get().n
  console.log(`[migrate-v2] 旧数据库 jobs 数量：${oldJobsCount}`)

  const newDb = new DatabaseSync(NEW_DB)
  newDb.exec(readFileSync(SCHEMA_SQL, 'utf-8'))

  const newSchema = loadOldSchema(newDb)
  console.log('[migrate-v2] 新 schema 已创建')

  const oldCols = oldSchema.columns['jobs'] || []
  const hasSource = oldCols.includes('source')
  const hasSourceJobId = oldCols.includes('source_job_id')
  const hasSalaryRaw = oldCols.includes('salary_raw')
  const hasRaw = oldCols.includes('raw')
  const hasNormalizedTitle = oldCols.includes('normalized_title')
  const hasLocation = oldCols.includes('location')

  const rows = oldDb.prepare('SELECT * FROM jobs').all()
  const insert = newDb.prepare(`
    INSERT OR REPLACE INTO jobs (
      id, source, source_job_id, source_url,
      title, company, city, district, industry,
      salary_raw, salary_min, salary_max, salary_unit, salary_period, salary_note,
      experience, education, employment_type,
      description, skills, requirements, benefits, tags,
      posted_at, collected_at, updated_at,
      status,
      raw_payload, raw_format, raw_source, raw_collected_at, raw_version,
      batch_id
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?,
      ?, ?, ?, ?, ?,
      ?
    )
  `)

  let migrated = 0
  let skipped = 0

  for (const r of rows) {
    const source = hasSource ? (r.source || 'boss') : 'boss'
    const sourceJobId = hasSourceJobId ? r.source_job_id : r.id

    if (!source || !sourceJobId) {
      skipped++
      continue
    }

    const city = hasLocation ? r.location : null
    const salaryRaw = hasSalaryRaw ? r.salary_raw : r.salary
    const rawPayload = hasRaw ? r.raw : null
    const title = r.title || null
    const company = r.company || null
    const experience = r.experience || null
    const education = r.education || null

    let postedAt = r.first_seen || null
    let collectedAt = r.created_at || new Date().toISOString()
    let updatedAt = r.last_seen || collectedAt

    if (!postedAt) postedAt = collectedAt

    const now = new Date().toISOString()
    if (!collectedAt) collectedAt = now
    if (!updatedAt) updatedAt = now

    const status = r.status || 'active'

    try {
      insert.run(
        r.id,
        source,
        sourceJobId,
        r.source_url || null,
        title,
        company,
        city,
        null,
        null,
        salaryRaw,
        null,
        null,
        'CNY',
        null,
        null,
        experience,
        education,
        null,
        r.description || null,
        null,
        null,
        null,
        null,
        postedAt,
        collectedAt,
        updatedAt,
        status,
        rawPayload,
        rawPayload ? 'html' : null,
        source,
        rawPayload ? collectedAt : null,
        'v1',
        null
      )
      migrated++
    } catch (e) {
      console.error(`[migrate-v2] 迁移失败: ${r.id}`, e.message)
      skipped++
    }
  }

  const newCount = newDb.prepare('SELECT COUNT(*) AS n FROM jobs').get().n
  console.log(`[migrate-v2] 迁移完成：成功 ${migrated}，跳过 ${skipped}，新数据库总计 ${newCount}`)

  if (migrated !== oldJobsCount) {
    console.warn(`[migrate-v2] 数量不一致：旧 ${oldJobsCount} → 新 ${newCount}`)
  }

  const duplicates = newDb.prepare('SELECT source, source_job_id, COUNT(*) c FROM jobs GROUP BY source, source_job_id HAVING c > 1').all()
  if (duplicates.length > 0) {
    console.warn(`[migrate-v2] 发现重复身份：`, duplicates)
  } else {
    console.log('[migrate-v2] 唯一性检查通过')
  }

  return { migrated, skipped, newCount }
}

const result = migrate()
console.log('[migrate-v2] 完成', result)
