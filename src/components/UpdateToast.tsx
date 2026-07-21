import { useRegisterSW } from 'virtual:pwa-register/react'

// 새 버전 배포 감지 시 자동 새로고침 대신 사용자가 직접 눌러야 반영되는 토스트.
// 운동 중 자동 새로고침되면 입력하던 세트가 날아갈 수 있어 확인을 받는다.
// 홈 화면 PWA는 "종료 후 재실행"이 완전한 페이지 로드가 아니라 화면 복원이라
// 포그라운드 복귀 시점에 직접 업데이트를 확인해야 한다(iOS 대응).
export function UpdateToast() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration.update()
      })
      setInterval(() => registration.update(), 60 * 60 * 1000)
    },
  })

  if (!needRefresh) return null

  return (
    <div
      className="fixed left-1/2 z-50 flex w-full max-w-md -translate-x-1/2 justify-center px-4"
      style={{ bottom: 'calc(5rem + var(--safe-bottom))' }}
    >
      <button
        onClick={() => updateServiceWorker(true)}
        className="flex items-center gap-2 rounded-full border border-[var(--color-accent)] bg-[var(--color-surface)] px-4 py-2 text-sm font-semibold shadow-lg"
      >
        <span aria-hidden className="text-lg">
          ✨
        </span>
        새 버전이 있어요 — 탭해서 업데이트
      </button>
    </div>
  )
}
