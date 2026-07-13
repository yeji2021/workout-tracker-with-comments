import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useProfile } from '../context/ProfileContext'
import { getMyWeightKg, setMyWeightKg } from '../lib/profile'
import {
  addEntriesBulk,
  createSession,
  deleteSession,
  getSessionByDate,
  listSessionsOverview,
  todayISO,
} from '../lib/workouts'
import { shareSessionToGroups, unshareFromGroup, type ShareHighlights } from '../lib/share'
import { detectHighlights } from '../lib/highlights'
import {
  epley1RM,
  fetchAllSessions,
  toStatSession,
  volumeByGroupForSession,
} from '../lib/stats'
import { fmtVolume } from '../lib/format'
import { fmtDuration } from '../components/ElapsedTimer'
import type { WorkoutSession } from '../lib/types'
import { BodyHeatmap } from '../components/BodyHeatmap'
import { ShareSheet } from '../components/ShareSheet'

const MET_STRENGTH = 3.0 // 근력운동 근사 MET (1차: 상수, 향후 강도별 보정 가능)

function timeOfDayLabel(startedAt: string | null): string {
  if (!startedAt) return ''
  const h = new Date(startedAt).getHours()
  if (h < 12) return '오전'
  if (h < 18) return '오후'
  return '저녁'
}

