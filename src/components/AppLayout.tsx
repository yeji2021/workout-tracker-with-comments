import { NavLink, Outlet } from 'react-router-dom'

interface Tab {
  to: string
  label: string
  icon: string
}

// 4개 탭: 홈(오늘 운동) / 내 루틴 / 통계 / 피드
const TABS: Tab[] = [
  { to: '/', label: '오늘', icon: '🏋️' },
  { to: '/routines', label: '루틴', icon: '📋' },
  { to: '/stats', label: '통계', icon: '📊' },
  { to: '/feed', label: '피드', icon: '💬' },
]

export function AppLayout() {
  return (
    <div className="mx-auto flex h-full max-w-md flex-col bg-[var(--color-bg)]">
      {/* 콘텐츠 영역 — 하단 탭바 높이만큼 여백 확보 */}
      <main
        className="flex-1 overflow-y-auto"
        style={{ paddingTop: 'var(--safe-top)', paddingBottom: '5rem' }}
      >
        <Outlet />
      </main>

      {/* 하단 탭바 (모바일 앱 스타일, safe-area 대응) */}
      <nav
        className="fixed bottom-0 left-1/2 w-full max-w-md -translate-x-1/2 border-t border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur"
        style={{ paddingBottom: 'var(--safe-bottom)' }}
      >
        <ul className="flex">
          {TABS.map((tab) => (
            <li key={tab.to} className="flex-1">
              <NavLink
                to={tab.to}
                end={tab.to === '/'}
                className={({ isActive }) =>
                  [
                    'flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors',
                    isActive
                      ? 'text-[var(--color-accent)]'
                      : 'text-[var(--color-text-dim)]',
                  ].join(' ')
                }
              >
                <span className="text-xl leading-none">{tab.icon}</span>
                <span>{tab.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
