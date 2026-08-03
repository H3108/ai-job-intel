import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"

// 自托管字体（@fontsource）：仅保留 Space Grotesk 作拉丁展示字体。
// 中文走系统字体栈（PingFang SC / 微软雅黑 / system-ui），零下载、零 404，
// 首屏传输减少 ~0.8–1.1MB（见 docs/PERF_AUDIT.md P0-1）。
import "@fontsource/space-grotesk/500.css"
import "@fontsource/space-grotesk/600.css"
import "@fontsource/space-grotesk/700.css"

import "./index.css"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
