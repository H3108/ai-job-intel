import { useQuery } from "@tanstack/react-query"
import { fetchProfile, fetchScopes, type Scopes } from "../api/client"
import { Section, Input, Select, Alert, PageHeader, Button } from "../design-system"

export default function PersonaPage() {
  const profileQuery = useQuery({ queryKey: ["profile"], queryFn: fetchProfile })
  const scopesQuery = useQuery<Scopes>({ queryKey: ["scopes"], queryFn: fetchScopes })
  const profile = profileQuery.data
  const defaultPatch = { target_role: profile?.target_role || "", target_city: profile?.target_city || "", current_title: profile?.current_title || "", current_company: profile?.current_company || "", current_city: profile?.current_city || "", total_experience: profile?.total_experience || "", current_skills: profile?.current_skills || "", education: profile?.education || "", note: profile?.note || "" }
  return (
    <div className="space-y-6">
      <PageHeader title="我的画像" desc="设置目标岗位、城市与当前背景，用于后续学习路线与技能差距匹配。" />
      {profileQuery.isError && <Alert tone="danger" title="加载失败">无法读取画像。</Alert>}
      <Section>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm"><span className="text-muted">目标岗位</span><Select value={defaultPatch.target_role} onChange={()=>{}} aria-label="目标岗位"><option value="">选择目标岗位</option>{(scopesQuery.data?.roles??[]).map((r)=>(<option key={r} value={r}>{r}</option>))}</Select></label>
          <label className="flex flex-col gap-1 text-sm"><span className="text-muted">目标城市</span><Select value={defaultPatch.target_city} onChange={()=>{}} aria-label="目标城市"><option value="">选择目标城市</option>{(scopesQuery.data?.cities??[]).map((c)=>(<option key={c} value={c}>{c}</option>))}</Select></label>
          <label className="flex flex-col gap-1 text-sm"><span className="text-muted">当前岗位</span><Input value={defaultPatch.current_title} onChange={()=>{}} /></label>
          <label className="flex flex-col gap-1 text-sm"><span className="text-muted">当前城市</span><Input value={defaultPatch.current_city} onChange={()=>{}} /></label>
          <label className="flex flex-col gap-1 text-sm"><span className="text-muted">工作经验</span><Input value={defaultPatch.total_experience} onChange={()=>{}} placeholder="如 3 年" /></label>
          <label className="flex flex-col gap-1 text-sm"><span className="text-muted">学历</span><Input value={defaultPatch.education} onChange={()=>{}} placeholder="如 本科" /></label>
        </div>
        <div className="mt-4"><Button variant="secondary">保存画像（占位）</Button></div>
      </Section>
    </div>
  )
}
