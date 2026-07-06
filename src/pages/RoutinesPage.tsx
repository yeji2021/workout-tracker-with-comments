import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProfile } from '../context/ProfileContext'
import type { Exercise, Routine } from '../lib/types'
import {
  applyRoutineToToday,
  deleteRoutine,
  listRoutines,
} from '../lib/routines'
import { listExercises, todayISO } from '../lib/workouts'
import { RoutineBuilder } from '../components/RoutineBuilder'

export function RoutinesPage() {
  const { profile } = useProfile()
  const navigate = useNavigate()

  const [routines, setRoutines] = useState<Routine[]>([])
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [loading, setLoading] = useState(true)
  const [builder, setBuilder] = useState<null | { routine?: Routine }>(null)
  const [starting, setStarting] = useState<string | null>(null)

  async function refresh() {
    if (!profile) return
    const list = await listRoutines(profile.profile_id)
    setRoutines(list)
  }

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const [exs, list] = await Promise.all([
        listExercises(),
        listRoutines(profile.profile_id),
      ])
      if (cancelled) return
      setExercises(exs)
      setRoutines(list)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [profile])

  async function startRoutine(routine: Routine) {
    if (!profile) return
    setStarting(routine.id)
    try {
      const ids = routine.entries.map((e) => e.exercise_id)
      await applyRoutineToToday(profile, ids, todayISO())
      navigate('/log') // 기록 화면으로 이동 → 바로 세트 입력 시작
    } finally {
      setStarting(null)
    }
  }

  async function handleDelete(routine: Routine) {
    if (!confirm(`"${routine.name}" 루틴을 삭제할까요?`)) return
    await deleteRoutine(routine.id)
    refresh()
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
      <h1 className="mb-4 text-2xl font-bold">내 루틴</h1>

      {routines.length === 0 && (
        <div className="mt-10 flex flex-col items-center gap-4 text-center">
          <div className="text-5xl">📋</div>
          <p className="text-sm text-[var(--color-text-dim)]">
            아직 루틴이 없어요.
            <br />
            자주 하는 운동을 루틴으로 만들어보세요.
          </p>
        </div>
      )}

      {routines.map((routine) => (
        <div
          key={routine.id}
          className="mb-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
        >
          <div className="mb-1 flex items-center justify-between">
            <h3 className="font-semibold">{routine.name}</h3>
            <div className="flex gap-3 text-xs text-[var(--color-text-dim)]">
              <button onClick={() => setBuilder({ routine })}>수정</button>
              <button onClick={() => handleDelete(routine)}>삭제</button>
            </div>
          </div>
          <p className="mb-3 text-sm text-[var(--color-text-dim)]">
            {routine.entries.length === 0
              ? '운동 없음'
              : routine.entries
                  .map((e) => e.exercise?.name)
                  .filter(Boolean)
                  .join(', ')}
          </p>
          <button
            onClick={() => startRoutine(routine)}
            disabled={starting === routine.id || routine.entries.length === 0}
            className="w-full rounded-lg bg-[var(--color-accent)] py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {starting === routine.id ? '시작 중…' : '이 루틴으로 시작'}
          </button>
        </div>
      ))}

      <button
        onClick={() => setBuilder({})}
        className="mt-3 w-full rounded-xl bg-[var(--color-accent)] py-3.5 font-semibold text-white"
      >
        + 루틴 추가
      </button>

      {builder && profile && (
        <RoutineBuilder
          initial={builder.routine}
          exercises={exercises}
          profileId={profile.profile_id}
          onExercisesChanged={() => listExercises().then(setExercises)}
          onClose={() => setBuilder(null)}
          onSaved={() => {
            setBuilder(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}
