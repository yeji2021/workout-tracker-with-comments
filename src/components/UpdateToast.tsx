import { useEffect } from 'react'
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

  // 토스트를 안 누르면 새 SW가 waiting 상태로 영원히 머물고, 홈 화면 앱은
  // 앱을 껐다 켜도 precache된 구버전 index.html/CSS를 계속 재사용한다.
  // (탭바 아래 여백 버그를 두 번 고쳤는데도 폰에서 그대로 보였던 원인)
  // 그래서 앱이 백그라운드로 넘어간 순간 — 즉 입력 중이 아닌 게 확실한 때 —
  // 리로드 없이 새 SW만 활성화시켜 둔다. 다음에 앱을 열면 새 에셋으로 뜬다.
  useEffect(() => {
    if (!needRefresh) return
    const onHidden = () => {
      if (document.visibilityState === 'hidden') updateServiceWorker(false)
    }
    document.addEventListener('visibilitychange', onHidden)
    return () => document.removeEventListener('visibilitychange', onHidden)
  }, [needRefresh, updateServiceWorker])

  if (!needRefresh) return null

  return (
    <div
      className="fixed left-1/2 z-50 flex w-full max-w-md -translate-x-1/2 justify-center px-4"
      style={{ bottom: 'var(--tabbar-h)' }}
    >
      <button
        onClick={async () => {
          // skipWaiting 만 보내고 직접 리로드한다. updateServiceWorker(true)는
          // controllerchange 이벤트에 리로드를 의존해서, 이미 활성화된 뒤에
          // 누르면(위 백그라운드 경로) 아무 일도 일어나지 않는다.
          await updateServiceWorker(false)
          window.location.reload()
        }}
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
