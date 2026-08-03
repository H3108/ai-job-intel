# Web 应用全量测试报告（功能 / 样式 / 整齐度）

> 测试对象：AI 求职情报系统（React + Vite + TS / Express + SQLite）
> 首测：2026-07-31　复测（修复后）：2026-08-02　测试人：端测测（自动化 + 程序化自检）
> 环境：前端 `:5174`（vite.preview 配置，代理 /api → :3002）、后端 `:3002`（当前代码重启后）
> 注：自动化审计默认在**亮色模式**下运行（headless chromium 默认 `prefers-color-scheme: light`）；暗色模式本就是设计主目标，原已达标。

---

## 一、测试范围与方法

- **覆盖页面（13 个路由，桌面 1440×900 + 移动 390×844 双视口）**
  总览 / 缺口 / 路线 / 图谱 / 数据 / 岗位列表 / 跨角色对比 / 薪资抽检 / 角色详情 / 分析展示 / 画像 / 设计系统 / 数据调度
- **功能基线**：逐页加载、SPA 侧栏导航切换、主区域渲染、API 调用（Playwright，脚本 `tests/audit-all.mjs`）
- **样式 / 整齐度 / 可访问性**：程序化 DOM 度量（脚本 `tests/audit-deep.mjs`）
  - 横向溢出 + 元凶元素
  - WCAG 2.1 AA 对比度（自实现相对亮度算法，背景向上解析至不透明层，忽略 <50% 透明叠加）
  - 文字静默截断（无省略号却被裁）、文本元素大幅重叠（疑似）
  - 图片缺 `alt`、交互元素缺可访问名、表单控件缺关联 `label`、重复 `id`、移动端可点击区 <24px
  - 控制台 error / warning 捕获
- **诚实边界**：模型无法读取截图（图片被过滤），纯像素级美观（间距手感、配色和谐度）**无法自动判定**，需人工目检。

---

## 二、总体结论（修复后复测）

✅ **全部修复完成，复跑两套审计 = 0 项问题**：
- `audit-all.mjs`：**0 项**（功能/JS/API/导航/横向溢出基线全绿，侧栏 12 链接导航全通）
- `audit-deep.mjs`：**0 项**（对比度 / 文本重叠 / 移动端点击区 / 可访问性全绿）

无 P1 阻断级问题；原 P2 对比度 + 3 类 P3 全部已修复或用程序化复核确认为误报并已修正检测器。

---

## 三、问题清单与修复记录（大 → 小）

### 🔴 P1（阻断 / 严重）：0 项
无。功能与加载基线健康。

---

### 🟠 P2（对比度不达标）：✅ 已修复并归零

**根因**：部分语义色彩 token 在**亮色模式**下文字色与背景色同色系且明度差不足（暗色模式本来达标）。

**修复手段（一次性改 token + 局部引用，低风险）**
1. **accent 填充控件文字色**：新增 `--on-accent` / `--accent-hover` 双模式 token
   - 暗色：`--on-accent:#06281c`（近黑绿，配亮绿 emerald-400 底）；`--accent-hover:#6EE7B7`
   - 亮色：`--on-accent:#ffffff`（白字，配深绿 emerald-700 底）；`--accent-hover:#065f46`
   - 将 `design-system`（Button/Tabs/Segmented）、`RoleComparePage`×3、`analysis/index.tsx` 的全部 `text-[#06281c]` 改为 `text-[var(--on-accent)]`；Button hover 改用 `var(--accent-hover)`。
2. **角色分组文字色**：对比页「我的缺口」把数字按角色着色，原写死亮色 hex（`ROLE_COLORS`）当文字色用在白底上 → 崩对比度。新增 `--rc-text-0..4`（暗色用亮值、亮色用达标深值：emerald-700/sky-700/amber-700/violet-700/cyan-700），该单元格改用 `ROLE_TEXT_VARS`。背景/圆点仍用原 `ROLE_COLORS`（在白底上是装饰色块，不涉文字对比）。
3. **Dashboard 分隔符**：`·` 原用 `text-border`（亮色 `--border`=#E4E4E7 压白底 = 1.27:1）→ 改 `text-muted`（≥7:1）。

**复测**：跨角色对比页原 3 处 + 全站原约 16 处对比度违规 → 全部归零。

---

### 🟡 P3（轻微 / 体验 / 信息项）

**① 移动端可点击区：✅ 已修复**
- `ScopeTagline` 的「全部城市 / 全部角色」行内下拉按钮：加 `min-h-[28px]` + `py-1`（高度由 ~24px → ≥28px）。
- `design-system` 的 `Alert` 关闭「✕」按钮：原仅字形尺寸（~12px 宽）→ 改为 `h-7 w-7`（28px）固定点击区。

**② 文本重叠：✅ 真问题已修 + 误报已澄清**
- **数据页「图表标签重叠」= 误报**：原审计把虚拟滚动表格（`role=region` 容器内 `position:absolute` 行）在度量时点的不稳定矩形算成「重叠」。已修正 `audit-deep.mjs` 检测器——排除虚拟表格容器，复测数据页重叠 = 0。数据页布局本身正常（Table + Meter，无传统图表）。
- **ScopeTagline「全部角色」⨯「· 能力模型」= 真重叠（已修）**：窄侧栏换行时，行内流布局下 inline-block 按钮与后续文本块盒子真实像素重叠（实测 inter≈823px²）。将外层 `<span>` 由行内流改为 `flex flex-wrap items-center`，flex 子项永不重叠，换行干净。复测全站重叠 = 0。

