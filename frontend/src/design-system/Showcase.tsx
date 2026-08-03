import { useState } from 'react'
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Field,
  IconButton,
  Input,
  Kbd,
  Meter,
  PageHeader,
  Section,
  Segmented,
  Select,
  Skeleton,
  StatCard,
  Switch,
  Table,
  Tabs,
  Textarea,
  Tooltip,
  type TabItem,
} from './index'

export default function DesignSystemShowcase() {
  const [tab, setTab] = useState('overview')
  const [seg, setSeg] = useState('week')
  const [sw, setSw] = useState(true)
  const [alertOpen, setAlertOpen] = useState(true)

  const tokens: { name: string; value: string }[] = [
    { name: '--bg', value: 'var(--bg)' },
    { name: '--surface-solid', value: 'var(--surface-solid)' },
    { name: '--primary / --accent', value: 'var(--accent)' },
    { name: '--text', value: 'var(--text)' },
    { name: '--muted', value: 'var(--muted)' },
    { name: '--border', value: 'var(--border)' },
    { name: '--success', value: 'var(--success)' },
    { name: '--warning', value: 'var(--warning)' },
    { name: '--danger', value: 'var(--danger)' },
    { name: '--info', value: 'var(--info)' },
  ]

  const typeScale: { cls: string; label: string }[] = [
    { cls: 'text-3xl font-semibold font-display tabular-nums', label: 'KPI 数字 30px' },
    { cls: 'text-xl font-semibold', label: '小标题 20px' },
    { cls: 'text-base', label: '正文 16px' },
    { cls: 'text-sm', label: '辅助 14px' },
    { cls: 'text-xs', label: '标注 12px' },
  ]

  const principles: { t: string; d: string }[] = [
    { t: '一致', d: '统一 Token 与组件，杜绝页面里散写的 style={{}} 视觉碎片化。' },
    { t: '克制', d: '无卡片化：靠留白与标题层级区分板块，不套厚黑框。' },
    { t: '可达', d: '键盘 / 读屏友好，44px 触控，对比度达标。' },
    { t: '单色', d: '单一黑绿 #34D399 作强调，禁大面积刺眼红/绿/蓝。' },
  ]

  const tabItems: TabItem[] = [
    { value: 'overview', label: '总览' },
    { value: 'gap', label: '缺口' },
    { value: 'road', label: '路线' },
  ]
  const segItems: TabItem[] = [
    { value: 'day', label: '日' },
    { value: 'week', label: '周' },
    { value: 'month', label: '月' },
  ]

  return (
    <div className="space-y-16">
      <PageHeader
        title="界面设计系统"
        desc="中性碳黑 #09090B · 单一黑绿强调 #34D399 · Web 响应式 · WCAG AA。组件与 Token 可直接用于 总览 / 缺口 / 路线 / 图谱 / 数据 五个页面。"
        actions={<Badge tone="primary" dot>设计系统 v2.0 · 无卡片化暗黑</Badge>}
      />

      <Section title="设计原则">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {principles.map((p, i) => (
            <div key={p.t}>
              <div className="font-mono text-xs font-medium text-accent">{`0${i + 1}`}</div>
              <div className="mt-1 font-display text-lg font-semibold text-text">{p.t}</div>
              <p className="mt-1 text-sm text-muted">{p.d}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="色彩 Token">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {tokens.map((t) => (
            <div key={t.name} className="overflow-hidden rounded-xl border border-border">
              <div className="h-16" style={{ background: t.value }} />
              <div className="bg-surface-solid px-3 py-2">
                <div className="font-mono text-xs text-text">{t.name}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="success" dot>
            已具备
          </Badge>
          <Badge tone="warning" dot>
            待补
          </Badge>
          <Badge tone="danger" dot>
            缺口
          </Badge>
          <Badge tone="info" dot>
            情报
          </Badge>
          <Badge tone="primary">AI 工程化</Badge>
          <Badge tone="neutral">React</Badge>
        </div>
      </Section>

      <Section title="排版比例">
        <div className="space-y-3">
          {typeScale.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between border-b border-border pb-3 last:border-0">
              <span className={`${row.cls} text-text`}>{row.label}</span>
              <span className="font-mono text-xs text-muted">{row.cls}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="按钮 Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>主操作</Button>
          <Button variant="secondary">次操作</Button>
          <Button variant="ghost">幽灵</Button>
          <Button variant="danger">危险</Button>
          <Button loading>加载中</Button>
          <Button size="sm">小</Button>
          <Button size="lg">大</Button>
          <IconButton label="设置">⚙</IconButton>
          <IconButton label="刷新" variant="secondary">
            ↻
          </IconButton>
        </div>
      </Section>

      <Section title="表单 Form">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="目标岗位" hint="例如：AI Agent 前端">
            <Input placeholder="输入岗位名" defaultValue="前端工程师" />
          </Field>
          <Field label="城市" error="请选择城市">
            <Select invalid defaultValue="">
              <option value="">请选择</option>
              <option>深圳</option>
              <option>上海</option>
              <option>北京</option>
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="备注">
              <Textarea placeholder="补充你的背景…" />
            </Field>
          </div>
        </div>
      </Section>

      <Section title="状态 · 导航 · 开关">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <Tabs tabs={tabItems} value={tab} onChange={setTab} />
            <Segmented tabs={segItems} value={seg} onChange={setSeg} className="max-w-[240px]" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Switch checked={sw} onChange={setSw} label="自动同步" />
            <span className="text-sm text-muted">自动同步 Boss 直聘数据</span>
            <Tooltip label="悬停查看提示">
              <span className="cursor-help text-muted">ⓘ</span>
            </Tooltip>
            <span className="text-sm text-muted">
              快捷键 <Kbd>⌘</Kbd> <Kbd>K</Kbd>
            </span>
          </div>
        </div>
      </Section>

      <Section title="指标 · 进度">
        <div className="grid gap-8 sm:grid-cols-3">
          <StatCard label="已分析岗位" value="89" delta="↑ 12 本周" deltaTone="up" />
          <StatCard label="能力缺口" value="12" delta="AI + 视觉工具" deltaTone="flat" />
          <StatCard label="覆盖率" value="75%" delta="↓ 3%" deltaTone="down" />
        </div>
        <div className="space-y-3">
          <Meter label="React" value={36} tone="accent" showValue />
          <Meter label="TypeScript" value={30} tone="accent" showValue />
          <Meter label="AI 工程化" value={6} tone="accent" showValue />
          <Meter label="WebGL" value={3} tone="accent" showValue />
        </div>
      </Section>

      <Section title="表格 Table">
        <Table
          columns={[
            { key: 'skill', title: '技能' },
            { key: 'level', title: '你的水平', align: 'center' },
            { key: 'freq', title: '市场频次', align: 'right' },
          ]}
          rows={[
            { skill: 'React', level: <Badge tone="success">熟练</Badge>, freq: '92' },
            { skill: 'AI 工程化', level: <Badge tone="danger">从零</Badge>, freq: '64' },
            { skill: 'WebGL', level: <Badge tone="warning">了解</Badge>, freq: '28' },
          ]}
        />
      </Section>

      <Section title="反馈状态">
        {alertOpen && (
          <Alert tone="success" title="数据已是最新" onClose={() => setAlertOpen(false)}>
            最近同步：2 分钟前 · 共 89 条岗位分析。
          </Alert>
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          <EmptyState icon="🔍" title="暂无数据" desc="先运行采集，再回来看你的能力图谱。" action={<Button size="sm">去采集</Button>} />
          <div className="space-y-3">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-20 w-full" />
          </div>
        </div>
      </Section>

      <footer className="border-t border-border pt-6 text-sm text-muted">
        设计系统组件位于 <code className="font-mono">src/design-system</code>，Token 见{' '}
        <code className="font-mono">src/index.css</code>。访问本页（/design-system）即可实时预览与验收。
      </footer>
    </div>
  )
}
