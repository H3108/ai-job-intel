#!/usr/bin/env bash
set -euo pipefail
WRITER="/opt/hush-ai/agents/scripts/jobintel-writer.sh"
DB="/var/www/jobintel/data/jobs.db"
OUT="/tmp/jobintel-roadmap-$(date +%Y%m%d%H%M%S).json"

PROFILE=$(sqlite3 "$DB" "SELECT target_role, current_skills FROM user_profile WHERE id='me' LIMIT 1;" 2>/dev/null | head -n1 || true)
TARGET_ROLE=$(echo "$PROFILE" | cut -d'|' -f1 || true)

python3 - "$OUT" "$TARGET_ROLE" <<'PY'
import json,sys,datetime
out_path=sys.argv[1]
target_role=sys.argv[2].strip() if len(sys.argv)>1 else ''
focus = target_role if target_role else 'AI 求职竞争力提升'
phases=[
  {
    'phase':'Phase 1',
    'focus':'基础能力与岗位关键词对齐',
    'skills':['简历优化','岗位关键词','项目经历包装'],
    'estimate_weeks':2,
    'actions':['整理 3 个高相关项目','补齐技能关键词','完成简历 A/B 版本']
  },
  {
    'phase':'Phase 2',
    'focus':'核心技能补强',
    'skills':['AI 工程能力','系统设计','数据采集'] if 'AI' in focus else ['前端架构','TypeScript','Node.js','React'],
    'estimate_weeks':3,
    'actions':['完成 1 个生产级项目','输出 2 篇技术文档','做 2 个模拟面试']
  },
  {
    'phase':'Phase 3',
    'focus':'求职执行与市场验证',
    'skills':['面试表达','薪资谈判','人脉/内推'],
    'estimate_weeks':2,
    'actions':['每周投递 10 个岗位','收集反馈并迭代','复盘失败面试']
  }
]
milestones=[
  {'week':2,'goal':'简历与项目集达到可投递标准','check':'3 个项目描述可展开讲'},
  {'week':5,'goal':'核心技能具备中级以上证明','check':'2 个技术产出/1 个系统设计题能独立完成'},
  {'week':7,'goal':'进入面试循环并拿到反馈','check':'周面试≥1，完成率≥80%'}
]
out={
  'id': 'roadmap-' + datetime.datetime.now().strftime('%Y%m%d%H%M%S'),
  'type': 'roadmap',
  'profile_id': 'me',
  'profile_version': 'v1',
  'payload': {
    'phases': phases,
    'milestones': milestones,
    'source_roles': [target_role] if target_role else ['AI 求职竞争力提升']
  },
  'analysis_type': 'full',
  'analysis_version': 'v1',
  'generated_at': datetime.datetime.now().isoformat(),
  'producer': 'learning-roadmap-agent'
}
with open(out_path,'w',encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False)
PY

bash "$WRITER" jobintel_roadmap roadmap "$OUT"
