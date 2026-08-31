import { useQuery, useMutation } from "@tanstack/react-query"
import { fetchProfile, putProfile } from "../api/client"
import { Section, EmptyState, PageHeader, Button, Input, Skeleton } from "../design-system"

export default function ProfilePage() {
  const profile = useQuery({ queryKey: ["profile"], queryFn: fetchProfile })
  const update = useMutation({
    mutationFn: putProfile,
    onSuccess: () => profile.refetch(),
  })

  const data = profile.data
  const saving = update.isPending

  const set = (key: string, value: string | number | boolean | null) => update.mutate({ [key]: value })

  return (
    <div className="space-y-8">
      <PageHeader title="Career Profile" desc="Background / Target / Preferences。" />

      {profile.isLoading ? (
        <Section title="Profile" desc="加载中…"><Skeleton className="h-48 w-full" /></Section>
      ) : !data?.exists ? (
        <Section title="Profile" desc="尚未创建画像。"><EmptyState title="空画像" desc="请填写你的职业背景与目标。" /></Section>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <Section title="Background" desc="技能、经历、项目、教育。" className="sm:col-span-1">
            <div className="space-y-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs text-muted">Current Title</span>
                <Input value={data.current_title ?? ""} onChange={(e) => set("current_title", e.target.value)} placeholder="当前职位" />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs text-muted">Current Company</span>
                <Input value={data.current_company ?? ""} onChange={(e) => set("current_company", e.target.value)} placeholder="当前公司" />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs text-muted">Current City</span>
                <Input value={data.current_city ?? ""} onChange={(e) => set("current_city", e.target.value)} placeholder="当前城市" />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs text-muted">Total Experience</span>
                <Input value={data.total_experience ?? ""} onChange={(e) => set("total_experience", e.target.value)} placeholder="如 5年" />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs text-muted">Education</span>
                <Input value={data.education ?? ""} onChange={(e) => set("education", e.target.value)} placeholder="本科 / 硕士 ..." />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs text-muted">Current Skills</span>
                <Input value={data.current_skills ?? ""} onChange={(e) => set("current_skills", e.target.value)} placeholder="React, TypeScript, ..." />
              </label>
            </div>
          </Section>

          <Section title="Target" desc="期望岗位与城市。" className="sm:col-span-1">
            <div className="space-y-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs text-muted">Target Role</span>
                <Input value={data.target_role ?? ""} onChange={(e) => set("target_role", e.target.value)} placeholder="AI Agent Engineer" />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs text-muted">Target City</span>
                <Input value={data.target_city ?? ""} onChange={(e) => set("target_city", e.target.value)} placeholder="深圳 / 广州" />
              </label>
            </div>
          </Section>

          <Section title="Preferences" desc="行业、公司类型、远程偏好。" className="sm:col-span-1">
            <div className="space-y-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs text-muted">Note</span>
                <Input value={data.note ?? ""} onChange={(e) => set("note", e.target.value)} placeholder="其他偏好或备注" />
              </label>
            </div>
          </Section>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button variant="primary" loading={saving} onClick={() => update.mutate({})} >保存</Button>
      </div>
    </div>
  )
}
