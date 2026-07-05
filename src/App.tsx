import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { HomePage } from './pages/HomePage'
import { RoutinesPage } from './pages/RoutinesPage'
import { StatsPage } from './pages/StatsPage'
import { FeedPage } from './pages/FeedPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<HomePage />} />
          <Route path="routines" element={<RoutinesPage />} />
          <Route path="stats" element={<StatsPage />} />
          <Route path="feed" element={<FeedPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
