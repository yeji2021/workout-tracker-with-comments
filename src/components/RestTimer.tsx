import { useEffect, useState } from 'react'

// 세트 완료 시 시작되는 휴식 타이머. endsAt(타임스탬프 ms)까지 카운트다운.
// 탭을 벗어나도 정확하도록 실제 시각(Date.now)으로 계산한다.
export function RestTimer({
  endsAt,
  onAdjust,
  onDismiss,
}: {
  endsAt: number
  onAdjust: (deltaSeconds: number) => void
  onDismiss: () => void
}) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])

  const remainingMs = Math.max(0, endsAt - now)
  const remainingSec = Math.ceil(remainingMs / 1000)
  const mm = Math.floor(remainingSec / 60)
  const ss = remainingSec % 60
  const done = remainingMs === 0

  return (
    <div
      className="fixed bottom-0 left-1/2 z-40 w-full max-w-md -translate-x-1/2 border-t border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2.5"
      style={{ marginBottom: 'calc(5rem + var(--safe-bottom))' }}
    >
      <div className="flex items-center gap-3">
        <span className="text-lg">{done ? '✅' : '⏱️'}</span>
        <div className="flex-1">
          <div className="text-xs text-[var(--color-text-dim)]">
            {done ? '휴식 완료' : '휴식 중'}
          </div>
          <div className="font-mono text-lg font-bold tabular-nums">
            {mm}:{String(ss).padStart(2, '0')}
          </div>
        </div>
        {!done && (
          <button
            onClick={() => onAdjust(15)}
            className="rounded-lg bg-[var(--color-surface)] px-3 py-1.5 text-xs font-semibold"
          >
            +15초
          </button>
        )}
        <button
          onClick={onDismiss}
          className="rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-white"
        >
          {done ? '닫기' : '건너뛰기'}
        </button>
      </div>
    </div>
  )
}
