import { useRef, useState } from "react"
import { importJobs, type Job } from "../api/client"
import { cn } from "../lib/cn"
import { Button, Textarea } from "../design-system"

// v2：无卡片化。仅标题 + 内容，靠留白分隔；拖拽区用虚线 hairline，扁平不浮。
export default function ImportPanel({ onImported }: { onImported: () => void }) {
  const [text, setText] = useState("")
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function doImport(payload: Job[] | { jobs: Job[] }, fromFile: boolean) {
    setBusy(true)
    setMsg(null)
    try {
      await importJobs(payload)
      setMsg({ kind: "ok", text: "导入成功，列表已刷新。" })
      if (!fromFile) setText("") // 仅成功清空粘贴框；文件导入保留界面状态
      onImported()
    } catch (e) {
      // 失败时保留输入，仅高亮错误
      setMsg({ kind: "err", text: `导入失败：${String(e)}` })
    } finally {
      setBusy(false)
    }
  }

  async function submitText() {
    if (!text.trim()) return
    try {
      const data = JSON.parse(text) as Job[] | { jobs: Job[] }
      await doImport(data, false)
    } catch (e) {
      setMsg({ kind: "err", text: `JSON 解析失败：${String(e)}` })
    }
  }

  async function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const data = JSON.parse(String(reader.result)) as Job[] | { jobs: Job[] }
        await doImport(data, true)
      } catch (e) {
        setMsg({ kind: "err", text: `文件解析失败：${String(e)}` })
      }
    }
    reader.onerror = () => setMsg({ kind: "err", text: "读取文件失败。" })
    reader.readAsText(file)
  }

  return (
    <section aria-labelledby="import-title" className="space-y-4">
      <h2 id="import-title" className="font-display text-lg font-semibold tracking-tight text-text">
        手动导入 JD
      </h2>

      {/* 拖拽 / 点击选择文件 */}
      <div
        role="button"
        tabIndex={0}
        aria-label="拖拽或点击选择 JD JSON 文件"
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            fileRef.current?.click()
          }
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          const f = e.dataTransfer.files?.[0]
          if (f) handleFile(f)
        }}
        className={cn(
          "flex min-h-[88px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-4 text-center transition-colors",
          dragging ? "border-accent bg-accent/10" : "border-border hover:border-accent/60",
        )}
      >
        <span className="text-sm text-text">拖拽 .json 文件到此处，或点击选择</span>
        <span className="mt-1 text-xs text-muted">支持数组或 {"{ jobs: [...] }"} 包裹</span>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        aria-label="选择 JD JSON 文件"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
          e.target.value = "" // 允许重复选择同一文件
        }}
      />

      {/* 粘贴兜底（开发者向） */}
      <Textarea
        id="jd-input"
        aria-label="JD JSON 内容"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder='[{"title":"前端工程师","company":"某司","location":"深圳","raw":"...","extracted":{...}}]'
        className="font-mono"
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={submitText} loading={busy} disabled={!text.trim()}>
          {busy ? "导入中…" : "导入粘贴内容"}
        </Button>
        <span className="text-xs text-muted">与爬虫同 schema</span>
      </div>

      {msg && (
        <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-text">
          <span aria-hidden="true" className={cn("h-2 w-2 rounded-full", msg.kind === "ok" ? "bg-accent" : "bg-danger")} />
          {msg.text}
        </p>
      )}
    </section>
  )
}
