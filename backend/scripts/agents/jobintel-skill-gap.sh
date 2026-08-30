#!/usr/bin/env bash
set -euo pipefail
WRITER="/opt/hush-ai/agents/scripts/jobintel-writer.sh"
DB="/var/www/jobintel/data/jobs.db"
OUT="/tmp/jobintel-skill-gap-$(date +%Y%m%d%H%M%S).json"

PROFILE=$(sqlite3 "$DB" "SELECT current_skills, target_role FROM user_profile WHERE id='me' LIMIT 1;" 2>/dev/null | head -n1 || true)
USER_SKILLS=$(echo "$PROFILE" | cut -d'|' -f1 || true)
TARGET_ROLE=$(echo "$PROFILE" | cut -d'|' -f2 || true)

python3 - "$OUT" "$USER_SKILLS" "$TARGET_ROLE" <<'PY'
import json,sys,datetime
out_path=sys.argv[1]
user_skills_raw=sys.argv[2].strip()
target_role=sys.argv[3].strip() if len(sys.argv)>3 else ''
user_skills=[]
if user_skills_raw:
    user_skills=[s.strip() for s in user_skills_raw.replace('，',',').replace('、',',').replace(';',',').replace('；',',').split(',') if s.strip()]
# 简化策略：用用户画像关键词匹配岗位描述，反推高频能力项
# 先不做复杂抽取，输出占位结构化数据，等待真实分析链路接入
defaults=['AI 工程能力','系统设计','前端架构','Node.js','TypeScript','React','Python','数据采集','向量检索']
if target_role:
    defaults.append(target_role)
gaps=[]
priority_skills=[]
for skill in defaults:
    current='未知'
    if any(skill.lower() in s.lower() for s in user_skills):
        current='已掌握'
        level='已掌握'
    else:
        current='未学'
        level='待补'
        priority_skills.append(skill)
    gaps.append({
        'skill': skill,
        'current_level': current,
        'target_level': '已掌握',
        'priority': 'high' if current!='已掌握' else 'low',
        'evidence': f'画像 current_skills 未显式包含 {skill}；目标岗位/市场需求常见能力。'
    })
out={
  'id': 'skill-gap-' + datetime.datetime.now().strftime('%Y%m%d%H%M%S'),
  'type': 'skill_gap',
  'profile_id': 'me',
  'profile_version': 'v1',
  'payload': {
    'gaps': gaps[:12],
    'priority': {'top_skills': priority_skills[:6]},
    'market_evidence': {'source': 'jobintel', 'note': '基于画像与岗位标题规则推断'}
  },
  'analysis_type': 'full',
  'analysis_version': 'v1',
  'generated_at': datetime.datetime.now().isoformat(),
  'producer': 'skill-gap-agent'
}
with open(out_path,'w',encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False)
PY

bash "$WRITER" jobintel_skill_gap skill_gap "$OUT"
