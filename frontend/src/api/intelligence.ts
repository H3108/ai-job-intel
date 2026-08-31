export interface IntelligenceItem { id?: string; type?: string; generated_at?: string; model?: string; payload?: string; markdown?: string }
export interface IntelligenceLatest { generated_at?: string; status?: string; types: Record<string, { generated_at?: string; model?: string; payload?: string }> }

export async function fetchIntelligenceLatest(): Promise<IntelligenceLatest> {
  const res = await fetch('/api/intelligence/latest')
  if (!res.ok) throw new Error(`fetch /api/intelligence/latest failed: ${res.status}`)
  return res.json()
}

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
