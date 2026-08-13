import { useEffect, useRef } from 'react'
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
  const navRef = useRef<HTMLElement>(null)

  // 탭바의 실제 렌더 높이를 측정해 --tabbar-h에 반영한다. 폰트/라벨 변경으로
  // 실측 높이가 하드코딩한 값과 어긋나면 콘텐츠/플로팅 바 아래에 빈 여백이
  // 생기는 문제가 있었어서, 값을 하드코딩하지 않고 항상 실측치를 쓴다.
  useEffect(() => {
    const el = navRef.current
    if (!el) return
    // safe-area 인셋(padding-bottom)은 빼고 "바 자체 높이"만 재서 넘긴다.
    // ResizeObserver는 패딩만 바뀌면 콜백을 주지 않아(border-box 옵션도 동일),
    // 인셋을 측정값에 포함시키면 인셋이 늦게 확정되거나 화면 회전(세로 34px ↔
    // 가로 21px)될 때 값이 낡은 채로 남는다. 인셋은 CSS에서 더한다.
    const update = () => {
      const pb = parseFloat(getComputedStyle(el).paddingBottom) || 0
      document.documentElement.style.setProperty(
        '--tabbar-content-h',
        `${el.getBoundingClientRect().height - pb}px`,
      )
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div className="mx-auto flex h-full max-w-md flex-col bg-[var(--color-bg)]">
      {/* 콘텐츠 영역 — 하단 탭바 높이만큼 여백 확보 */}
      <main
        className="flex-1 overflow-y-auto"
        style={{ paddingTop: 'var(--safe-top)', paddingBottom: 'var(--tabbar-h)' }}
      >
        <Outlet />
      </main>

      {/* 그룹 멤버 운동 시작 팝업 — 어느 탭에서든 표시 */}
      <WorkoutStartToast />

      {/* 새 버전 배포 감지 시 업데이트 유도 토스트 */}
      <UpdateToast />

      {/* 하단 탭바 (모바일 앱 스타일, safe-area 대응)
          iOS standalone(홈 화면 앱)에서 fixed + transform + backdrop-filter 조합은
          별도 합성 레이어로 올라가 러버밴드 스크롤 시 뷰포트 하단까지 칠해지지
          않고 빈 띠를 남긴다. 그래서 중앙 정렬은 transform 대신 inset-x-0+mx-auto로,
          배경은 반투명+blur 대신 불투명으로 처리한다. */}
      <nav
        ref={navRef}
        className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-md border-t border-[var(--color-border)] bg-[var(--color-bg)]"
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
                  {/* 피드 탭 안읽음 표시 — 테두리는 탭바 배경과 같은 색이라야
                      점이 깔끔하게 떨어진다 */}
                  {tab.to === '/feed' && feedUnread && (
                    <span className="absolute -right-1 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--color-bg)] bg-[var(--color-danger)]" />
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
