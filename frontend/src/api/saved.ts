export interface SavedJob { job_id: string; created_at?: string }
export interface SavedJobsResponse { ok: boolean; total: number; jobs: any[] }

export async function fetchSaved(): Promise<SavedJobsResponse> {
  const res = await fetch('/api/saved')
  if (!res.ok) throw new Error(`fetch /api/saved failed: ${res.status}`)
  return res.json()
}

export async function toggleSaved(jobId: string): Promise<{ ok: boolean; saved: boolean }> {
  const res = await fetch(`/api/saved/${encodeURIComponent(jobId)}`, { method: 'POST' })
  if (!res.ok) throw new Error(`fetch /api/saved failed: ${res.status}`)
  return res.json()
}
