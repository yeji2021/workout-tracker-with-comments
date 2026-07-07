import { useEffect, useState } from 'react'

const DISMISS_KEY = 'wt_install_prompt_dismissed'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari 전용 플래그
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

// 홈화면 설치 유도. 저장소가 브라우저 컨텍스트에 묶여 있어(iOS ITP 등),
// 설치해야 로그인 상태가 안정적으로 유지된다 — Phase 7 개선 1번의 근본 해결책.
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  )
  const [showIOSHint, setShowIOSHint] = useState(false)
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISS_KEY) === '1',
  )

  useEffect(() => {
    if (isStandalone() || dismissed) return

    if (isIOS()) {
      setShowIOSHint(true)
      return
    }

    function onBeforeInstall(e: Event) {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    return () =>
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  }, [dismissed])

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  async function install() {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice
    setDeferred(null)
    dismiss()
  }

  if (dismissed || (!deferred && !showIOSHint)) return null

  return (
    <div className="mb-4 flex items-center gap-3 rounded-2xl border border-[var(--color-accent)] bg-[var(--color-surface)] p-3.5">
      <div className="text-2xl">📲</div>
      <div className="flex-1 text-xs text-[var(--color-text-dim)]">
        {showIOSHint ? (
          <>
            <span className="font-semibold text-[var(--color-text)]">
              홈 화면에 추가
            </span>
            하면 로그인 상태가 유지되고 앱처럼 빠르게 열려요. 공유 버튼{' '}
            <span aria-hidden>⬆️</span> → "홈 화면에 추가"를 눌러주세요.
          </>
        ) : (
          <>
            <span className="font-semibold text-[var(--color-text)]">
              앱으로 설치
            </span>
            하면 로그인 상태가 유지되고 더 빠르게 열려요.
          </>
        )}
      </div>
      {!showIOSHint && (
        <button
          onClick={install}
          className="shrink-0 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-white"
        >
          설치
        </button>
      )}
      <button
        onClick={dismiss}
        aria-label="닫기"
        className="shrink-0 text-[var(--color-text-dim)]"
      >
        ✕
      </button>
    </div>
  )
}
