import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProfile } from '../context/ProfileContext'
import {
  listSessionsOverview,
  todayISO,
  type SessionOverview,
} from '../lib/workouts'
import { fmtVolume } from '../lib/format'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function ymKey(year: number, month: number): string {
  return `${year}-${pad(month)}`
}

// 세션 시작 시각(로컬)으로 오전/오후/저녁 자동 제목
function timeOfDayLabel(startedAt: string | null): string {
  if (!startedAt) return ''
  const h = new Date(startedAt).getHours()
  if (h < 12) return '오전'
  if (h < 18) return '오후'
  return '저녁'
}

function fmtTimeRange(s: SessionOverview): string | null {
  if (!s.started_at || !s.ended_at) return null
  const st = new Date(s.started_at)
  const en = new Date(s.ended_at)
  const durMin = Math.max(1, Math.round((en.getTime() - st.getTime()) / 60000))
  const fmt = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
  return `${s.date} ${fmt(st)}~${fmt(en)}, ${durMin}분`
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

export function HistoryPage() {
  const { profile } = useProfile()
  const navigate = useNavigate()
  const today = todayISO()

  const [overview, setOverview] = useState<SessionOverview[]>([])
  const [loading, setLoading] = useState(true)
  const [cursor, setCursor] = useState(() => {
    const [y, m] = today.split('-').map(Number)
    return { year: y, month: m }
  })

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const list = await listSessionsOverview(profile.profile_id)
      if (!cancelled) {
        setOverview(list)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [profile])

  const datesWithSession = useMemo(
    () => new Set(overview.map((s) => s.date)),
    [overview],
  )

  const monthSessions = useMemo(
    () =>
      overview
        .filter((s) => s.date.startsWith(ymKey(cursor.year, cursor.month)))
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [overview, cursor],
  )

  const grid = useMemo(() => {
    const first = new Date(Date.UTC(cursor.year, cursor.month - 1, 1))
    const startDow = first.getUTCDay()
    const daysInMonth = new Date(
      Date.UTC(cursor.year, cursor.month, 0),
    ).getUTCDate()
    const cells: { iso: string | null; day: number | null }[] = []
    for (let i = 0; i < startDow; i++) cells.push({ iso: null, day: null })
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${cursor.year}-${pad(cursor.month)}-${pad(d)}`
      cells.push({ iso, day: d })
    }
    return cells
  }, [cursor])

  function shiftMonth(delta: number) {
    setCursor(({ year, month }) => {
      const total = year * 12 + (month - 1) + delta
      return { year: Math.floor(total / 12), month: (total % 12) + 1 }
    })
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-dim)]">
        불러오는 중…
      </div>
    )
  }

  return (
    <div className="px-4 py-5">
      <h1 className="mb-4 text-2xl font-bold">기록</h1>

      {/* 월 캘린더 */}
      <section className="mb-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="mb-3 flex items-center justify-between">
          <button
            onClick={() => shiftMonth(-1)}
            aria-label="이전 달"
            className="rounded-full px-2 py-1 text-[var(--color-text-dim)]"
          >
            ‹
          </button>
          <div className="text-base font-bold">
            {cursor.year}년 {cursor.month}월
          </div>
          <button
            onClick={() => shiftMonth(1)}
            aria-label="다음 달"
            className="rounded-full px-2 py-1 text-[var(--color-text-dim)]"
          >
            ›
          </button>
        </div>

        <div className="mb-1 grid grid-cols-7 text-center text-xs font-medium">
          {WEEKDAYS.map((w, i) => (
            <div
              key={w}
              className={
                i === 0
                  ? 'text-[var(--color-danger)]'
                  : i === 6
                    ? 'text-[var(--color-accent)]'
                    : 'text-[var(--color-text-dim)]'
              }
            >
              {w}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-y-2 text-center">
          {grid.map((cell, i) => {
            if (cell.iso === null) return <div key={i} />
            const hasSession = datesWithSession.has(cell.iso)
            const isToday = cell.iso === today
            const isFuture = cell.iso > today
            return (
              <button
                key={cell.iso}
                disabled={isFuture}
                onClick={() => navigate(`/session/${cell.iso}`)}
                className="flex flex-col items-center gap-0.5 disabled:opacity-30"
              >
                <span
                  className={
                    'flex h-7 w-7 items-center justify-center rounded-full text-sm ' +
                    (isToday
                      ? 'bg-[var(--color-accent)] font-bold text-white'
                      : hasSession
                        ? 'font-semibold text-[var(--color-text)]'
                        : 'text-[var(--color-text-dim)]')
                  }
                >
                  {cell.day}
                </span>
                <span
                  className={
                    'h-1.5 w-1.5 rounded-full ' +
                    (hasSession ? 'bg-[var(--color-danger)]' : 'bg-transparent')
                  }
                />
              </button>
            )
          })}
        </div>
      </section>

      {/* 이 달의 세션 리스트 */}
      {monthSessions.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-3 text-center">
          <div className="text-4xl">🗓️</div>
          <p className="text-sm text-[var(--color-text-dim)]">
            이 달엔 운동 기록이 없어요.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {monthSessions.map((s) => {
            const [, m, d] = s.date.split('-')
            const tod = timeOfDayLabel(s.started_at)
            const title = `${Number(m)}월 ${Number(d)}일${tod ? `, ${tod} 운동` : ' 운동'}`
            const timeRange = fmtTimeRange(s)
            return (
              <button
                key={s.id}
                onClick={() => navigate(`/session/${s.date}`)}
                className="flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5 text-left"
              >
                <span className="text-xl">🏋️</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{title}</div>
                  <div className="truncate text-xs text-[var(--color-text-dim)]">
                    {timeRange ?? s.date} · {s.exerciseCount}개 · {s.setCount}세트
                    {s.volume > 0 && ` · ${fmtVolume(s.volume)}`}
                  </div>
                </div>
                <span className="text-[var(--color-text-dim)]">›</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
