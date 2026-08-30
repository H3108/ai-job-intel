#!/usr/bin/env bash
set -euo pipefail
WRITER="/opt/hush-ai/agents/scripts/jobintel-writer.sh"
DB="/var/www/jobintel/data/jobs.db"
OUT="/tmp/jobintel-career-advisor-$(date +%Y%m%d%H%M%S).json"

PROFILE=$(sqlite3 "$DB" "SELECT target_role, target_city, target_industries, current_skills FROM user_profile WHERE id='me' LIMIT 1;" 2>/dev/null | head -n1 || true)
TARGET_ROLE=$(echo "$PROFILE" | cut -d'|' -f1 || true)
TARGET_CITY=$(echo "$PROFILE" | cut -d'|' -f2 || true)

MATCHES=$(sqlite3 -json "$DB" "SELECT id, title, company, city, salary_min, salary_max, experience, education FROM jobs WHERE status IN ('analyzed','collected') ORDER BY datetime(updated_at) DESC LIMIT 20;" 2>/dev/null || true)

python3 - "$OUT" "$TARGET_ROLE" "$TARGET_CITY" "$MATCHES" <<'PY'
import json,sys,datetime
out_path=sys.argv[1]
profile_role=sys.argv[2].strip()
profile_city=sys.argv[3].strip()
matches_raw=sys.argv[4] if len(sys.argv) > 4 else ''
matches=[]
if matches_raw:
    try:
        matches=json.loads(matches_raw)
    except Exception:
        matches=[]
rows=[]
for m in matches:
    title=(m.get('title') or '').lower()
    city=(m.get('city') or '').lower()
    score=50.0
    if profile_role and profile_role.lower() in title:
        score += 30
    if profile_city and profile_city.lower() in city:
        score += 15
    if m.get('salary_min'):
        score += 5
    rows.append({
        'job_id': m.get('id'),
        'title': m.get('title'),
        'company': m.get('company'),
        'city': m.get('city'),
        'score': min(score, 99),
        'reason': '基于画像匹配：目标岗位/城市关键词命中，薪资/经验作辅助加分。'
    })
rows=sorted(rows,key=lambda x:x['score'], reverse=True)[:8]
out={
  'id': 'career-' + datetime.datetime.now().strftime('%Y%m%d%H%M%S'),
  'type': 'recommendations',
  'profile_id': 'me',
  'profile_version': 'v1',
  'payload': {
    'matches': rows,
    'advice': {
      'summary': '先聚焦前 3 个高匹配岗位，补足岗位关键词与项目经历；若目标城市岗位偏少，可先考虑远程/邻近城市机会。',
      'priorities': ['更新简历关键词', '补项目经历', '准备算法/系统设计']
    },
    'market_fit': {'total_matched': len(rows), 'status': 'ok'}
  },
  'analysis_type': 'full',
  'analysis_version': 'v1',
  'generated_at': datetime.datetime.now().isoformat(),
  'producer': 'career-advisor-agent'
}
with open(out_path,'w',encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False)
PY

bash "$WRITER" jobintel_recommendations recommendations "$OUT"
