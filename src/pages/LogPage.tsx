import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import type { Exercise, SessionBlock, WorkoutSession, WorkoutSet } from '../lib/types'
import {
  addEntry,
  addSet,
  addSupersetRound,
  createSession,
  createSuperset,
  deleteEntry,
  deleteSet,
  deleteSuperset,
  endSession,
  getLastPerformance,
  getSessionByDate,
  listExercises,
  removeSupersetRound,
  renameSuperset,
  reorderEntries,
  setSupersetRestSeconds,
  swapEntryOrder,
  todayISO,
  toRoutineEntryInputs,
  ungroupSuperset,
  updateEntryNotes,
  updateSet,
  type LastPerformance,
} from '../lib/workouts'
import { fetchAllSessions, isLoggedSet } from '../lib/stats'
import { shareSessionToGroups, unshareFromGroup, type ShareHighlights } from '../lib/share'
import { detectHighlights } from '../lib/highlights'
import { type Cheer } from '../lib/live'
import { useLive } from '../context/LiveContext'
import { createRoutine } from '../lib/routines'
import {
  DEFAULT_REST_SECONDS,
  clampRest,
  listRestPrefs,
  setRestPref,
} from '../lib/restPrefs'
import {
  cancelScheduledRestBeep,
  scheduleRestBeep,
  unlockAudio,
} from '../lib/audio'
import {
  cancelRestNotification,
  ensureNotifyPermission,
  scheduleRestNotification,
} from '../lib/notify'
import { ExercisePicker } from '../components/ExercisePicker'
import { EntryCard } from '../components/EntryCard'
import { SupersetCard } from '../components/SupersetCard'
import { SupersetSetupSheet } from '../components/SupersetSetupSheet'
import { ExerciseTimer } from '../components/ExerciseTimer'
import { RestTimer } from '../components/RestTimer'
import { SaveRoutineModal } from '../components/SaveRoutineModal'
import { ElapsedTimer, fmtDuration } from '../components/ElapsedTimer'
import { SessionSummaryModal } from '../components/SessionSummaryModal'
import { ShareSheet } from '../components/ShareSheet'
import { CheerToast } from '../components/CheerToast'

type SupersetBlock = Extract<SessionBlock, { kind: 'superset' }>

// session.entries(order_index 순 flat 목록) → 렌더 단위(단독/묶음) 블록으로 묶는다.
// 같은 superset_id는 항상 order_index가 연속이라는 불변식(SUPERSET-AND-TIME.md 2.2)
// 덕분에, 순서대로 훑으며 직전 블록과 superset_id가 같으면 이어붙이기만 하면 된다.
function buildBlocks(entries: WorkoutSession['entries']): SessionBlock[] {
  const blocks: SessionBlock[] = []
  for (const entry of entries) {
    if (!entry.superset_id) {
      blocks.push({ kind: 'single', key: entry.id, entry })
      continue
    }
    const last = blocks[blocks.length - 1]
    if (last && last.kind === 'superset' && last.key === entry.superset_id) {
      last.entries.push(entry)
    } else {
      blocks.push({
        kind: 'superset',
        key: entry.superset_id,
        name: entry.superset_name ?? '묶음',
        restSeconds: entry.superset_rest_seconds ?? 90,
        entries: [entry],
      })
    }
  }
  return blocks
}

// 묶음 기본 이름: 선택한 운동들의 최빈 부위 + " 묶음"
function suggestSupersetName(exs: Exercise[]): string {
  const counts = new Map<string, number>()
  for (const ex of exs) {
    counts.set(ex.primary_muscle_group, (counts.get(ex.primary_muscle_group) ?? 0) + 1)
  }
  let best: string = exs[0]?.primary_muscle_group ?? '운동'
  let bestCount = 0
  for (const [g, c] of counts) {
    if (c > bestCount) {
      best = g
      bestCount = c
    }
  }
  return `${best} 묶음`
}

