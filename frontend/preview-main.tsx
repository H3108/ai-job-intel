// 预览入口（与 main.tsx 相同，但跳过 @fontsource 字体导入）。
// 原因：样式任务的 @fontsource 字体包在本环境安装时 OOM，预览阶段用系统字体兜底即可；
// 生产构建由样式任务在其环境装好字体后通过正式 main.tsx 入口进行。
import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import "./index.css"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
