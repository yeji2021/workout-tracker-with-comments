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

// iOS 홈 화면 앱은 실행 직후 레이아웃 뷰포트를 실제 화면보다 작게 잡는 일이
// 있다. 그러면 100dvh 로 잡은 셸이 화면보다 짧아지고, 셸 바닥에 붙은 탭바가
// 화면 바닥에서 떠서 그 아래에 같은 색 배경이 드러난다 — "탭바 밑 빈 공백".
// 웹 인스펙터를 붙이면 리레이아웃되며 저절로 고쳐지던 게 이 현상의 증거였다
// (실측: 탭바 바닥이 화면 바닥보다 58px 위).
// 홈 화면 앱은 브라우저 UI 가 없어 웹뷰 = 화면 전체이므로, 세로에서는
// screen.height 를 하한으로 써서 이 오차를 덮는다. (screen.height 는 iOS 에서
// 방향과 무관하게 세로 기준 높이라, 가로일 땐 쓰면 안 된다.)
function appHeight(): number {
  const ih = window.innerHeight
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  if (!standalone) return ih
  const portrait = window.innerWidth === window.screen.width
  return portrait ? Math.max(ih, window.screen.height) : ih
}

export function AppLayout() {
  const { profile } = useProfile()
  const feedUnread = useFeedUnread(profile?.profile_id)
  const navRef = useRef<HTMLElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)

  // 셸 높이를 CSS(100dvh) 대신 실측값으로 못박는다. iOS 가 뷰포트를 늦게
  // 확정하므로 첫 프레임 한 번으로는 부족해 몇 차례 다시 재고, 이후에도
  // 회전·복귀 등 값이 바뀔 만한 시점마다 갱신한다.
  useEffect(() => {
    const el = shellRef.current
    if (!el) return
    const apply = () => {
      el.style.height = `${appHeight()}px`
    }
    apply()
    const raf = requestAnimationFrame(apply)
    const timers = [50, 250, 1000].map((ms) => setTimeout(apply, ms))
    const events = ['resize', 'orientationchange', 'pageshow'] as const
    events.forEach((e) => window.addEventListener(e, apply))
    document.addEventListener('visibilitychange', apply)
    return () => {
      cancelAnimationFrame(raf)
      timers.forEach(clearTimeout)
      events.forEach((e) => window.removeEventListener(e, apply))
      document.removeEventListener('visibilitychange', apply)
    }
  }, [])

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
    // 높이는 위 effect 가 실측값으로 덮어쓴다. CSS 의 100dvh 는 JS 가 돌기 전
    // 첫 페인트용 폴백이다. overflow-hidden 이라 셸은 스크롤되지 않고
    // 스크롤은 main 만 담당한다.
    <div
      ref={shellRef}
      className="app-shell mx-auto flex max-w-md flex-col overflow-hidden bg-[var(--color-bg)]"
    >
      {/* 콘텐츠 영역 — 탭바가 이제 실제 자리를 차지하므로 하단 여백은 불필요 */}
      <main
        className="flex-1 overflow-y-auto"
        style={{ paddingTop: 'var(--safe-top)' }}
      >
        <Outlet />
      </main>

      {/* 그룹 멤버 운동 시작 팝업 — 어느 탭에서든 표시 */}
      <WorkoutStartToast />

      {/* 새 버전 배포 감지 시 업데이트 유도 토스트 */}
      <UpdateToast />

      {/* 하단 탭바 — position:fixed 를 쓰지 않는다.
          실기기 진단(레이어 색칠)에서 탭바 아래 띠의 정체가 body 배경으로
          확인됐다. iOS standalone 에서 fixed 탭바가 레이아웃 박스 바닥에 정확히
          정렬되지 않아 아래에 body 가 드러나고, 배경을 화면 밖까지 흘려보내던
          ::after 보험조차 fixed 합성 레이어 경계에서 잘려나가 소용이 없었다.
          (그래서 CSS 를 아무리 고쳐도 안 잡혔다.)

          애초에 fixed 일 이유가 없다 — 이 nav 는 100dvh 플렉스 컬럼의 마지막
          자식이라 일반 흐름에 두면 항상 셸 바닥에 딱 붙는다. fixed 를 걷어내면
          iOS 의 fixed 관련 퀴크(합성 레이어, 러버밴드, 클리핑)가 통째로 사라진다. */}
      <nav
        ref={navRef}
        className="w-full border-t border-[var(--color-border)] bg-[var(--color-bg)]"
        style={{ paddingBottom: 'var(--tabbar-safe-pad)' }}
      >
        <ul className="flex">
          {TABS.map((tab) => (
            <li key={tab.to} className="flex-1">
              <NavLink
                to={tab.to}
                end={tab.to === '/'}
                className={({ isActive }) =>
                  [
                    // pb 를 pt 보다 줄인 건 아래 안전영역 패딩이 이어 붙기 때문.
                    // 양쪽을 py-2 로 두면 라벨 아래 여백이 이중으로 쌓여 보인다.
                    'flex flex-col items-center gap-0.5 pt-2 pb-1 text-[11px] font-medium transition-colors',
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
