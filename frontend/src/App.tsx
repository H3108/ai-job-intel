import { lazy } from "react"
import { Routes, Route } from "react-router-dom"
import ErrorBoundary from "./components/ErrorBoundary"

const Dashboard = lazy(() => import("./pages/Dashboard"))
const MarketPage = lazy(() => import("./pages/MarketPage"))
const JobDetailPage = lazy(() => import("./pages/JobDetailPage"))
const PersonaPage = lazy(() => import("./pages/PersonaPage"))
const RoadmapPage = lazy(() => import("./pages/RoadmapPage"))
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"))

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/market" element={<MarketPage />} />
        <Route path="/jobs/:id" element={<JobDetailPage />} />
        <Route path="/profile" element={<PersonaPage />} />
        <Route path="/roadmap" element={<RoadmapPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </ErrorBoundary>
  )
}
