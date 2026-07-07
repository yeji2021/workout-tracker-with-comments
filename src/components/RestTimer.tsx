import { useEffect, useRef, useState } from 'react'
import {
  isRestSoundMuted,
  playRestDoneBeep,
  setRestSoundMuted,
  vibrateRestDone,
} from '../lib/audio'

// 세트 완료 시 시작되는 휴식 타이머. endsAt(타임스탬프 ms)까지 카운트다운.
// 탭을 벗어나도 정확하도록 실제 시각(Date.now)으로 계산한다.
export function RestTimer({
  endsAt,
  baseSeconds,
  onAdjust,
  onDismiss,
}: {
  endsAt: number
  // 이 운동의 현재 기본 휴식값(조정하면 저장되어 다음부터 적용됨)
  baseSeconds?: number
  onAdjust: (deltaSeconds: number) => void
  onDismiss: () => void
}) {
  const [now, setNow] = useState(() => Date.now())
  const [muted, setMuted] = useState(() => isRestSoundMuted())
  const alarmedRef = useRef(false)

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])

  // endsAt이 바뀌면(새 세트 완료로 새 타이머 시작) 알림 1회 재무장
  useEffect(() => {
    alarmedRef.current = false
  }, [endsAt])

  const remainingMs = Math.max(0, endsAt - now)
  const remainingSec = Math.ceil(remainingMs / 1000)
  const mm = Math.floor(remainingSec / 60)
  const ss = remainingSec % 60
  const done = remainingMs === 0

  useEffect(() => {
    if (done && !alarmedRef.current) {
      alarmedRef.current = true
      playRestDoneBeep()
      vibrateRestDone()
    }
  }, [done])

  function toggleMute() {
    const next = !muted
    setMuted(next)
    setRestSoundMuted(next)
  }

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
            {!done && baseSeconds != null && (
              <span> · 이 운동 기본 {baseSeconds}초</span>
            )}
          </div>
          <div className="font-mono text-lg font-bold tabular-nums">
            {mm}:{String(ss).padStart(2, '0')}
          </div>
        </div>
        <button
          onClick={toggleMute}
          aria-label={muted ? '알림음 켜기' : '알림음 끄기'}
          className="rounded-lg bg-[var(--color-surface)] px-2 py-1.5 text-sm"
        >
          {muted ? '🔕' : '🔔'}
        </button>
        {!done && (
          <>
            <button
              onClick={() => onAdjust(-10)}
              className="rounded-lg bg-[var(--color-surface)] px-2.5 py-1.5 text-xs font-semibold"
            >
              −10초
            </button>
            <button
              onClick={() => onAdjust(10)}
              className="rounded-lg bg-[var(--color-surface)] px-2.5 py-1.5 text-xs font-semibold"
            >
              +10초
            </button>
          </>
        )}
        <button
          onClick={onDismiss}
          className="rounded-lg bg-[var(--color-accent)] px-2.5 py-1.5 text-xs font-semibold text-white"
        >
          {done ? '닫기' : '건너뛰기'}
        </button>
      </div>
    </div>
  )
}
