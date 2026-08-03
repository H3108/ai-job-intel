// 技能类别展示名映射（UI Designer · v2.3 修正）。
// 后端 job_skills.category 存的是原始分类串（含英文 "soft"），
// 这里统一成中文可读名，避免雷达图 / 缺口页出现英文或易混淆的标签。
// 注意：仅改「展示名」，不动后端过滤用的原始 category 串，
// 因此不会破坏 learningPath / categoryPriority 的分组逻辑。
export const CATEGORY_LABELS: Record<string, string> = {
  soft: '软技能',
  '工具链': '设计工具',
  '工程化/基建': '视觉交付',
  'AI工程化': 'AI 工程化',
  '前端框架/语言': '前端框架/语言',
}

export function categoryLabel(cat: string | null | undefined): string {
  if (!cat) return '未分类'
  return CATEGORY_LABELS[cat] ?? cat
}