export function SessionDetailPage() {
  const { date } = useParams<{ date: string }>()
  const { profile } = useProfile()
  const navigate = useNavigate()

  const [session, setSession] = useState<WorkoutSession | null>(null)
  const [allDates, setAllDates] = useState<string[]>([])
  const [weightKg, setWeightKg] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [shareHighlight, setShareHighlight] = useState<ShareHighlights | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!profile || !date) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const [ses, overview, w] = await Promise.all([
        getSessionByDate(profile.profile_id, date),
        listSessionsOverview(profile.profile_id),
        getMyWeightKg(profile.profile_id),
      ])
      if (cancelled) return
      setSession(ses)
      setAllDates(overview.map((o) => o.date))
      setWeightKg(w)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [profile, date])

  const ordinal = useMemo(() => {
    if (!date) return null
    const idx = allDates.indexOf(date)
    return idx === -1 ? null : idx + 1
  }, [allDates, date])

  const { prevDate, nextDate } = useMemo(() => {
    if (!date) return { prevDate: null, nextDate: null }
    const idx = allDates.indexOf(date)
    return {
      prevDate: idx > 0 ? allDates[idx - 1] : null,
      nextDate: idx >= 0 && idx < allDates.length - 1 ? allDates[idx + 1] : null,
    }
  }, [allDates, date])

  // ── 좌/우 스와이프로 인접 기록일 이동 ────────────────────────────
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0]
    touchStart.current = { x: t.clientX, y: t.clientY }
  }
  function onTouchEnd(e: React.TouchEvent) {
    const start = touchStart.current
    touchStart.current = null
    if (!start) return
    const t = e.changedTouches[0]
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return
    if (dx > 0 && prevDate) navigate(`/session/${prevDate}`)
    if (dx < 0 && nextDate) navigate(`/session/${nextDate}`)
  }

  const stats = useMemo(() => {
    if (!session) return null
    let setCount = 0
    let reps = 0
    let volume = 0
    for (const e of session.entries) {
      for (const st of e.sets) {
        if (st.reps > 0) {
          setCount += 1
          reps += st.reps
          volume += (st.weight_kg ?? 0) * st.reps
        }
      }
    }
    const durationSec =
      session.started_at && session.ended_at
        ? (new Date(session.ended_at).getTime() -
            new Date(session.started_at).getTime()) /
          1000
        : null
    const calorie =
      durationSec != null && weightKg != null
        ? Math.round(MET_STRENGTH * weightKg * (durationSec / 3600))
        : null
    const intensity =
      durationSec != null && durationSec > 0
        ? Math.round(volume / (durationSec / 60))
        : null
    return {
      exerciseCount: session.entries.length,
      setCount,
      reps,
      volume,
      durationSec,
      calorie,
      intensity,
    }
  }, [session, weightKg])

  const muscleVolume = useMemo(
    () => (session ? volumeByGroupForSession(toStatSession(session)) : null),
    [session],
  )

  async function handleSetWeight() {
    if (!profile) return
    const v = window.prompt(
      '체중을 입력해주세요 (kg) — 칼로리 추정에 사용돼요',
      '',
    )
    if (!v) return
    const n = Number(v)
    if (!Number.isFinite(n) || n <= 0) return
    try {
      await setMyWeightKg(profile.profile_id, n)
      setWeightKg(n)
    } catch {
      // 마이그레이션 미적용 등 — 조용히 무시
    }
  }

  async function openShare() {
    if (!session || !profile) return
    setShareHighlight(null)
    setShareOpen(true)
    const past = await fetchAllSessions(profile.profile_id)
    setShareHighlight(detectHighlights(session, past))
  }

  async function confirmShare(
    groupIds: string[],
    message: string,
    highlight: ShareHighlights | null,
  ) {
    if (!session) return
    const before = new Set(session.shares.map((s) => s.group_id))
    const after = new Set(groupIds)
    const toAdd = groupIds.filter((id) => !before.has(id))
    const toKeep = groupIds.filter((id) => before.has(id))
    const toRemove = [...before].filter((id) => !after.has(id))
    const toUpsert = [...toAdd, ...toKeep]
    await Promise.all([
      toUpsert.length > 0
        ? shareSessionToGroups(session.id, toUpsert, message, highlight)
        : Promise.resolve(),
      ...toRemove.map((id) => unshareFromGroup(session.id, id)),
    ])
    if (date) {
      const refreshed = await getSessionByDate(profile!.profile_id, date)
      setSession(refreshed)
    }
  }

  async function startFromThisRecord() {
    if (!profile || !session) return
    setBusy(true)
    try {
      const today = todayISO()
      let target = await getSessionByDate(profile.profile_id, today)
      if (!target) target = await createSession(profile, today)
      const exerciseIds = session.entries.map((e) => e.exercise_id)
      await addEntriesBulk(target.id, exerciseIds, target.entries.length)
      navigate('/log')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!session) return
    if (!confirm('이 운동 기록을 삭제할까요? 되돌릴 수 없어요.')) return
    setBusy(true)
    try {
      await deleteSession(session.id)
      navigate('/history')
    } finally {
      setBusy(false)
    }
  }

  async function handleSendShare() {
    if (!session || !stats) return
    const text =
      `${session.date} 운동 기록\n` +
      `${stats.exerciseCount}개 운동 · ${stats.setCount}세트 · ${fmtVolume(stats.volume)}` +
      (stats.durationSec != null ? ` · ${fmtDuration(stats.durationSec)}` : '')
    if (navigator.share) {
      try {
        await navigator.share({ text })
      } catch {
        // 사용자 취소 등 — 무시
      }
    } else {
      await navigator.clipboard.writeText(text).catch(() => {})
      alert('클립보드에 복사했어요.')
    }
    setOptionsOpen(false)
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-dim)]">
        불러오는 중…
      </div>
    )
  }

  if (!session || session.entries.length === 0) {
    return (
      <div className="px-4 py-5">
        <button
          onClick={() => navigate('/history')}
          className="mb-4 -ml-1 rounded-full p-1 text-xl text-[var(--color-text-dim)]"
          aria-label="뒤로"
        >
          ←
        </button>
        <div className="mt-10 flex flex-col items-center gap-3 text-center">
          <div className="text-4xl">🗓️</div>
          <p className="text-sm text-[var(--color-text-dim)]">
            {date}에는 운동 기록이 없어요.
          </p>
        </div>
      </div>
    )
  }

  const tod = timeOfDayLabel(session.started_at)
  const [, m, d] = session.date.split('-')
  const title = `${Number(m)}월 ${Number(d)}일${tod ? `, ${tod} 운동` : ' 운동'}`
  const isToday = session.date === todayISO()

  return (
    <div
      className="px-4 py-5 pb-24"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* 헤더 */}
      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={() => navigate('/history')}
          aria-label="뒤로"
          className="-ml-1 rounded-full p-1 text-xl text-[var(--color-text-dim)]"
        >
          ←
        </button>
        <div className="flex-1 text-center">
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => prevDate && navigate(`/session/${prevDate}`)}
              disabled={!prevDate}
              aria-label="이전 기록일"
              className="text-[var(--color-text-dim)] disabled:opacity-20"
            >
              ‹
            </button>
            <h1 className="text-base font-bold">{title}</h1>
            <button
              onClick={() => nextDate && navigate(`/session/${nextDate}`)}
              disabled={!nextDate}
              aria-label="다음 기록일"
              className="text-[var(--color-text-dim)] disabled:opacity-20"
            >
              ›
            </button>
          </div>
          <p className="text-xs text-[var(--color-text-dim)]">{session.date}</p>
        </div>
        <button
          onClick={() => setOptionsOpen(true)}
          aria-label="옵션"
          className="rounded-full p-1 text-xl text-[var(--color-text-dim)]"
        >
          ···
        </button>
      </div>

      {/* 바디 히트맵 */}
      {muscleVolume && <BodyHeatmap data={muscleVolume} />}

      {/* 통계 그리드 */}
      {stats && (
        <div className="mb-5 grid grid-cols-4 gap-2 text-center">
          {ordinal != null && (
            <StatTile value={`${ordinal}th`} label="WORKOUT" />
          )}
          {stats.calorie != null ? (
            <StatTile value={`${stats.calorie} KCAL`} label="CALORIES 🔥" />
          ) : (
            <button
              onClick={handleSetWeight}
              className="rounded-xl bg-[var(--color-surface-2)] py-3 text-[11px] text-[var(--color-text-dim)]"
            >
              체중 입력
              <div className="text-[10px]">(칼로리 계산)</div>
            </button>
          )}
          {stats.durationSec != null && (
            <StatTile value={fmtDuration(stats.durationSec)} label="DURATION" />
          )}
          <StatTile value={fmtVolume(stats.volume)} label="VOLUME" />
          <StatTile value={String(stats.exerciseCount)} label="EXERCISES" />
          <StatTile value={`${stats.setCount}세트`} label="SETS" />
          <StatTile value={`${stats.reps}회`} label="REPS" />
          {stats.intensity != null && (
            <StatTile value={`${stats.intensity} kg/분`} label="INTENSITY" />
          )}
        </div>
      )}

      {/* 운동별 카드 */}
      <div className="flex flex-col gap-3">
        {session.entries.map((entry) => {
          const logged = entry.sets.filter((s) => s.reps > 0)
          const bestWeight = logged.reduce(
            (max, s) => (s.weight_kg != null && s.weight_kg > max ? s.weight_kg : max),
            0,
          )
          const best1RM = logged.reduce(
            (max, s) =>
              s.weight_kg != null
                ? Math.max(max, epley1RM(s.weight_kg, s.reps))
                : max,
            0,
          )
          return (
            <div
              key={entry.id}
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5"
            >
              <h3 className="mb-1 font-semibold">
                {entry.exercise?.name ?? '운동'}
              </h3>
              {bestWeight > 0 && (
                <p className="mb-2 text-xs text-[var(--color-text-dim)]">
                  최고 무게: {bestWeight}kg
                  {best1RM > 0 && ` | 1RM: ${best1RM}kg`}
                </p>
              )}
              {entry.notes && (
                <p className="mb-2 text-xs text-[var(--color-text-dim)]">
                  📝 {entry.notes}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {logged.map((s) => (
                  <div key={s.id} className="flex flex-col items-center">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-danger)]/80 text-sm font-bold text-white">
                      {s.weight_kg != null ? s.weight_kg : '맨몸'}
                    </div>
                    <span className="mt-0.5 text-[10px] text-[var(--color-text-dim)]">
                      {s.reps}X
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* 플로팅 공유하기 — RestTimer와 동일하게 viewport 기준 max-w-md 재중앙정렬 */}
      <div className="pointer-events-none fixed bottom-24 left-1/2 z-30 flex w-full max-w-md -translate-x-1/2 justify-end px-4">
        <button
          onClick={openShare}
          className={
            'pointer-events-auto flex items-center gap-1.5 rounded-full px-4 py-3 text-sm font-semibold shadow-lg ' +
            (session.shares.length > 0
              ? 'bg-[var(--color-accent)] text-white'
              : 'border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]')
          }
        >
          {session.shares.length > 0
            ? `공유됨 ✓ (${session.shares.length})`
            : '↗ 공유하기'}
        </button>
      </div>

      {/* ··· 옵션 바텀시트 */}
      {optionsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
          onClick={() => setOptionsOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2"
            style={{ paddingBottom: 'calc(var(--safe-bottom) + 0.5rem)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-[var(--color-border)] px-4 py-3 text-sm font-semibold">
              {title}
            </div>
            <SheetItem
              icon="▶"
              label="이 기록으로 운동 시작"
              disabled={busy}
              onClick={() => {
                setOptionsOpen(false)
                startFromThisRecord()
              }}
            />
            {isToday && (
              <SheetItem
                icon="✏️"
                label="운동기록 수정"
                onClick={() => {
                  setOptionsOpen(false)
                  navigate('/log')
                }}
              />
            )}
            <SheetItem
              icon="🗑"
              label="운동기록 삭제"
              disabled={busy}
              onClick={() => {
                setOptionsOpen(false)
                handleDelete()
              }}
            />
            <SheetItem icon="➤" label="운동기록 전송" onClick={handleSendShare} />
            {session.shares.length > 0 && (
              <SheetItem
                icon="💬"
                label="댓글 남기기"
                onClick={() => {
                  setOptionsOpen(false)
                  navigate('/feed')
                }}
              />
            )}
          </div>
        </div>
      )}

      {shareOpen && profile && (
        <ShareSheet
          groups={profile.groups}
          currentShares={session.shares}
          highlight={shareHighlight}
          onClose={() => setShareOpen(false)}
          onConfirm={confirmShare}
        />
      )}
    </div>
  )
}

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl bg-[var(--color-surface-2)] py-3">
      <div className="text-sm font-bold">{value}</div>
      <div className="text-[10px] text-[var(--color-text-dim)]">{label}</div>
    </div>
  )
}

function SheetItem({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: string
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm disabled:opacity-40"
    >
      <span className="w-5 text-center">{icon}</span>
      {label}
    </button>
  )
}