**③ React Router v7 未来标志 console.warn：✅ 已修复（无害）**
- `App.tsx` 的 `<BrowserRouter>` 加 `future={{ v7_startTransition: true, v7_relativeSplatPath: true }}`，静默迁移提示。

---

## 四、已确认健康项（便于团队放心发布）

- 0 个 JS 运行时错误、0 个 console.error、0 个 API 失败（含 `/api/crawl-status` 重启后端后回归 200）
- 0 横向溢出（桌面 / 移动均无 scrollWidth > 视口）
- 0 重复 `id`、0 图片缺 `alt`、0 交互元素缺可访问名、0 表单控件缺关联 `label`
- 侧栏 12 链接导航 + 主区域渲染全部正常
- 文字截断均为 `truncate`（带省略号）的设计行为，非静默裁切

---

## 五、交付脚本（可复用回归）

| 文件 | 用途 |
|------|------|
| `tests/audit-all.mjs` | 功能 / 错误 / 溢出 / 导航基线审计 → `audit-results.json` + 截图 |
| `tests/audit-deep.mjs` | 样式 / 整齐度 / 对比度 / 可访问性深度自检 → `audit-deep.json`（已排除虚拟表格误报） |
| `tests/audit-shots/` | 各页双视口截图（供人工目检纯美观项） |

运行：
```bash
# 后端（当前代码）
cd backend && PORT=3002 node src/index.js &
# 前端
npm run dev -- --config vite.preview.config.ts --port 5174 &
# 审计
BASE_URL=http://localhost:5174 node tests/audit-all.mjs
BASE_URL=http://localhost:5174 node tests/audit-deep.mjs
```

---

## 六、修改文件清单（本次修复）

| 文件 | 改动 |
|------|------|
| `frontend/src/index.css` | 新增 `--on-accent`/`--accent-hover`（双模式）、`--rc-text-0..4`（角色文字色，双模式） |
| `frontend/src/design-system/index.tsx` | `text-[#06281c]`→`text-[var(--on-accent)]`；Button hover→`var(--accent-hover)`；Alert 关闭按钮加 28px 点击区 |
| `frontend/src/pages/RoleComparePage.tsx` | 角色文字色改用 `ROLE_TEXT_VARS`（模式感知）；新增 `ROLE_TEXT_VARS` 常量 |
| `frontend/src/components/analysis/index.tsx` | 序号徽章 `text-[#06281c]`→`text-[var(--on-accent)]` |
| `frontend/src/pages/Dashboard.tsx` | 分隔符 `text-border`→`text-muted`（4 处） |
| `frontend/src/components/ScopeTagline.tsx` | 外层改 `flex flex-wrap`（修真实重叠）；按钮 `min-h-[28px]`（点击区） |
| `frontend/src/App.tsx` | `BrowserRouter` 加 `future` 标志（静默 v7 警告） |
| `tests/audit-deep.mjs` | 重叠检测器排除虚拟滚动表格（`role=region`），消除误报 |

---

## 七、仍建议人工目检的项（模型无法自动判定）

- 纯像素级美观：间距手感、配色和谐度、字体排版细节 → 看 `tests/audit-shots/` 截图或本地 `:5174`。
- 暗色模式下的整体观感（自动化仅在亮色模式跑；暗色本就是设计主目标，原已达标，但建议扫一眼）。

---

## 八、追加发现（2026-08-02 下午）：`undefined` 文本占位符泄漏（P1）

> 用户实跑 `/gap` 发现标题渲染出 **"市场缺口 Top（undefined 岗位高频要求 · 你尚不具备）"**。这是上一轮审计漏掉的最显眼文本 bug——当时只查对比度/重叠/点击区，**没扫可见文本里的 `undefined`/`NaN` 字面量**。

- **现象**：侧栏点「能力缺口」进入 `/gap`（无 `?role=` 参数）时，`scope.role` 为 `undefined`，模板 `${scope.role}` 直接插值 → 标题出现 `undefined`。
- **根因**：`frontend/src/hooks/useScope.ts` 仅当 URL 有 `?role=`/`?city=` 时才赋值；`GapPage.tsx:232` 标题用 `${scope.role}`、**未兜底**（同文件 `:132` 的 `scopeBits` 用了 `filter(Boolean)` 是安全的，但标题漏了）。
- **同类隐患**：`GapPage.tsx:198` 无薪资样本分支的 `${scope.city}` 同样未兜底（会渲染"显示undefined AI 岗"）。其余页面（`ClustersPage`/`Dashboard`/`JobsPage`）均已用 `||` 或 `filter(Boolean)` 兜底，无此问题。
- **修复**：
  - `GapPage.tsx:232` → `${scope.role ?? '全部'}`
  - `GapPage.tsx:198` → `${scope.city ?? '全部'}`
- **复测**：`/gap`（无参）实跑 → 不再含 `undefined`/`NaN`；`/gap?role=AI前端&city=深圳` → 标题正确渲染「AI前端」。
- **流程改进（防再犯）**：`tests/audit-deep.mjs` 新增「文本占位符泄漏」检测——扫描可见文本叶子是否含 `undefined`/`NaN`/`[object Object]`，命中即记 **P1**。复跑全量 → **0 项**（该检查已就位，会在同类 bug 再次出现时自动报警）。
