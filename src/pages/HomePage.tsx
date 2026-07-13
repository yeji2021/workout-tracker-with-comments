import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProfile } from '../context/ProfileContext'
import { useFeedUnread } from '../lib/feedUnread'
import { getSessionByDate, todayISO } from '../lib/workouts'
import {
  computeStreak,
  fetchAllSessions,
  personalRecords,
  shiftISO,
  weekCompare,
  workoutDayCount,
  type StatSession,
} from '../lib/stats'
import { syncStreak } from '../lib/streak'
import { fmtVolume } from '../lib/format'
import type { WorkoutSession } from '../lib/types'
import { InstallPrompt } from '../components/InstallPrompt'
import { ElapsedTimer } from '../components/ElapsedTimer'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
function fmtToday(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  return `${m}월 ${d}일 (${wd})`
}

// 오늘 세션에서 진행 요약 계산 (세트 수, 완료 세트, 볼륨)
function summarizeToday(session: WorkoutSession | null) {
  let totalSets = 0
  let doneSets = 0
  let volume = 0
  const entries = session?.entries ?? []
  for (const e of entries) {
    for (const st of e.sets) {
      totalSets += 1
      if (st.is_completed) doneSets += 1
      if (st.reps > 0) volume += (st.weight_kg ?? 0) * st.reps
    }
  }
  return { exerciseCount: entries.length, totalSets, doneSets, volume }
}

