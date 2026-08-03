# AI 求职情报系统

> 个人求职情报系统：爬取 Boss 直聘多角色多城市 AI 岗 → 解码加密薪资 → 用 LLM 提炼能力模型 → 反推学习路线 → 暗色看板展示。**数据存在本机 `data/jobs.db`，不上云。**

---

## 一、它解决什么问题

**以岗定学**——看清目标岗位到底要求什么技能、自己还差哪些、该按什么优先级补。
把「固定的我（persona 画像）」和「动态的市场（各角色/城市招聘要求）」放进同一个对比框架，输出能力缺口与投资优先级。

## 二、架构

```
Boss 直聘（网页）
   │  Playwright 爬虫（持久化登录态 + 字体解密）
   ▼
backend/  Express + Node22 node:sqlite
   ├─ crawler.js      采集 + 薪资字体解码（salary_raw 永先生效）
   ├─ analyze.js      LLM 抽技能/薪资/层级 + 技能/学历/角色归一
   ├─ index.js        REST API（jobs / analytics / crawl-status / crawl-trigger）
   └─ data/jobs.db    单文件 SQLite（含 jobs / job_skills / user_profile / crawl_runs）
        │
        ▼
frontend/  React + Vite + TS + Tailwind（暗色设计系统）
   └─ 看板：仪表盘 / 薪资抽检 / 职位明细 / 跨角色·跨城市对比 / 能力缺口 / 画像编辑 / 数据调度
```

**技术栈**
- 前端：React 18 + Vite 5 + TypeScript + Tailwind + TanStack Query（零图表库，SVG 自绘）
- 后端：Express + Node 22 内置 `node:sqlite`（零依赖文件库）
- 存储：SQLite 单文件（`data/jobs.db`，不进仓库）

## 三、目录结构

```
frontend/   看板（React）
backend/    Express API + 爬虫 + 分析
data/       SQLite + 备份（*.db / backups 已 gitignore，含个人 JD，不进仓库）
scripts/    一键备份/恢复 + 本地定时任务（crawl-run.sh 等）
tests/      自动化测试（node --test）
.github/    CI 工作流（Node22 + backend test + frontend build）
```

> 扩展文档（复盘 / 技术文档 / 部署手册等）与一键部署脚本在本仓库之外单独管理，**不随源码公开**。

## 四、快速开始

```bash
# 1. 安装（根目录一次，workspaces 自动装前后端依赖）
npm install

# 2. 本地开发（同时起前端 :5173 与后端 :3001）
npm run dev
#    前端：http://localhost:5173   后端接口：http://localhost:3001/api/health

# 3. 生产构建（前端必须进 frontend/）
cd frontend && npm run build      # 产物在 frontend/dist/

# 4. 跑测试
npm test
```

## 五、功能地图

| 页面 | 路径 | 说明 |
|---|---|---|
| 仪表盘 | `/` | 样本/已分析/方向/覆盖度动态数字 + 径向能力图谱（记忆点） |
| 薪资抽检 | `/salary-audit` | raw vs decoded 并排、置信配色、worst-first |
| 职位明细 | `/jobs` `/jobs/:id` | 列表下钻 + 详情（薪资 Badge/置信、技能分组、JD 折叠） |
| 跨角色·跨城市对比 | `/compare` | 选岗×选城双轴；薪资溢价指标；导出 PNG |
| 能力缺口 | `/gap` | 固定画像 vs 动态市场缺口（随角色切换） |
| 我的画像 | `/persona` | 编辑目标岗/技能/AI 接触度/学习路径（四段式 + 实时预览） |
| 数据调度 | `/data-schedule` | 上次/下次抓取 + 手动触发 + 日志 |
| 设计系统 | `/design-system` | 组件样册 |

## 六、合规提醒

`data/*.db`、`data/boss_cookies.json`、`data/boss_profile/` 含个人隐私，已 gitignore，**勿提交远端**；换机器直接拷 `jobs.db`。建议用 Boss 小号跑爬虫，降主号封禁风险。

## 七、安全与部署边界（重要）

> **默认设计是单机本地工具，不是多租户 SaaS。**

- **API 无任何鉴权**：后端所有 `/api/*` 路由均无 auth 中间件，本机 `data/jobs.db` 完全开放读写。
- **含敏感凭证**：`crawler.js` 用 CDP 登录**真实 Boss 直聘账号**，`analyze.js` 用 LLM API Key 调外部模型。密钥与登录态在本机 `data/` 与 `.env`，已 gitignore，绝不随仓库提交。
- **若自部署到公网**：必须自行在反向代理 / 网关层加一层认证（如访问密码 / basic auth），否则任何人都能读你的求职数据、调爬虫动你的真实账号。本仓库**不含部署脚本与服务器配置**，相关配置由使用者自行负责。
- **多实例约定**：单文件 SQLite，启动迁移已做单实例门控（仅首个实例跑写迁移，其余等其释放后跳过），但仍建议同一时间只起一个 backend，避免写竞争。
- **推荐运行方式**：仅本机 `localhost`（`npm run dev` 起前端 5173 + 后端 3001）。跨设备看请用 SSH 隧道 / 反向代理加认证，不要直接转发端口。

数据存在本机 `data/jobs.db`，**不上云**。出本机即视为已授权。
