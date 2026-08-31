export interface Job {
  id: string
  source: string
  source_job_id: string
  title: string
  company?: string | null
  city?: string | null
  district?: string | null
  industry?: string | null
  salary_raw?: string | null
  salary_min?: number | null
  salary_max?: number | null
  salary_unit?: string | null
  salary_period?: string | null
  salary_note?: string | null
  experience?: string | null
  education?: string | null
  employment_type?: string | null
  description?: string | null
  skills?: string | null
  requirements?: string | null
  benefits?: string | null
  tags?: string | null
  posted_at?: string | null
  collected_at?: string | null
  updated_at?: string | null
  status?: string | null
  raw_payload?: string | null
  raw_format?: string | null
  raw_source?: string | null
  raw_collected_at?: string | null
  raw_version?: string | null
  batch_id?: string | null
  location?: string | null
  salary?: string | null
  extracted?: unknown
}

export interface JobsList { total: number; limit: number; offset: number; jobs: Job[] }
export interface Scopes { ok: boolean; cities: string[]; roles: string[]; industries: string[]; plannedCities?: string[]; defaultRole?: string; roleStats?: Array<{ role: string; total: number; analyzed: number; family: string; func: string }> }
export interface Profile { exists: boolean; target_role?: string | null; target_city?: string | null; current_title?: string | null; current_company?: string | null; current_city?: string | null; total_experience?: string | null; current_skills?: string | null; education?: string | null; note?: string | null; updated_at?: string | null }
export interface CrawlStatus { ok: boolean; isRunning: boolean; lastRun: string | null; nextRun: string; schedule: string; log: string; progress?: { total: number; done: number; percent: number } | null }
export interface JobsStats { total: number; recent_7d: number; recent_30d: number; city_distribution: Array<{ city: string; n: number }>; role_distribution: Array<{ role: string; n: number }>; salary_distribution?: { median: number | null; p25: number | null; p75: number | null } | null; skill_demand?: Array<{ skill: string; n: number }> | null; experience_distribution?: Array<{ experience: string; n: number }> | null; education_distribution?: Array<{ education: string; n: number }> | null }
export interface IntelligenceLatest { generated_at?: string; status?: string; types: Record<string, { generated_at?: string; model?: string; payload?: string }> }
export interface SavedJob { job_id: string; created_at?: string }
export interface SavedJobsResponse { ok: boolean; total: number; jobs: any[] }

export async function fetchJobs(opts?: { city?: string; q?: string; limit?: number; offset?: number }): Promise<JobsList> {
  const p = new URLSearchParams()
  if (opts?.city) p.set('city', opts.city)
  if (opts?.q) p.set('q', opts.q)
  if (opts?.limit != null) p.set('limit', String(opts.limit))
  if (opts?.offset != null) p.set('offset', String(opts.offset))
  const qs = p.toString()
  const res = await fetch(`/api/jobs${qs ? `?${qs}` : ''}`)
  if (!res.ok) throw new Error(`fetch /api/jobs failed: ${res.status}`)
  return res.json()
}

export async function fetchJob(id: string): Promise<Job> {
  const res = await fetch(`/api/jobs/${encodeURIComponent(id)}`)
  if (!res.ok) throw new Error(`fetch /api/jobs/${id} failed: ${res.status}`)
  const data = await res.json()
  return data.job ?? data
}

export async function fetchScopes(): Promise<Scopes> {
  const res = await fetch('/api/scopes')
  if (!res.ok) throw new Error(`fetch /api/scopes failed: ${res.status}`)
  return res.json()
}

export async function fetchProfile(): Promise<Profile> {
  const res = await fetch('/api/profile')
  if (!res.ok) throw new Error(`fetch /api/profile failed: ${res.status}`)
  return res.json()
}

export async function putProfile(patch: Record<string, string | number | boolean | null>): Promise<{ ok: boolean; exists: boolean; error?: string }> {
  const res = await fetch('/api/profile', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) })
  if (!res.ok) { let d=''; try{d=(await res.json()).error||''}catch{}; throw new Error(`保存画像失败：${res.status}${d?` · ${d}`:''}`) }
  return res.json()
}

