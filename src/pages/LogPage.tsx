import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { useProfile } from '../context/ProfileContext'
import type {
  Exercise,
  WorkoutSession,
  WorkoutSet,
} from '../lib/types'
import {
  addEntry,
  addSet,
  createSession,
  deleteEntry,
  deleteSet,
  endSession,
  getLastPerformance,
  getSessionByDate,
  listExercises,
  reorderEntries,
  todayISO,
  updateEntryNotes,
  updateSet,
  type LastPerformance,
} from '../lib/workouts'
import { shareSessionToGroups, unshareFromGroup, type ShareHighlights } from '../lib/share'
import { detectHighlights } from '../lib/highlights'
import { fetchAllSessions } from '../lib/stats'
import { type Cheer } from '../lib/live'
import { useLive } from '../context/LiveContext'
import { createRoutine } from '../lib/routines'
import {
  DEFAULT_REST_SECONDS,
  clampRest,
  listRestPrefs,
  setRestPref,
} from '../lib/restPrefs'
import { unlockAudio } from '../lib/audio'
import {
  cancelRestNotification,
  ensureNotifyPermission,
  scheduleRestNotification,
} from '../lib/notify'
import { ExercisePicker } from '../components/ExercisePicker'
import { EntryCard } from '../components/EntryCard'
import { RestTimer } from '../components/RestTimer'
import { SaveRoutineModal } from '../components/SaveRoutineModal'
import { ElapsedTimer, fmtDuration } from '../components/ElapsedTimer'
import { SessionSummaryModal } from '../components/SessionSummaryModal'
import { ShareSheet } from '../components/ShareSheet'
import { CheerToast } from '../components/CheerToast'


