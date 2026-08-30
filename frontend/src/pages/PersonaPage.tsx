import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchProfile, fetchScopes, putProfile, type Scopes } from "../api/client"
import { Section, Alert, PageHeader, Badge, Button } from "../design-system"

function emptyProfile() {
  return {
    target_role: "",
    target_city: "",
    current_title: "",
    current_company: "",
    current_city: "",
    total_experience: "",
    current_skills: "",
    education: "",
    note: "",
  }
}

export default function PersonaPage() {
  const qc = useQueryClient()
  const profileQuery = useQuery({ queryKey: ["profile"], queryFn: fetchProfile })
  const scopesQuery = useQuery<Scopes>({ queryKey: ["scopes"], queryFn: fetchScopes })
  const saveMutation = useMutation({
    mutationFn: putProfile,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile"] }),
  })

  const profile = profileQuery.data
  const initial = {
    ...emptyProfile(),
    ...(profile && typeof profile === "object" ? profile : {}),
  }
  const [form, setForm] = useState({
    target_role: initial.target_role || "",
    target_city: initial.target_city || "",
    current_title: initial.current_title || "",
    current_company: initial.current_company || "",
    current_city: initial.current_city || "",
    total_experience: initial.total_experience || "",
    current_skills: initial.current_skills || "",
    education: initial.education || "",
    note: initial.note || "",
  })

  useEffect(() => {
    setForm({
      target_role: initial.target_role || "",
      target_city: initial.target_city || "",
      current_title: initial.current_title || "",
      current_company: initial.current_company || "",
      current_city: initial.current_city || "",
      total_experience: initial.total_experience || "",
      current_skills: initial.current_skills || "",
      education: initial.education || "",
      note: initial.note || "",
    })
  }, [profile?.updated_at])

  const scopes = scopesQuery.data
  const saving = saveMutation.isPending

  const save = () => {
    saveMutation.mutate(form)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="我的画像"
        desc="设置目标岗位、城市与当前背景，用于后续学习路线与技能差距匹配。"
        actions={
          profile?.exists ? (
            <Badge tone="success">已保存</Badge>
          ) : (
            <Badge tone="warning">未设置</Badge>
          )
        }
      />

      {profileQuery.isError && (
        <Alert tone="danger" title="加载失败">无法读取画像。</Alert>
      )}
      {saveMutation.isError && (
        <Alert tone="danger" title="保存失败">{(saveMutation.error as any)?.message || "保存失败，请重试。"}</Alert>
      )}
      {saveMutation.isSuccess && (
        <Alert tone="success" title="已保存">画像信息已更新。</Alert>
      )}

      <Section title="目标方向" desc="选择你期望的岗位与城市，系统将据此生成推荐与学习路线。">
        <div className="grid gap-4 sm:grid-cols-2 min-w-0 overflow-hidden">
          <label className="flex flex-col gap-1 text-sm min-w-0">
            <span className="text-muted">目标岗位</span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              value={form.target_role}
              onChange={(e) => setForm((s) => ({ ...s, target_role: e.target.value }))}
            >
              <option value="">选择目标岗位</option>
              {(scopes?.roles ?? []).map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm min-w-0">
            <span className="text-muted">目标城市</span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              value={form.target_city}
              onChange={(e) => setForm((s) => ({ ...s, target_city: e.target.value }))}
            >
              <option value="">选择目标城市</option>
              {(scopes?.cities ?? []).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
      </Section>

      <Section title="当前背景" desc="填写你目前的岗位、城市、经验与技能，便于精准计算技能差距。">
        <div className="grid gap-4 sm:grid-cols-2 min-w-0 overflow-hidden">
          <label className="flex flex-col gap-1 text-sm min-w-0">
            <span className="text-muted">当前岗位</span>
            <input
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              value={form.current_title}
              onChange={(e) => setForm((s) => ({ ...s, current_title: e.target.value }))}
              placeholder="如：前端工程师"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm min-w-0">
            <span className="text-muted">当前城市</span>
            <input
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              value={form.current_city}
              onChange={(e) => setForm((s) => ({ ...s, current_city: e.target.value }))}
              placeholder="如：深圳"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm min-w-0">
            <span className="text-muted">工作经验</span>
            <input
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              value={form.total_experience}
              onChange={(e) => setForm((s) => ({ ...s, total_experience: e.target.value }))}
              placeholder="如：3 年"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm min-w-0">
            <span className="text-muted">学历</span>
            <input
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              value={form.education}
              onChange={(e) => setForm((s) => ({ ...s, education: e.target.value }))}
              placeholder="如：本科"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2 min-w-0">
            <span className="text-muted">当前技能</span>
            <textarea
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              rows={3}
              value={form.current_skills}
              onChange={(e) => setForm((s) => ({ ...s, current_skills: e.target.value }))}
              placeholder="用逗号分隔，如：React, TypeScript, Node.js"
            />
          </label>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Button variant="secondary" loading={saving} onClick={save}>保存画像</Button>
          {profile?.updated_at && (
            <span className="text-xs text-muted">
              上次更新：{new Date(profile.updated_at).toLocaleString("zh-CN")}
            </span>
          )}
        </div>
      </Section>
    </div>
  )
}
