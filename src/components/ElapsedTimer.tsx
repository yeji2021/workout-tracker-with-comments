import { useEffect, useState } from 'react'

// 운동 시작(startedAt)부터의 경과시간 카운트업. RestTimer와 동일하게
// Date.now() 절대시각 기반이라 탭 이탈/백그라운드/새로고침에도 정확하다.
export function ElapsedTimer({ startedAt }: { startedAt: string }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const elapsedSec = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000))
  const hh = Math.floor(elapsedSec / 3600)
  const mm = Math.floor((elapsedSec % 3600) / 60)
  const ss = elapsedSec % 60
  const label = hh > 0
    ? `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
    : `${mm}:${String(ss).padStart(2, '0')}`

  return (
    <span className="inline-flex items-center gap-1 font-mono text-sm font-semibold tabular-nums text-[var(--color-accent)]">
      <span aria-hidden>⏱</span>
      {label}
    </span>
  )
}

// 소요시간(초)을 "N분" 또는 "H시간 N분" 문자열로 (완료 후 요약 화면용)
export function fmtDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.round((total % 3600) / 60)
  if (h > 0) return `${h}시간 ${m}분`
  return `${m}분`
}
