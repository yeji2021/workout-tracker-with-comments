import { useEffect, useMemo, useState } from 'react'
import { useProfile } from '../context/ProfileContext'
import { MUSCLE_GROUPS } from '../lib/types'
import {
  fetchAllSessions,
  periodRange,
  personalRecords,
  setCountByGroup,
  volumeByDate,
  volumeByGroup,
  weekCompare,
  workoutDayCount,
  type Period,
  type StatSession,
} from '../lib/stats'
import { buildAiPrompt } from '../lib/aiPrompt'
import { MuscleBars } from '../components/MuscleBars'
import { BodyHeatmap } from '../components/BodyHeatmap'
import { CalendarHeatmap } from '../components/CalendarHeatmap'

// 받침 유무에 따라 을/를 선택 (가슴→을, 어깨→를)
function eulReul(word: string): string {
  const code = word.charCodeAt(word.length - 1)
  if (code < 0xac00 || code > 0xd7a3) return '를'
  return (code - 0xac00) % 28 > 0 ? '을' : '를'
}

const PERIODS: { key: Period; label: string }[] = [
  { key: '7', label: '7일' },
  { key: '30', label: '30일' },
  { key: '90', label: '90일' },
  { key: 'all', label: '전체' },
]

export function StatsPage() {
  const { profile } = useProfile()
  const [sessions, setSessions] = useState<StatSession[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<Period>('30')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const s = await fetchAllSessions(profile.profile_id)
      if (!cancelled) {
        setSessions(s)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [profile])

  const week = useMemo(() => weekCompare(sessions), [sessions])
  const [pFrom, pTo] = useMemo(() => periodRange(period), [period])
  const periodVolume = useMemo(
    () => volumeByGroup(sessions, pFrom, pTo),
    [sessions, pFrom, pTo],
  )
  const periodSets = useMemo(
    () => setCountByGroup(sessions, pFrom, pTo),
    [sessions, pFrom, pTo],
  )
  const dayCount = useMemo(
    () => workoutDayCount(sessions, pFrom, pTo),
    [sessions, pFrom, pTo],
  )
  const dateVolumes = useMemo(() => volumeByDate(sessions), [sessions])
  const prs = useMemo(() => personalRecords(sessions), [sessions])

  const hasData = sessions.some((s) => s.entries.some((e) => e.sets.length > 0))

  // 주간 비교에서 변화가 큰 부위 문구
  const topDiffs = useMemo(() => {
    return MUSCLE_GROUPS.filter((g) => Math.abs(week.diff[g]) >= 1)
      .sort((a, b) => Math.abs(week.diff[b]) - Math.abs(week.diff[a]))
      .slice(0, 3)
  }, [week])

  async function copyPrompt() {
    const text = buildAiPrompt({
      periodLabel: PERIODS.find((p) => p.key === period)!.label,
      dayCount,
      volume: periodVolume,
      week,
      prs,
    })
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // 클립보드 실패 시 무시
    }
  }

  const fmtKg = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}t` : `${Math.round(n)}kg`)

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-dim)]">
        불러오는 중…
      </div>
    )
  }

  if (!hasData) {
    return (
      <div className="px-4 py-5">
        <h1 className="mb-4 text-2xl font-bold">통계</h1>
        <div className="mt-10 flex flex-col items-center gap-4 text-center">
          <div className="text-5xl">📊</div>
          <p className="text-sm text-[var(--color-text-dim)]">
            아직 기록이 없어요.
            <br />
            운동을 기록하면 통계가 쌓여요.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 px-4 py-5">
      <h1 className="text-2xl font-bold">통계</h1>

      {/* 주간 비교 */}
      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="mb-2 text-sm font-semibold">최근 7일 vs 이전 7일</h2>
        {topDiffs.length === 0 ? (
          <p className="text-sm text-[var(--color-text-dim)]">
            비교할 데이터가 아직 부족해요.
          </p>
        ) : (
          <div className="mb-3 flex flex-col gap-1">
            {topDiffs.map((g) => {
              const d = week.diff[g]
              const up = d > 0
              return (
                <p key={g} className="text-sm">
                  <b>{g}</b>
                  {eulReul(g)}{' '}
                  <span
                    style={{ color: up ? 'var(--color-success)' : 'var(--color-danger)' }}
                  >
                    {fmtKg(Math.abs(d))} {up ? '더' : '덜'}
                  </span>{' '}
                  들었어요
                </p>
              )
            })}
          </div>
        )}
        <MuscleBars data={week.thisWeek} format={fmtKg} />
      </section>

      {/* 근육 사용 + 기간 필터 */}
      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">사용 근육</h2>
          <div className="flex gap-1">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={
                  'rounded-full px-2.5 py-1 text-xs font-medium ' +
                  (period === p.key
                    ? 'bg-[var(--color-accent)] text-white'
                    : 'bg-[var(--color-surface-2)] text-[var(--color-text-dim)]')
                }
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <p className="mb-2 text-xs text-[var(--color-text-dim)]">
          {dayCount}일 운동 · 볼륨 기준
        </p>
        <BodyHeatmap data={periodVolume} />
        <div className="mt-3">
          <MuscleBars
            data={periodVolume}
            format={(n) => `${fmtKg(n)}`}
          />
        </div>
        <p className="mt-3 text-[11px] text-[var(--color-text-dim)]">
          세트 수: {MUSCLE_GROUPS.map((g) => `${g} ${periodSets[g]}`).join(' · ')}
        </p>
      </section>

      {/* 캘린더 히트맵 */}
      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="mb-3 text-sm font-semibold">운동 캘린더 (최근 16주)</h2>
        <CalendarHeatmap volumeByDate={dateVolumes} />
      </section>

      {/* PR */}
      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="mb-3 text-sm font-semibold">개인 최고기록 (PR)</h2>
        {prs.length === 0 ? (
          <p className="text-sm text-[var(--color-text-dim)]">
            무게를 기록하면 PR이 표시돼요.
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-[var(--color-border)]/50">
            {prs.slice(0, 8).map((pr) => (
              <div
                key={pr.exerciseName}
                className="flex items-center justify-between py-2 text-sm"
              >
                <span>{pr.exerciseName}</span>
                <span className="font-semibold tabular-nums">
                  {pr.weight}kg × {pr.reps}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* AI 상담 프롬프트 */}
      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="mb-1 text-sm font-semibold">AI 코치 프롬프트</h2>
        <p className="mb-3 text-xs text-[var(--color-text-dim)]">
          위 통계를 담은 프롬프트를 복사해서 ChatGPT 등에 붙여넣으면 맞춤 피드백을
          받을 수 있어요.
        </p>
        <button
          onClick={copyPrompt}
          className="w-full rounded-xl bg-[var(--color-accent)] py-3 font-semibold text-white"
        >
          {copied ? '복사됨 ✓' : '프롬프트 복사하기'}
        </button>
      </section>
    </div>
  )
}