// 휴식 시작 시 누구 소유의 기본값을 조정/저장할지 — 단일 운동은 exercise_rest_prefs,
// 묶음은 그 묶음의 superset_rest_seconds. ±10초 조정(adjustRest)이 이 구분에 따라
// 서로 다른 곳에 저장한다.
type ActiveRest =
  | { kind: 'exercise'; exerciseId: string; base: number; label?: string }
  | { kind: 'superset'; sessionId: string; supersetId: string; base: number; label?: string }

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
  const [pickerMode, setPickerMode] = useState<'single' | 'superset' | null>(null)
  const [supersetDraft, setSupersetDraft] = useState<Exercise[] | null>(null)
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null)
  const [restPrefs, setRestPrefs] = useState<Record<string, number>>({})
  const [activeRest, setActiveRest] = useState<ActiveRest | null>(null)
  const [exerciseTimer, setExerciseTimer] = useState<{
    entryId: string
    setId: string
    startedAt: number
    targetSeconds: number | null
    exerciseName?: string
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

  const blocks = useMemo(() => (session ? buildBlocks(session.entries) : []), [session])

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
    setPickerMode(null)
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
          await addSet(
            newEntry.id,
            perf.sets[i].weight_kg,
            perf.sets[i].reps,
            i,
            perf.sets[i].duration_seconds,
          )
        }
      }
    }

    await refreshSession()
  }

  // 묶음 만들기 확정 (ExercisePicker 다중 선택 → SupersetSetupSheet)
  async function handleConfirmSuperset(params: {
    name: string
    rounds: number
    restSeconds: number
  }) {
    if (!profile || !supersetDraft) return
    let ses = session
    if (!ses) ses = await createSession(profile, today)
    await createSuperset(profile, ses, {
      exerciseIds: supersetDraft.map((ex) => ex.id),
      name: params.name,
      rounds: params.rounds,
      restSeconds: params.restSeconds,
    })
    setSupersetDraft(null)
    pendingScroll.current = { type: 'bottom' }
    await refreshSession()
  }

  // ── 세트 편집 ──────────────────────────────────────────────────
  // 입력 중 debounce 저장 (blur에만 의존하지 않아 백그라운드 전환에도 안전)
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  function changeSet(
    setId: string,
    patch: Partial<Pick<WorkoutSet, 'weight_kg' | 'reps' | 'duration_seconds'>>,
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
    patch: Partial<
      Pick<WorkoutSet, 'weight_kg' | 'reps' | 'duration_seconds' | 'is_completed'>
    >,
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

  function patchSupersetRestLocal(supersetId: string, seconds: number) {
    setSession((s) =>
      s
        ? {
            ...s,
            entries: s.entries.map((e) =>
              e.superset_id === supersetId
                ? { ...e, superset_rest_seconds: seconds }
                : e,
            ),
          }
        : s,
    )
  }

  // 구체적 값을 직접 받아 저장 (상태를 다시 읽지 않아 stale 방지)
  async function persistSet(
    setId: string,
    patch: Partial<Pick<WorkoutSet, 'weight_kg' | 'reps' | 'duration_seconds'>>,
  ) {
    await updateSet(setId, patch)
  }

  // 휴식 시작 — 단일 운동 완료, 묶음 라운드 완료, 운동 타이머 완료가 모두 이 한 곳을 거친다.
  function beginRest(baseSeconds: number, active: ActiveRest) {
    unlockAudio() // 사용자 제스처(탭) 안 — iOS 오디오 언락은 여기서만 가능
    ensureNotifyPermission() // 마찬가지로 제스처 안에서만 권한 프롬프트가 뜬다
    const endsAt = Date.now() + baseSeconds * 1000
    // 종료 비프를 오디오 클럭에 미리 예약 — 백그라운드/타이머 throttle에도 제시각에 울린다
    scheduleRestBeep(endsAt)
    setRestEndsAt(endsAt)
    setActiveRest(active)
    scheduleRestNotification(endsAt, active.label)
  }

  async function toggleComplete(set: WorkoutSet) {
    const next = !set.is_completed
    patchSetLocal(set.id, { is_completed: next })
    if (next) {
      const entry = session?.entries.find((e) => e.id === set.entry_id)
      const exerciseId = entry?.exercise_id
      const base = exerciseId
        ? (restPrefs[exerciseId] ?? DEFAULT_REST_SECONDS)
        : DEFAULT_REST_SECONDS
      const exerciseName = exercises.find((e) => e.id === exerciseId)?.name
      if (exerciseId) {
        beginRest(base, { kind: 'exercise', exerciseId, base, label: exerciseName })
      }
    }
    await updateSet(set.id, { is_completed: next })
  }

  // 묶음 멤버 세트 완료 — 라운드의 "마지막 멤버"를 완료했을 때만 휴식을 시작한다
  // (SUPERSET-AND-TIME.md 3.4). 앞선 멤버들은 바로 다음 운동으로 이어간다.
  async function toggleSupersetComplete(
    entryId: string,
    set: WorkoutSet,
    block: SupersetBlock,
  ) {
    const next = !set.is_completed
    patchSetLocal(set.id, { is_completed: next })
    if (next) {
      const isLastMember = block.entries[block.entries.length - 1]?.id === entryId
      if (isLastMember && session) {
        beginRest(block.restSeconds, {
          kind: 'superset',
          sessionId: session.id,
          supersetId: block.key,
          base: block.restSeconds,
          label: block.name,
        })
      }
    }
    await updateSet(set.id, { is_completed: next })
  }

  // 휴식 조정 = 그 소유(운동/묶음)의 다음 기본 휴식값 확정 저장
  function adjustRest(deltaSeconds: number) {
    // 예약(비프/알림)은 상태 업데이터 밖, 즉 제스처 안에서 한 번만 다시 건다
    const next = (restEndsAt ?? Date.now()) + deltaSeconds * 1000
    setRestEndsAt(next)
    scheduleRestBeep(next) // 기존 예약은 내부에서 취소되고 새 종료 시각으로 재예약
    scheduleRestNotification(next, activeRest?.label)
    setActiveRest((a) => {
      if (!a || !profile) return a
      const newBase = clampRest(a.base + deltaSeconds)
      if (a.kind === 'exercise') {
        setRestPrefs((m) => ({ ...m, [a.exerciseId]: newBase }))
        setRestPref(profile.profile_id, a.exerciseId, newBase).catch(() => {})
      } else {
        patchSupersetRestLocal(a.supersetId, newBase)
        setSupersetRestSeconds(a.sessionId, a.supersetId, newBase).catch(() => {})
      }
      return { ...a, base: newBase }
    })
  }

  // ── 시간 기반(코어) 운동 타이머 ──────────────────────────────────
  // 운동 타이머와 휴식 타이머는 동시에 뜨지 않는다 — 시작하면 진행 중이던 휴식을 취소한다.
  function startExerciseTimer(entryId: string, setId: string, targetSecondsRaw: number) {
    if (restEndsAt) {
      cancelScheduledRestBeep()
      cancelRestNotification()
      setRestEndsAt(null)
      setActiveRest(null)
    }
    unlockAudio() // 제스처(▶ 탭) 안 — 마운트 후에는 iOS가 거부한다
    ensureNotifyPermission()
    const entry = session?.entries.find((e) => e.id === entryId)
    setExerciseTimer({
      entryId,
      setId,
      startedAt: Date.now(),
      targetSeconds: targetSecondsRaw > 0 ? targetSecondsRaw : null,
      exerciseName: entry?.exercise?.name,
    })
  }

  async function finishExerciseTimer(actualSeconds: number) {
    const t = exerciseTimer
    setExerciseTimer(null)
    if (!t || !session) return
    patchSetLocal(t.setId, { duration_seconds: actualSeconds, is_completed: true })
    await updateSet(t.setId, { duration_seconds: actualSeconds, is_completed: true })

    // 완료 처리는 ✓ 수동 탭과 동일한 규칙을 따른다: 단독이면 그 운동 휴식,
    // 묶음이면 라운드 마지막 멤버일 때만.
    const block = blocks.find((b) =>
      b.kind === 'single'
        ? b.entry.id === t.entryId
        : b.entries.some((e) => e.id === t.entryId),
    )
    if (!block) return
    if (block.kind === 'single') {
      const exerciseId = block.entry.exercise_id
      const base = restPrefs[exerciseId] ?? DEFAULT_REST_SECONDS
      beginRest(base, {
        kind: 'exercise',
        exerciseId,
        base,
        label: block.entry.exercise?.name,
      })
    } else {
      const isLastMember = block.entries[block.entries.length - 1]?.id === t.entryId
      if (isLastMember) {
        beginRest(block.restSeconds, {
          kind: 'superset',
          sessionId: session.id,
          supersetId: block.key,
          base: block.restSeconds,
          label: block.name,
        })
      }
    }
  }

  async function handleAddSet(entryId: string) {
    const entry = session?.entries.find((e) => e.id === entryId)
    if (!entry) return
    // autofill: 직전 세트 → 지난 기록 → 빈 값
    const lastSet = entry.sets[entry.sets.length - 1]
    const perf = lastByEx[entry.exercise_id]
    const fill = lastSet
      ? {
          weight: lastSet.weight_kg,
          reps: lastSet.reps,
          duration: lastSet.duration_seconds,
        }
      : perf?.sets[0]
        ? {
            weight: perf.sets[0].weight_kg,
            reps: perf.sets[0].reps,
            duration: perf.sets[0].duration_seconds,
          }
        : { weight: null, reps: 0, duration: null }
    const created = await addSet(
      entryId,
      fill.weight,
      fill.reps,
      entry.sets.length,
      fill.duration,
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

  // ── 묶음 라운드/멤버/메타 조작 ──────────────────────────────────
  async function handleAddSupersetRound(block: SupersetBlock) {
    const nextIndex = Math.max(0, ...block.entries.map((e) => e.sets.length))
    const members = block.entries.map((e) => {
      const lastSet = e.sets[e.sets.length - 1]
      const perf = lastByEx[e.exercise_id]
      const fill = lastSet
        ? {
            weight_kg: lastSet.weight_kg,
            reps: lastSet.reps,
            duration_seconds: lastSet.duration_seconds,
          }
        : perf?.sets[0]
          ? {
              weight_kg: perf.sets[0].weight_kg,
              reps: perf.sets[0].reps,
              duration_seconds: perf.sets[0].duration_seconds,
            }
          : { weight_kg: null, reps: 0, duration_seconds: null }
      return { entryId: e.id, orderIndex: nextIndex, ...fill }
    })
    const created = await addSupersetRound(members)
    setSession((s) => {
      if (!s) return s
      const byEntry = new Map(created.map((c) => [c.entry_id, c]))
      return {
        ...s,
        entries: s.entries.map((e) => {
          const c = byEntry.get(e.id)
          return c ? { ...e, sets: [...e.sets, c] } : e
        }),
      }
    })
  }

  async function handleRemoveSupersetRound(block: SupersetBlock, roundIndex: number) {
    const setIds = block.entries
      .map((e) => e.sets[roundIndex]?.id)
      .filter((id): id is string => !!id)
    if (setIds.length === 0) return
    await removeSupersetRound(setIds)
    setSession((s) =>
      s
        ? {
            ...s,
            entries: s.entries.map((e) =>
              e.superset_id === block.key
                ? { ...e, sets: e.sets.filter((_, i) => i !== roundIndex) }
                : e,
            ),
          }
        : s,
    )
  }

  async function handleMoveMember(
    block: SupersetBlock,
    entryId: string,
    direction: -1 | 1,
  ) {
    const idx = block.entries.findIndex((e) => e.id === entryId)
    const otherIdx = idx + direction
    if (idx === -1 || otherIdx < 0 || otherIdx >= block.entries.length) return
    const a = block.entries[idx]
    const b = block.entries[otherIdx]
    await swapEntryOrder(a.id, a.order_index, b.id, b.order_index)
    setSession((s) => {
      if (!s) return s
      const entries = s.entries
        .map((e) => {
          if (e.id === a.id) return { ...e, order_index: b.order_index }
          if (e.id === b.id) return { ...e, order_index: a.order_index }
          return e
        })
        .sort((x, y) => x.order_index - y.order_index)
      return { ...s, entries }
    })
  }

  async function handleRenameSuperset(block: SupersetBlock, newName: string) {
    if (!session) return
    await renameSuperset(session.id, block.key, newName)
    setSession((s) =>
      s
        ? {
            ...s,
            entries: s.entries.map((e) =>
              e.superset_id === block.key ? { ...e, superset_name: newName } : e,
            ),
          }
        : s,
    )
  }

  async function handleChangeSupersetRest(block: SupersetBlock, newSeconds: number) {
    if (!session) return
    await setSupersetRestSeconds(session.id, block.key, newSeconds)
    patchSupersetRestLocal(block.key, newSeconds)
  }

  async function handleUngroupSuperset(block: SupersetBlock) {
    if (!session) return
    await ungroupSuperset(session.id, block.key)
    setSession((s) =>
      s
        ? {
            ...s,
            entries: s.entries.map((e) =>
              e.superset_id === block.key
                ? { ...e, superset_id: null, superset_name: null, superset_rest_seconds: null }
                : e,
            ),
          }
        : s,
    )
  }

  async function handleDeleteSuperset(block: SupersetBlock) {
    if (!session) return
    await deleteSuperset(session.id, block.key)
    setSession((s) =>
      s ? { ...s, entries: s.entries.filter((e) => e.superset_id !== block.key) } : s,
    )
  }

  // 드래그 순서 변경 — 블록(단독 운동 또는 묶음 전체) 단위로 움직인다.
  // 블록을 펼쳐 멤버 id들을 연속으로 나열한 뒤 기존 reorderEntries를 그대로 쓴다.
  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !session) return
    const oldIndex = blocks.findIndex((b) => b.key === active.id)
    const newIndex = blocks.findIndex((b) => b.key === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reorderedBlocks = arrayMove(blocks, oldIndex, newIndex)
    const flatEntries = reorderedBlocks.flatMap((b) =>
      b.kind === 'single' ? [b.entry] : b.entries,
    )
    setSession({ ...session, entries: flatEntries })
    await reorderEntries(flatEntries.map((e) => e.id))
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
          if (isLoggedSet(st)) {
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
            items={blocks.map((b) => b.key)}
            strategy={verticalListSortingStrategy}
          >
            {blocks.map((block) =>
              block.kind === 'single' ? (
                <EntryCard
                  key={block.key}
                  entry={block.entry}
                  last={lastByEx[block.entry.exercise_id] ?? null}
                  onToggleComplete={toggleComplete}
                  onChangeSet={changeSet}
                  onPersistSet={persistSet}
                  onAddSet={() => handleAddSet(block.entry.id)}
                  onDeleteSet={(setId) => handleDeleteSet(block.entry.id, setId)}
                  onChangeNotes={(notes) => changeNotes(block.entry.id, notes)}
                  onPersistNotes={(notes) =>
                    updateEntryNotes(block.entry.id, notes).catch(() => {})
                  }
                  onRemove={() => handleRemoveEntry(block.entry.id)}
                  onStartTimer={(setId, target) =>
                    startExerciseTimer(block.entry.id, setId, target)
                  }
                />
              ) : (
                <SupersetCard
                  key={block.key}
                  supersetId={block.key}
                  name={block.name}
                  restSeconds={block.restSeconds}
                  rounds={Math.max(0, ...block.entries.map((e) => e.sets.length))}
                  members={block.entries.map((e) => ({
                    entry: e,
                    last: lastByEx[e.exercise_id] ?? null,
                  }))}
                  onToggleComplete={(entryId, set) =>
                    toggleSupersetComplete(entryId, set, block)
                  }
                  onChangeSet={(_entryId, setId, patch) => changeSet(setId, patch)}
                  onPersistSet={(_entryId, setId, patch) => persistSet(setId, patch)}
                  onStartTimer={(entryId, setId, target) =>
                    startExerciseTimer(entryId, setId, target)
                  }
                  onAddRound={() => handleAddSupersetRound(block)}
                  onRemoveRound={(roundIndex) =>
                    handleRemoveSupersetRound(block, roundIndex)
                  }
                  onMoveMemberUp={(entryId) => handleMoveMember(block, entryId, -1)}
                  onMoveMemberDown={(entryId) => handleMoveMember(block, entryId, 1)}
                  onRename={(newName) => handleRenameSuperset(block, newName)}
                  onChangeRestSeconds={(newSeconds) =>
                    handleChangeSupersetRest(block, newSeconds)
                  }
                  onUngroup={() => handleUngroupSuperset(block)}
                  onDelete={() => handleDeleteSuperset(block)}
                />
              ),
            )}
          </SortableContext>
        </DndContext>
      )}

      <div className="mt-3 flex gap-2">
        <button
          onClick={() => setPickerMode('single')}
          className="flex-1 rounded-xl bg-[var(--color-accent)] py-3.5 font-semibold text-white"
        >
          + 운동 추가
        </button>
        <button
          onClick={() => setPickerMode('superset')}
          className="flex-1 rounded-xl border border-[var(--color-border)] py-3.5 font-semibold text-[var(--color-text-dim)]"
        >
          + 묶음 추가
        </button>
      </div>

      {exerciseTimer && (
        <ExerciseTimer
          startedAt={exerciseTimer.startedAt}
          targetSeconds={exerciseTimer.targetSeconds}
          exerciseName={exerciseTimer.exerciseName}
          onComplete={finishExerciseTimer}
          onCancel={() => setExerciseTimer(null)}
        />
      )}

      {!exerciseTimer && restEndsAt && (
        <RestTimer
          endsAt={restEndsAt}
          baseSeconds={activeRest?.base}
          onAdjust={adjustRest}
          onDismiss={() => {
            cancelScheduledRestBeep()
            cancelRestNotification()
            setRestEndsAt(null)
            setActiveRest(null)
          }}
        />
      )}

      {pickerMode && profile && (
        <ExercisePicker
          exercises={exercises}
          profileId={profile.profile_id}
          onPick={handlePick}
          onClose={() => setPickerMode(null)}
          onExercisesChanged={() => listExercises().then(setExercises)}
          multiSelect={pickerMode === 'superset'}
          onConfirmMulti={(exs) => {
            setPickerMode(null)
            setSupersetDraft(exs)
          }}
        />
      )}

      {supersetDraft && (
        <SupersetSetupSheet
          exercises={supersetDraft}
          defaultName={suggestSupersetName(supersetDraft)}
          onClose={() => setSupersetDraft(null)}
          onConfirm={handleConfirmSuperset}
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
              toRoutineEntryInputs(session.entries),
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