export function HomePage() {
  const { profile } = useProfile()
  const navigate = useNavigate()
  const feedUnread = useFeedUnread(profile?.profile_id)
  const today = todayISO()

  const [session, setSession] = useState<WorkoutSession | null>(null)
  const [sessions, setSessions] = useState<StatSession[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const [ses, all] = await Promise.all([
        getSessionByDate(profile.profile_id, today),
        fetchAllSessions(profile.profile_id),
      ])
      if (cancelled) return
      setSession(ses)
      setSessions(all)
      setLoading(false)
      // 부팅 시 스트릭 재계산 + 저장 (그룹 피드 아바타에 표시하려면 서버에 있어야 함)
      syncStreak(
        profile.profile_id,
        all.map((s) => s.date),
      ).catch(() => {})
    })()
    return () => {
      cancelled = true
    }
  }, [profile, today])

  const todaySummary = useMemo(() => summarizeToday(session), [session])
  const streak = useMemo(
    () => computeStreak(sessions.map((s) => s.date), today),
    [sessions, today],
  )

  const week = useMemo(() => {
    const cmp = weekCompare(sessions)
    const sum = (r: Record<string, number>) =>
      Object.values(r).reduce((a, b) => a + b, 0)
    const thisVol = sum(cmp.thisWeek)
    const lastVol = sum(cmp.lastWeek)
    const days = workoutDayCount(sessions, shiftISO(today, -6), today)
    return { thisVol, diff: thisVol - lastVol, days }
  }, [sessions, today])

  const prs = useMemo(() => personalRecords(sessions).slice(0, 3), [sessions])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-dim)]">
        불러오는 중…
      </div>
    )
  }

  const started = todaySummary.exerciseCount > 0
  const progress =
    todaySummary.totalSets > 0
      ? Math.round((todaySummary.doneSets / todaySummary.totalSets) * 100)
      : 0

  return (
    <div className="px-4 py-5">
      {/* 인사 헤더 */}
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            안녕하세요, {profile?.nickname ?? ''} 👋
          </h1>
          <p className="text-xs text-[var(--color-text-dim)]">{fmtToday(today)}</p>
        </div>
        {streak > 0 && (
          <div className="flex items-center gap-1 rounded-full bg-[var(--color-surface)] px-3 py-1.5 text-sm font-bold">
            🔥 {streak}일
          </div>
        )}
      </div>

      <InstallPrompt />

      {/* 오늘 운동 카드 */}
      <div className="mb-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        {started ? (
          <>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-[var(--color-text-dim)]">
                오늘 운동
              </h2>
              <div className="flex items-center gap-2">
                {session?.started_at && !session.ended_at && (
                  <ElapsedTimer startedAt={session.started_at} />
                )}
                {session?.ended_at && (
                  <span className="text-xs font-semibold text-[var(--color-accent)]">
                    ✅ 완료
                  </span>
                )}
                {session && session.shares.length > 0 && (
                  <span className="text-xs text-[var(--color-accent)]">
                    피드에 공유됨 ({session.shares.length})
                  </span>
                )}
              </div>
            </div>
            <div className="mb-4 flex items-end gap-4">
              <div>
                <div className="text-3xl font-bold">
                  {todaySummary.doneSets}
                  <span className="text-lg text-[var(--color-text-dim)]">
                    /{todaySummary.totalSets} 세트
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-[var(--color-text-dim)]">
                  운동 {todaySummary.exerciseCount}개 · 볼륨{' '}
                  {fmtVolume(todaySummary.volume)}
                </div>
              </div>
            </div>
            {/* 진행률 바 */}
            <div className="mb-4 h-2 overflow-hidden rounded-full bg-[var(--color-border)]">
              <div
                className="h-full rounded-full bg-[var(--color-accent)] transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <button
              onClick={() => navigate('/log')}
              className="w-full rounded-xl bg-[var(--color-accent)] py-3.5 font-semibold text-white"
            >
              이어서 기록하기
            </button>
          </>
        ) : (
          <>
            <div className="mb-1 text-2xl">💪</div>
            <h2 className="text-lg font-bold">오늘은 아직 운동 전이에요</h2>
            <p className="mb-4 mt-0.5 text-sm text-[var(--color-text-dim)]">
              운동을 시작해 오늘의 기록을 남겨보세요.
            </p>
            <button
              onClick={() => navigate('/log')}
              className="w-full rounded-xl bg-[var(--color-accent)] py-3.5 font-semibold text-white"
            >
              운동 시작
            </button>
            <button
              onClick={() => navigate('/routines')}
              className="mt-2 w-full rounded-xl border border-[var(--color-border)] py-3 text-sm font-semibold text-[var(--color-text-dim)]"
            >
              루틴으로 시작
            </button>
          </>
        )}
      </div>

      {/* 이번 주 스냅샷 */}
      <button
        onClick={() => navigate('/stats')}
        className="mb-4 flex w-full items-center justify-between rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left"
      >
        <div>
          <div className="text-sm font-semibold text-[var(--color-text-dim)]">
            이번 주
          </div>
          <div className="mt-1 text-xl font-bold">
            {fmtVolume(week.thisVol)}
          </div>
          <div className="mt-0.5 text-xs text-[var(--color-text-dim)]">
            {week.days}일 운동
            {week.diff !== 0 && (
              <span
                className={
                  week.diff > 0
                    ? 'text-[var(--color-accent)]'
                    : 'text-[var(--color-text-dim)]'
                }
              >
                {' · '}지난주 대비 {week.diff > 0 ? '+' : '−'}
                {fmtVolume(Math.abs(week.diff))}
              </span>
            )}
          </div>
        </div>
        <span className="text-[var(--color-text-dim)]">›</span>
      </button>

      {/* 최근 최고기록 */}
      {prs.length > 0 && (
        <button
          onClick={() => navigate('/stats')}
          className="mb-4 w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left"
        >
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold text-[var(--color-text-dim)]">
              최고기록 🏆
            </div>
            <span className="text-[var(--color-text-dim)]">›</span>
          </div>
          <div className="space-y-1.5">
            {prs.map((pr) => (
              <div
                key={pr.exerciseName}
                className="flex items-center justify-between text-sm"
              >
                <span className="truncate pr-2">{pr.exerciseName}</span>
                <span className="shrink-0 font-semibold">
                  {pr.weight}kg × {pr.reps}
                </span>
              </div>
            ))}
          </div>
        </button>
      )}

      {/* 피드 새 소식 */}
      {feedUnread && (
        <button
          onClick={() => navigate('/feed')}
          className="flex w-full items-center justify-between rounded-2xl border border-[var(--color-accent)] bg-[var(--color-surface)] p-4 text-left"
        >
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className="h-2 w-2 rounded-full bg-[var(--color-danger)]" />
            피드에 새 소식이 있어요
          </div>
          <span className="text-[var(--color-text-dim)]">›</span>
        </button>
      )}
    </div>
  )
}
