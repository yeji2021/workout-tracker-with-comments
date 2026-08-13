import { useEffect, useRef, useState } from 'react'
import {
  cancelScheduledRestBeep,
  isRestSoundMuted,
  playRestDoneBeep,
  scheduleRestBeep,
  setRestSoundMuted,
  vibrateRestDone,
} from '../lib/audio'
import { cancelTimerNotification, scheduleTimerNotification } from '../lib/notify'
import { acquireWakeLock, releaseWakeLock } from '../lib/wakeLock'

// 시간 기반(코어) 운동의 ▶ 타이머. targetSeconds가 있으면 카운트다운, null이면
// 카운트업(스톱워치) — RestTimer/ElapsedTimer와 동일하게 Date.now() 절대시각 기반이라
// 탭 이탈/백그라운드에도 정확하다. LogPage가 상태를 들고 있고 이 컴포넌트는 표시/카운트만
// 담당한다(RestTimer와 같은 구조).
//
// 주의: unlockAudio()/ensureNotifyPermission()은 여기서 부르지 않는다. 이 컴포넌트가
// 마운트되는 시점엔 이미 사용자 제스처(▶ 탭)가 리액트 상태 업데이트를 거쳐 지나간 뒤라
// iOS가 두 호출 다 거부한다 — 부모(LogPage)가 ▶ onClick 핸들러 안에서 동기적으로
// 먼저 호출해둬야 한다(toggleComplete의 제스처 타이밍 주석과 같은 이유).
export function ExerciseTimer({
  startedAt,
  targetSeconds,
  exerciseName,
  onComplete,
  onCancel,
}: {
  startedAt: number
  targetSeconds: number | null
  exerciseName?: string
  onComplete: (actualSeconds: number) => void
  onCancel: () => void
}) {
  const isCountdown = targetSeconds != null
  const [target, setTarget] = useState(targetSeconds)
  const [now, setNow] = useState(() => Date.now())
  const [muted, setMuted] = useState(() => isRestSoundMuted())
  const alarmedRef = useRef(false)
  const finishedRef = useRef(false) // onComplete/onCancel 중복 호출 방지

  const endsAt = target != null ? startedAt + target * 1000 : null

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])

  // 백그라운드 탭 복귀 시 즉시 재계산 (RestTimer와 동일 패턴)
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') {
        setNow(Date.now())
        acquireWakeLock()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  useEffect(() => {
    acquireWakeLock()
    return () => releaseWakeLock()
  }, [])

  // 카운트다운 모드에서만 비프/알림 예약. endsAt이 바뀌면(±10초 조정) 재예약한다.
  useEffect(() => {
    if (endsAt == null) return
    scheduleRestBeep(endsAt)
    scheduleTimerNotification(endsAt, {
      title: `${exerciseName ?? '운동'} 시간 종료!`,
      body: '완료를 확인해주세요',
    })
    return () => {
      cancelScheduledRestBeep()
      cancelTimerNotification()
    }
  }, [endsAt, exerciseName])

  const elapsedMs = Math.max(0, now - startedAt)
  const elapsedSec = Math.floor(elapsedMs / 1000)
  const remainingMs = endsAt != null ? Math.max(0, endsAt - now) : null
  const remainingSec = remainingMs != null ? Math.ceil(remainingMs / 1000) : null
  const done = remainingMs === 0

  const displaySec = isCountdown ? remainingSec ?? 0 : elapsedSec
  const mm = Math.floor(displaySec / 60)
  const ss = displaySec % 60

  // 카운트다운 0 도달 시 자동 완료 (1회만)
  useEffect(() => {
    if (done && !alarmedRef.current) {
      alarmedRef.current = true
      playRestDoneBeep(endsAt ?? undefined)
      vibrateRestDone()
      releaseWakeLock()
      finish(() => onComplete(target ?? elapsedSec))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done])

  function finish(action: () => void) {
    if (finishedRef.current) return
    finishedRef.current = true
    cancelScheduledRestBeep()
    cancelTimerNotification()
    releaseWakeLock()
    action()
  }

  function handleComplete() {
    finish(() => onComplete(elapsedSec))
  }

  function handleCancel() {
    finish(onCancel)
  }

  function toggleMute() {
    const next = !muted
    setMuted(next)
    setRestSoundMuted(next)
    if (endsAt == null) return
    if (next || done) cancelScheduledRestBeep()
    else scheduleRestBeep(endsAt)
  }

  function adjustTarget(deltaSeconds: number) {
    setTarget((prev) => Math.max(0, (prev ?? 0) + deltaSeconds))
  }

  return (
    <div className="mt-3 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2.5 shadow-lg">
      <div className="flex items-center gap-3">
        <span className="text-lg">{done ? '✅' : '⏱️'}</span>
        <div className="flex-1 truncate">
          <div className="truncate text-xs text-[var(--color-text-dim)]">
            {done ? '시간 종료' : isCountdown ? '운동 중' : '운동 중 (스톱워치)'}
            {exerciseName && <span> · {exerciseName}</span>}
          </div>
          <div className="font-mono text-lg font-bold tabular-nums">
            {mm}:{String(ss).padStart(2, '0')}
          </div>
        </div>
        <button
          onClick={handleComplete}
          className="whitespace-nowrap rounded-lg bg-[var(--color-accent)] px-2.5 py-1.5 text-xs font-semibold text-white"
        >
          완료
        </button>
      </div>
      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          onClick={toggleMute}
          aria-label={muted ? '알림음 켜기' : '알림음 끄기'}
          className="rounded-lg bg-[var(--color-surface)] px-2 py-1.5 text-sm"
        >
          {muted ? '🔕' : '🔔'}
        </button>
        {isCountdown && !done && (
          <>
            <button
              onClick={() => adjustTarget(-10)}
              className="whitespace-nowrap rounded-lg bg-[var(--color-surface)] px-2.5 py-1.5 text-xs font-semibold"
            >
              −10초
            </button>
            <button
              onClick={() => adjustTarget(10)}
              className="whitespace-nowrap rounded-lg bg-[var(--color-surface)] px-2.5 py-1.5 text-xs font-semibold"
            >
              +10초
            </button>
          </>
        )}
        <button
          onClick={handleCancel}
          className="whitespace-nowrap rounded-lg bg-[var(--color-surface)] px-2.5 py-1.5 text-xs font-semibold"
        >
          취소
        </button>
      </div>
    </div>
  )
}
