-- AI 求职情报系统 — SQLite Schema (Phase 0)
-- 对齐计划 §4.1 (JD 对象) / §4.3 (用户画像) / §15 (去重与状态)
-- 后端启动时由 node:sqlite 执行本文件建表。

PRAGMA foreign_keys = ON;

-- ── 岗位表 (每条 JD 一行) ──────────────────────────────
CREATE TABLE IF NOT EXISTS jobs (
  id                 TEXT PRIMARY KEY,            -- §4.1 boss_xxx
  title              TEXT NOT NULL,               -- 原始标题
  normalized_title   TEXT,                        -- §15 去重键(归一化，Phase2 填充)
  company            TEXT,
  location           TEXT,                        -- 默认 深圳
  salary             TEXT,
  salary_raw         TEXT,                        -- §9.x 解密前的加密薪资文本（PUA 码点），便于 Boss 换字体后重解
  salary_confidence  TEXT,                        -- numeric 0–1（解密置信度，crawler.js 实际存浮点）
  experience         TEXT,
  education          TEXT,
  education_level    TEXT,                        -- 方案 B：学历规范层级（本科/大专/硕士…，由 education 派生）
  experience_level   TEXT,                        -- 经验规范层级（1-3年 / 3年+ / 应届…，由 experience 派生）
  exp_min            INTEGER,                     -- 经验下限（年，null=不限）
  exp_max            INTEGER,                     -- 经验上限（年，null=以上/不限）
  role               TEXT,                        -- 方案 C：规范岗位名（前端工程师/视觉设计师…，由 title 派生，合并同义标题）
  search_role        TEXT,                        -- Phase4：采集时使用的模板角色名（"AI Agent 前端"/"AI 算法工程师"…），不被 rebuildRole 覆盖，用于"我搜了 X→市场实际 Y"对比
  raw                TEXT,                        -- §4.1 原始 JD 文本
  extracted          TEXT,                        -- §4.1 JSON(extracted) 字符串
  status             TEXT DEFAULT 'collected',    -- §15 状态机: collected/analyzed/viewed/applied/archived/expired
  first_seen         TEXT,
  last_seen          TEXT,
  applied_at         TEXT,
  user_note          TEXT,
  created_at         TEXT DEFAULT (datetime('now'))
);

-- §15 去重主键 (company + normalized_title + location)
-- 注: normalized_title 由 importer 在入库前归一（normalizeTitle: 小写+空白归一），
--     故同 JD 的大小写/空白变体在入库时即被去重；历史残留 NULL 行由 migrate / 回填脚本补齐。
CREATE UNIQUE INDEX IF NOT EXISTS uq_jobs_dedup
  ON jobs(company, normalized_title, location);

-- ── 规范化技能子表（方案 B：替代 JSON-in-TEXT 聚合） ──────────────
-- 一条 JD 的技能一行；SQL 可直出频率/分布、可建部分索引、personalGap 变 JOIN。
-- 由 analyze.saveExtraction / 迁移脚本从 jobs.extracted 派生，删表可随时重建。
CREATE TABLE IF NOT EXISTS job_skills (
  job_id   TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  skill    TEXT NOT NULL,
  category TEXT,
  level    TEXT,
  PRIMARY KEY (job_id, skill, category)
);
CREATE INDEX IF NOT EXISTS ix_job_skills_skill ON job_skills(skill);
CREATE INDEX IF NOT EXISTS ix_job_skills_cat   ON job_skills(category);

-- 热查询索引（状态/时间/规范层级/薪资）
CREATE INDEX IF NOT EXISTS ix_jobs_status      ON jobs(status);
CREATE INDEX IF NOT EXISTS ix_jobs_created     ON jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS ix_jobs_edu_level   ON jobs(education_level);
CREATE INDEX IF NOT EXISTS ix_jobs_exp_level   ON jobs(experience_level);
CREATE INDEX IF NOT EXISTS ix_jobs_salary      ON jobs(salary);
CREATE INDEX IF NOT EXISTS ix_jobs_role        ON jobs(role);
CREATE INDEX IF NOT EXISTS ix_jobs_search_role ON jobs(search_role);

-- ── 用户画像表 (单例行 'me') ──────────────────────────
CREATE TABLE IF NOT EXISTS user_profile (
  id                 TEXT PRIMARY KEY,            -- 单例行 'me'
  target_role        TEXT,                        -- §4.3 目标岗
  current_skills     TEXT,                        -- §4.3 JSON(categories)
  ai_exposure        TEXT,                        -- §4.3 JSON
  ai_engineering_gap TEXT,                        -- §4.3 JSON(array)
  note               TEXT
);

-- ── 用户技能掌握度 (§21 学习闭环，Phase3 启用，Phase0 预留) ──
CREATE TABLE IF NOT EXISTS user_skill_mastery (
  skill   TEXT PRIMARY KEY,
  status  TEXT DEFAULT '未学'                      -- 未学 / 学习中 / 已掌握
);

-- ── 采集运行记录 (看板状态灯：风控/异常/薪资解密成功率) ──
-- crawler 每次收尾写一行；后端 /api/health 读最新一行派生健康信号。
CREATE TABLE IF NOT EXISTS crawl_runs (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  ran_at            TEXT DEFAULT (datetime('now')),   -- 运行结束时间
  mode              TEXT,                              -- CDP / launch
  status            TEXT,                              -- ok / warn
  keywords_total    INTEGER,
  jobs_new          INTEGER DEFAULT 0,
  jobs_updated      INTEGER DEFAULT 0,
  salary_decoded    INTEGER DEFAULT 0,                 -- 成功解出合法薪资形态的卡片数
  salary_attempted  INTEGER DEFAULT 0,                 -- 尝试解密的卡片数（卡片含加密薪资）
  salary_lowconf    INTEGER DEFAULT 0,                 -- 低置信薪资数（解码置信度 < 红阈值 0.7），供健康灯历史派生
  alerts_count      INTEGER DEFAULT 0,
  alerts_json       TEXT                               -- JSON(告警文本数组)
);