export function LogPage() {
  const { profile } = useProfile()
  const navigate = useNavigate()
  const today = todayISO()

  const [session, setSession] = useState<WorkoutSession | null>(null)
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [lastByEx, setLastByEx] = useState<Record<string, LastPerformance | null>>(
    {},
  )
  const [loading, setLoading] = useState(true)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null)
  const [restPrefs, setRestPrefs] = useState<Record<string, number>>({})
  const [activeRest, setActiveRest] = useState<{
    exerciseId: string
    base: number
  } | null>(null)
  const [saveRoutineOpen, setSaveRoutineOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [shareHighlight, setShareHighlight] = useState<ShareHighlights | null>(null)
  const [completing, setCompleting] = useState(false)
  const [summary, setSummary] = useState<{
    durationSec: number
    exerciseCount: number
    setCount: number
    volume: number
  } | null>(null)
  const [incomingCheer, setIncomingCheer] = useState<Cheer | null>(null)

  // 운동 중(시작~완료 사이)인 동안 내 그룹들에 "운동 중" 상태를 알리고,
  // 친구가 보낸 응원을 수신한다. 세션이 완료/종료되면 자동으로 나간다.
  // 채널은 LiveContext가 관리하므로 여기서는 track/untrack만 한다.
  const { trackWorkout, untrackWorkout, onCheer } = useLive()
  useEffect(() => {
    if (!profile || !session?.started_at || session.ended_at) return
    const offCheer = onCheer(setIncomingCheer)
    trackWorkout({
      profile_id: profile.profile_id,
      nickname: profile.nickname,
      started_at: session.started_at,
    })
    return () => {
      offCheer()
      untrackWorkout()
    }
  }, [
    profile,
    session?.started_at,
    session?.ended_at,
    trackWorkout,
    untrackWorkout,
    onCheer,
  ])

  const sensors = useSensors(
    // distance 임계값 → 입력 탭/타이핑은 드래그로 오인되지 않음
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )

  // 추가 후 스크롤 대상. session 커밋(=DOM 갱신) 이후 useEffect에서 실행한다.
  const pendingScroll = useRef<
    null | { type: 'bottom' } | { type: 'set'; id: string }
  >(null)
  useEffect(() => {
    const p = pendingScroll.current
    if (!p) return
    pendingScroll.current = null
    // useEffect는 DOM 커밋 후 실행되므로 scrollHeight가 최신값. rAF는 비포그라운드
    // 프리뷰에서 throttle될 수 있어 직접 스크롤한다.
    if (p.type === 'bottom') {
      const main = document.querySelector('main')
      if (main) main.scrollTop = main.scrollHeight
    } else {
      document
        .querySelector(`[data-set-id="${p.id}"]`)
        ?.scrollIntoView({ block: 'center' })
    }
  }, [session])

  // 특정 운동의 지난 기록을 캐시에 로드
  const loadLast = useCallback(
    async (exerciseId: string) => {
      if (!profile) return
      const perf = await getLastPerformance(profile.profile_id, exerciseId, today)
      setLastByEx((m) => ({ ...m, [exerciseId]: perf }))
    },
    [profile, today],
  )

  // 초기 로드
  useEffect(() => {
    if (!profile) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const [exs, ses, prefs] = await Promise.all([
        listExercises(),
        getSessionByDate(profile.profile_id, today),
        listRestPrefs(profile.profile_id),
      ])
      if (cancelled) return
      setExercises(exs)
      setSession(ses)
      setRestPrefs(prefs)
      setLoading(false)
      // 오늘 세션에 이미 있는 운동들의 지난 기록 로드
      if (ses) ses.entries.forEach((e) => loadLast(e.exercise_id))
    })()
    return () => {
      cancelled = true
    }
  }, [profile, today, loadLast])

  async function refreshSession() {
    if (!profile) return
    const ses = await getSessionByDate(profile.profile_id, today)
    setSession(ses)
    if (ses) ses.entries.forEach((e) => loadLast(e.exercise_id))
  }

  // 운동 추가 (세션이 없으면 먼저 생성)
  async function handlePick(exercise: Exercise) {
    if (!profile) return
    let ses = session
    if (!ses) ses = await createSession(profile, today)
    await addEntry(ses.id, exercise.id, ses.entries.length)
    setPickerOpen(false)
    pendingScroll.current = { type: 'bottom' } // 새 운동이 보이도록 아래로 스크롤

    const perf = await getLastPerformance(profile.profile_id, exercise.id, today)
    setLastByEx((m) => ({ ...m, [exercise.id]: perf }))

    // 지난 기록이 있으면 세트 개수와 값을 그대로 복사해 채워둔다
    if (perf && perf.sets.length > 0) {
      const latest = await getSessionByDate(profile.profile_id, today)
      const newEntry = latest?.entries.find(
        (e) => e.exercise_id === exercise.id && e.sets.length === 0,
      )
      if (newEntry) {
        for (let i = 0; i < perf.sets.length; i++) {
          await addSet(newEntry.id, perf.sets[i].weight_kg, perf.sets[i].reps, i)
        }
      }
    }

    await refreshSession()
  }

  // ── 세트 편집 ──────────────────────────────────────────────────
  // 입력 중 debounce 저장 (blur에만 의존하지 않아 백그라운드 전환에도 안전)
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  function changeSet(
    setId: string,
    patch: Partial<Pick<WorkoutSet, 'weight_kg' | 'reps'>>,
  ) {
    patchSetLocal(setId, patch)
    const key = setId + ':' + Object.keys(patch)[0]
    clearTimeout(saveTimers.current[key])
    saveTimers.current[key] = setTimeout(() => {
      updateSet(setId, patch).catch(() => {})
    }, 500)
  }

  // 운동별 메모: 로컬 반영 + debounce 저장
  function setEntryNotesLocal(entryId: string, notes: string) {
    setSession((s) =>
      s
        ? {
            ...s,
            entries: s.entries.map((e) =>
              e.id === entryId ? { ...e, notes } : e,
            ),
          }
        : s,
    )
  }
  function changeNotes(entryId: string, notes: string) {
    setEntryNotesLocal(entryId, notes)
    const key = entryId + ':notes'
    clearTimeout(saveTimers.current[key])
    saveTimers.current[key] = setTimeout(() => {
      updateEntryNotes(entryId, notes).catch(() => {})
    }, 500)
  }

  function patchSetLocal(
    setId: string,
    patch: Partial<Pick<WorkoutSet, 'weight_kg' | 'reps' | 'is_completed'>>,
  ) {
    setSession((s) =>
      s
        ? {
            ...s,
            entries: s.entries.map((e) => ({
              ...e,
              sets: e.sets.map((st) =>
                st.id === setId ? { ...st, ...patch } : st,
              ),
            })),
          }
        : s,
    )
  }

  // 구체적 값을 직접 받아 저장 (상태를 다시 읽지 않아 stale 방지)
  async function persistSet(
    setId: string,
    patch: Partial<Pick<WorkoutSet, 'weight_kg' | 'reps'>>,
  ) {
    await updateSet(setId, patch)
  }

  async function toggleComplete(set: WorkoutSet) {
    const next = !set.is_completed
    patchSetLocal(set.id, { is_completed: next })
    await updateSet(set.id, { is_completed: next })
    if (next) {
      unlockAudio() // 사용자 제스처(탭) 안 — iOS 오디오 언락은 여기서만 가능
      ensureNotifyPermission() // 마찬가지로 제스처 안에서만 권한 프롬프트가 뜬다
      const entry = session?.entries.find((e) => e.id === set.entry_id)
      const exerciseId = entry?.exercise_id
      const base = exerciseId
        ? (restPrefs[exerciseId] ?? DEFAULT_REST_SECONDS)
        : DEFAULT_REST_SECONDS
      const endsAt = Date.now() + base * 1000
      setRestEndsAt(endsAt)
      setActiveRest(exerciseId ? { exerciseId, base } : null)
      const exerciseName = exercises.find((e) => e.id === exerciseId)?.name
      scheduleRestNotification(endsAt, exerciseName)
    }
  }

  // 휴식 조정 = 그 운동의 다음 기본 휴식값 확정 저장 (사용자 요청 핵심 동작)
  function adjustRest(deltaSeconds: number) {
    setRestEndsAt((t) => {
      const next = (t ?? Date.now()) + deltaSeconds * 1000
      const exerciseName = exercises.find((e) => e.id === activeRest?.exerciseId)?.name
      scheduleRestNotification(next, exerciseName)
      return next
    })
    setActiveRest((a) => {
      if (!a || !profile) return a
      const newBase = clampRest(a.base + deltaSeconds)
      setRestPrefs((m) => ({ ...m, [a.exerciseId]: newBase }))
      setRestPref(profile.profile_id, a.exerciseId, newBase).catch(() => {})
      return { ...a, base: newBase }
    })
  }

  async function handleAddSet(entryId: string) {
    const entry = session?.entries.find((e) => e.id === entryId)
    if (!entry) return
    // autofill: 직전 세트 → 지난 기록 → 빈 값
    const lastSet = entry.sets[entry.sets.length - 1]
    const perf = lastByEx[entry.exercise_id]
    const fill = lastSet
      ? { weight: lastSet.weight_kg, reps: lastSet.reps }
      : perf?.sets[0]
        ? { weight: perf.sets[0].weight_kg, reps: perf.sets[0].reps }
        : { weight: null, reps: 0 }
    const created = await addSet(
      entryId,
      fill.weight,
      fill.reps,
      entry.sets.length,
    )
    pendingScroll.current = { type: 'set', id: created.id } // 새 세트로 스크롤
    setSession((s) =>
      s
        ? {
            ...s,
            entries: s.entries.map((e) =>
              e.id === entryId ? { ...e, sets: [...e.sets, created] } : e,
            ),
          }
        : s,
    )
  }

  async function handleDeleteSet(entryId: string, setId: string) {
    await deleteSet(setId)
    setSession((s) =>
      s
        ? {
            ...s,
            entries: s.entries.map((e) =>
              e.id === entryId
                ? { ...e, sets: e.sets.filter((st) => st.id !== setId) }
                : e,
            ),
          }
        : s,
    )
  }

  async function handleRemoveEntry(entryId: string) {
    await deleteEntry(entryId)
    setSession((s) =>
      s ? { ...s, entries: s.entries.filter((e) => e.id !== entryId) } : s,
    )
  }

  // 드래그 순서 변경
  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !session) return
    const oldIndex = session.entries.findIndex((e) => e.id === active.id)
    const newIndex = session.entries.findIndex((e) => e.id === over.id)
    const reordered = arrayMove(session.entries, oldIndex, newIndex)
    setSession({ ...session, entries: reordered })
    await reorderEntries(reordered.map((e) => e.id))
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
      // 새로 추가되는 그룹 + 이미 공유된 그룹도 멘트/하이라이트 갱신을 위해 upsert
      toUpsert.length > 0
        ? shareSessionToGroups(session.id, toUpsert, message, highlight)
        : Promise.resolve(),
      ...toRemove.map((id) => unshareFromGroup(session.id, id)),
    ])
    await refreshSession()
  }

  async function handleComplete() {
    if (!session) return
    setCompleting(true)
    try {
      const endedAt = await endSession(session.id)
      setSession((s) => (s ? { ...s, ended_at: endedAt } : s))

      let setCount = 0
      let volume = 0
      for (const e of session.entries) {
        for (const st of e.sets) {
          if (st.reps > 0) {
            setCount += 1
            volume += (st.weight_kg ?? 0) * st.reps
          }
        }
      }
      const durationSec = session.started_at
        ? (new Date(endedAt).getTime() - new Date(session.started_at).getTime()) / 1000
        : 0
      setSummary({
        durationSec,
        exerciseCount: session.entries.length,
        setCount,
        volume,
      })
    } finally {
      setCompleting(false)
    }
  }

  // ── 렌더 ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-dim)]">
        불러오는 중…
      </div>
    )
  }

  const hasEntries = session && session.entries.length > 0

  return (
    <div className="px-4 py-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/')}
            aria-label="뒤로"
            className="-ml-1 rounded-full p-1 text-xl text-[var(--color-text-dim)]"
          >
            ←
          </button>
          <div>
            <h1 className="text-2xl font-bold">오늘 운동</h1>
            <p className="text-xs text-[var(--color-text-dim)]">
              {today}
              {session?.started_at && !session.ended_at && (
                <span className="ml-2">
                  <ElapsedTimer startedAt={session.started_at} />
                </span>
              )}
              {session?.started_at && session.ended_at && (
                <span className="ml-2 text-[var(--color-accent)]">
                  ✅ 완료 ·{' '}
                  {fmtDuration(
                    (new Date(session.ended_at).getTime() -
                      new Date(session.started_at).getTime()) /
                      1000,
                  )}
                </span>
              )}
            </p>
          </div>
        </div>
        {hasEntries && (
          <div className="flex flex-wrap justify-end gap-2">
            <button
              onClick={() => setSaveRoutineOpen(true)}
              className="rounded-full border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text-dim)]"
            >
              루틴 저장
            </button>
            <button
              onClick={openShare}
              className={
                'rounded-full px-3 py-1.5 text-xs font-semibold ' +
                (session!.shares.length > 0
                  ? 'bg-[var(--color-accent)] text-white'
                  : 'border border-[var(--color-border)] text-[var(--color-text-dim)]')
              }
            >
              {session!.shares.length > 0
                ? `공유됨 ✓ (${session!.shares.length})`
                : '피드에 공유'}
            </button>
            {!session!.ended_at && (
              <button
                onClick={handleComplete}
                disabled={completing}
                className="rounded-full bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
              >
                {completing ? '완료 중…' : '운동 완료'}
              </button>
            )}
          </div>
        )}
      </div>

      {!hasEntries && (
        <div className="mt-10 flex flex-col items-center gap-4 text-center">
          <div className="text-5xl">💪</div>
          <p className="text-sm text-[var(--color-text-dim)]">
            아직 오늘 운동이 없어요.
            <br />
            운동을 추가해 시작하세요.
          </p>
        </div>
      )}

      {hasEntries && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={session!.entries.map((e) => e.id)}
            strategy={verticalListSortingStrategy}
          >
            {session!.entries.map((entry) => (
              <EntryCard
                key={entry.id}
                entry={entry}
                last={lastByEx[entry.exercise_id] ?? null}
                onToggleComplete={toggleComplete}
                onChangeSet={changeSet}
                onPersistSet={persistSet}
                onAddSet={() => handleAddSet(entry.id)}
                onDeleteSet={(setId) => handleDeleteSet(entry.id, setId)}
                onChangeNotes={(notes) => changeNotes(entry.id, notes)}
                onPersistNotes={(notes) =>
                  updateEntryNotes(entry.id, notes).catch(() => {})
                }
                onRemove={() => handleRemoveEntry(entry.id)}
              />
            ))}
          </SortableContext>
        </DndContext>
      )}

      <button
        onClick={() => setPickerOpen(true)}
        className="mt-3 w-full rounded-xl bg-[var(--color-accent)] py-3.5 font-semibold text-white"
      >
        + 운동 추가
      </button>

      {pickerOpen && profile && (
        <ExercisePicker
          exercises={exercises}
          profileId={profile.profile_id}
          onPick={handlePick}
          onClose={() => setPickerOpen(false)}
          onExercisesChanged={() =>
            listExercises().then(setExercises)
          }
        />
      )}

      {restEndsAt && (
        <RestTimer
          endsAt={restEndsAt}
          baseSeconds={activeRest?.base}
          onAdjust={adjustRest}
          onDismiss={() => {
            cancelRestNotification()
            setRestEndsAt(null)
            setActiveRest(null)
          }}
        />
      )}

      {saveRoutineOpen && session && profile && (
        <SaveRoutineModal
          defaultName={`${today} 루틴`}
          onClose={() => setSaveRoutineOpen(false)}
          onSave={async (name) => {
            // 여기서 모달을 닫지 않는다 — 모달이 성공 화면을 보여주고
            // 사용자가 확인을 누르면 onClose로 닫힌다.
            await createRoutine(
              profile.profile_id,
              name,
              session.entries.map((e) => e.exercise_id),
            )
          }}
        />
      )}

      {summary && (
        <SessionSummaryModal
          durationSec={summary.durationSec}
          exerciseCount={summary.exerciseCount}
          setCount={summary.setCount}
          volume={summary.volume}
          onClose={() => {
            setSummary(null)
            navigate('/')
          }}
        />
      )}

      {shareOpen && session && profile && (
        <ShareSheet
          groups={profile.groups}
          currentShares={session.shares}
          highlight={shareHighlight}
          onClose={() => setShareOpen(false)}
          onConfirm={confirmShare}
        />
      )}

      {incomingCheer && (
        <CheerToast
          emoji={incomingCheer.emoji}
          fromNickname={incomingCheer.from_nickname}
          onDone={() => setIncomingCheer(null)}
        />
      )}
    </div>
  )
}
