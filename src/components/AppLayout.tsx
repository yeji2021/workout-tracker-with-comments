import { NavLink, Outlet } from 'react-router-dom'
import { useProfile } from '../context/ProfileContext'
import { useFeedUnread } from '../lib/feedUnread'
import { WorkoutStartToast } from './WorkoutStartToast'
import { UpdateToast } from './UpdateToast'

interface Tab {
  to: string
  label: string
  icon: string
}

// 6개 탭: 홈(오늘 운동) / 기록(캘린더) / 내 루틴 / 가져오기 / 통계 / 피드
// '가져오기'는 링크를 붙여넣는 진입점이라 루틴 옆에 둔다. 6개는 max-w-md
// 기준 탭당 약 74px(작은 폰에서도 62px)이라 2~4글자 라벨이 줄바꿈 없이 들어간다.
const TABS: Tab[] = [
  { to: '/', label: '오늘', icon: '🏋️' },
  { to: '/history', label: '기록', icon: '🗓️' },
  { to: '/routines', label: '루틴', icon: '📋' },
  { to: '/import', label: '가져오기', icon: '🎬' },
  { to: '/stats', label: '통계', icon: '📊' },
  { to: '/feed', label: '피드', icon: '💬' },
]

export function AppLayout() {
  const { profile } = useProfile()
  const feedUnread = useFeedUnread(profile?.profile_id)

  return (
    <div className="mx-auto flex h-full max-w-md flex-col bg-[var(--color-bg)]">
      {/* 콘텐츠 영역 — 하단 탭바 높이만큼 여백 확보 */}
      <main
        className="flex-1 overflow-y-auto"
        style={{ paddingTop: 'var(--safe-top)', paddingBottom: '5rem' }}
      >
        <Outlet />
      </main>

      {/* 그룹 멤버 운동 시작 팝업 — 어느 탭에서든 표시 */}
      <WorkoutStartToast />

      {/* 새 버전 배포 감지 시 업데이트 유도 토스트 */}
      <UpdateToast />

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
                <span className="relative text-xl leading-none">
                  {tab.icon}
                  {/* 피드 탭 안읽음 표시 */}
                  {tab.to === '/feed' && feedUnread && (
                    <span className="absolute -right-1 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--color-surface)] bg-[var(--color-danger)]" />
                  )}
                </span>
                {/* 라벨 길이가 섞여 있어 좁은 화면에서 줄바꿈되지 않게 고정 */}
                <span className="whitespace-nowrap">{tab.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
