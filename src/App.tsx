import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { HomePage } from './pages/HomePage'
import { LogPage } from './pages/LogPage'
import { RoutinesPage } from './pages/RoutinesPage'
import { StatsPage } from './pages/StatsPage'
import { FeedPage } from './pages/FeedPage'
import { HistoryPage } from './pages/HistoryPage'
import { SessionDetailPage } from './pages/SessionDetailPage'
import { ProfileProvider, useProfile } from './context/ProfileContext'
import { OnboardingPage } from './pages/OnboardingPage'

export default function App() {
  return (
    <ProfileProvider>
      <Gate />
    </ProfileProvider>
  )
}

// 프로필 유무에 따라 온보딩 또는 앱 본체를 보여주는 게이트
function Gate() {
  const { profile, loading, error } = useProfile()

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-dim)]">
        불러오는 중…
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
        <div className="text-2xl">⚠️</div>
        <p className="text-sm text-[var(--color-danger)]">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white"
        >
          새로고침
        </button>
      </div>
    )
  }

  if (!profile) {
    return <OnboardingPage />
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<HomePage />} />
          <Route path="log" element={<LogPage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="session/:date" element={<SessionDetailPage />} />
          <Route path="routines" element={<RoutinesPage />} />
          <Route path="stats" element={<StatsPage />} />
          <Route path="feed" element={<FeedPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