export async function fetchCrawlStatus(): Promise<CrawlStatus> {
  const res = await fetch('/api/crawl/status')
  if (!res.ok) throw new Error(`fetch /api/crawl/status failed: ${res.status}`)
  return res.json()
}

export async function fetchJobsStats(): Promise<JobsStats> {
  const res = await fetch('/api/jobs/stats')
  if (!res.ok) throw new Error(`fetch /api/jobs/stats failed: ${res.status}`)
  return res.json()
}

export async function fetchIntelligenceLatest(): Promise<IntelligenceLatest> {
  const res = await fetch('/api/intelligence/latest')
  if (!res.ok) throw new Error(`fetch /api/intelligence/latest failed: ${res.status}`)
  return res.json()
}

export async function triggerIntelligence(): Promise<{ ok: boolean; triggered?: string[]; error?: string }> {
  const res = await fetch('/api/intelligence/trigger', { method: 'POST' })
  if (!res.ok) { let d=''; try{d=(await res.json()).error||''}catch{}; throw new Error(`触发分析失败：${res.status}${d?` · ${d}`:''}`) }
  return res.json()
}

export async function triggerCrawl(): Promise<{ ok: boolean; message?: string; error?: string }> {
  const res = await fetch('/api/crawl', { method: 'POST' })
  if (!res.ok) { let d=''; try{d=(await res.json()).error||''}catch{}; throw new Error(`触发抓取失败：${res.status}${d?` · ${d}`:''}`) }
  return res.json()
}

export async function stopCrawl(): Promise<{ ok: boolean; killed: boolean; message?: string }> {
  const res = await fetch('/api/crawl/stop', { method: 'POST' })
  if (!res.ok) { let d=''; try{d=(await res.json()).error||''}catch{}; throw new Error(`停止抓取失败：${res.status}${d?` · ${d}`:''}`) }
  return res.json()
}

export const triggerCrawlLegacy = triggerCrawl
export const stopCrawlLegacy = stopCrawl

export interface SavedJobsResponse { ok: boolean; total: number; jobs: any[] }
export async function fetchSaved(): Promise<SavedJobsResponse> {
  const res = await fetch('/api/saved')
  if (!res.ok) throw new Error(`fetch /api/saved failed: ${res.status}`)
  return res.json()
}

export async function toggleSaved(jobId: string): Promise<{ ok: boolean; saved: boolean }> {
  const res = await fetch(`/api/saved/${encodeURIComponent(jobId)}`, { method: 'POST' })
  if (!res.ok) throw new Error(`fetch /api/saved/${jobId} failed: ${res.status}`)
  return res.json()
}

export interface IntelligenceItem { id?: string; type?: string; generated_at?: string; model?: string; payload?: string; markdown?: string }
export async function fetchIntelligenceByType(type: string): Promise<IntelligenceItem> {
  const res = await fetch(`/api/intelligence/${encodeURIComponent(type)}`)
  if (!res.ok) throw new Error(`fetch /api/intelligence/${type} failed: ${res.status}`)
  return res.json()
}

export async function fetchIntelligenceReports(): Promise<IntelligenceItem[]> {
  const res = await fetch('/api/intelligence/reports')
  if (!res.ok) throw new Error(`fetch /api/intelligence/reports failed: ${res.status}`)
  return res.json()
}

export async function fetchIntelligenceReportById(id: string): Promise<IntelligenceItem> {
  const res = await fetch(`/api/intelligence/reports/${encodeURIComponent(id)}`)
  if (!res.ok) throw new Error(`fetch /api/intelligence/reports/${id} failed: ${res.status}`)
  return res.json()
}

export async function fetchCareerIntelligence(): Promise<IntelligenceItem> {
  const res = await fetch('/api/intelligence/career')
  if (!res.ok) throw new Error(`fetch /api/intelligence/career failed: ${res.status}`)
  return res.json()
}
