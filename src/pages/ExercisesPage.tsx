import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProfile } from '../context/ProfileContext'
import {
  MUSCLE_GROUPS,
  TIME_KIND_MUSCLE_GROUP,
  type Exercise,
  type ExerciseKind,
  type MuscleGroup,
} from '../lib/types'
import {
  EXERCISE_IN_USE_ERROR,
  deleteCustomExercise,
  listExercises,
  updateCustomExercise,
} from '../lib/workouts'

// 내가 만든 커스텀 운동만 한곳에서 보고 수정/삭제. 기본 제공 운동은 RLS상
// 애초에 수정/삭제 권한이 없어서(exercises_update_own_custom 등) 목록에도 안 보여준다.
export function ExercisesPage() {
  const navigate = useNavigate()
  const { profile } = useProfile()

  const [exercises, setExercises] = useState<Exercise[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Exercise | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    const list = await listExercises()
    setExercises(list.filter((e) => !e.is_default))
  }

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      await refresh()
      if (!cancelled) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [profile])

  async function handleDelete(ex: Exercise) {
    if (!confirm(`"${ex.name}"을(를) 삭제할까요?`)) return
    setBusyId(ex.id)
    setError(null)
    try {
      await deleteCustomExercise(ex.id)
      await refresh()
    } catch (err) {
      if (err instanceof Error && err.message === EXERCISE_IN_USE_ERROR) {
        setError('이미 기록이나 루틴에 쓰인 운동은 삭제할 수 없어요. 이름만 바꿔보세요.')
      } else {
        setError('삭제하지 못했어요. 다시 시도해주세요.')
      }
    } finally {
      setBusyId(null)
    }
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
      <div className="mb-5 flex items-center gap-2">
        <button
          onClick={() => navigate(-1)}
          aria-label="뒤로"
          className="-ml-1 flex h-9 w-9 items-center justify-center rounded-full text-lg text-[var(--color-text-dim)] transition-colors hover:bg-[var(--color-surface)]"
        >
          ←
        </button>
        <h1 className="text-2xl font-bold">내 커스텀 운동</h1>
      </div>

      {error && (
        <p className="mb-3 text-sm text-[var(--color-danger)]">{error}</p>
      )}

      {exercises.length === 0 && (
        <div className="mt-10 flex flex-col items-center gap-4 text-center">
          <div className="text-5xl">🏷️</div>
          <p className="text-sm text-[var(--color-text-dim)]">
            아직 만든 커스텀 운동이 없어요.
            <br />
            운동 선택 화면에서 "+ 목록에 없는 운동 직접 추가"로 만들 수 있어요.
          </p>
        </div>
      )}

      {exercises.map((ex) => (
        <div
          key={ex.id}
          className="mb-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
        >
          {editing?.id === ex.id ? (
            <EditExerciseForm
              exercise={ex}
              onCancel={() => setEditing(null)}
              onSaved={() => {
                setEditing(null)
                refresh()
              }}
            />
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">{ex.name}</p>
                <p className="text-xs text-[var(--color-text-dim)]">
                  {ex.primary_muscle_group}
                  {ex.kind === 'time' && ' · 시간'}
                </p>
              </div>
              <div className="flex gap-3 text-xs text-[var(--color-text-dim)]">
                <button onClick={() => setEditing(ex)}>수정</button>
                <button
                  onClick={() => handleDelete(ex)}
                  disabled={busyId === ex.id}
                  className="disabled:opacity-40"
                >
                  {busyId === ex.id ? '삭제 중…' : '삭제'}
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function EditExerciseForm({
  exercise,
  onCancel,
  onSaved,
}: {
  exercise: Exercise
  onCancel: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(exercise.name)
  const [group, setGroup] = useState<MuscleGroup>(exercise.primary_muscle_group)
  const [kind, setKind] = useState<ExerciseKind>(exercise.kind)
  const [busy, setBusy] = useState(false)

  // 시간 기반은 코어에서만 허용된다 (DB 제약 exercises_time_is_core_only).
  function changeGroup(g: MuscleGroup) {
    setGroup(g)
    if (g !== TIME_KIND_MUSCLE_GROUP) setKind('reps')
  }

  async function submit() {
    if (!name.trim()) return
    setBusy(true)
    try {
      await updateCustomExercise(exercise.id, name, group, kind)
      onSaved()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="운동 이름"
        className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
      />
      <div className="flex gap-1.5 overflow-x-auto">
        {MUSCLE_GROUPS.map((g) => (
          <button
            key={g}
            onClick={() => changeGroup(g)}
            className={
              'shrink-0 rounded-full px-3 py-1 text-xs font-medium ' +
              (group === g
                ? 'bg-[var(--color-accent)] text-white'
                : 'bg-[var(--color-surface-2)] text-[var(--color-text-dim)]')
            }
          >
            {g}
          </button>
        ))}
      </div>
      {group === TIME_KIND_MUSCLE_GROUP && (
        <div className="flex gap-1.5">
          {(
            [
              { value: 'reps' as const, label: '횟수' },
              { value: 'time' as const, label: '시간' },
            ]
          ).map((opt) => (
            <button
              key={opt.value}
              onClick={() => setKind(opt.value)}
              className={
                'flex-1 rounded-lg py-1.5 text-xs font-medium ' +
                (kind === opt.value
                  ? 'bg-[var(--color-accent)] text-white'
                  : 'bg-[var(--color-surface-2)] text-[var(--color-text-dim)]')
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 rounded-lg bg-[var(--color-surface-2)] py-2 text-sm"
        >
          취소
        </button>
        <button
          onClick={submit}
          disabled={!name.trim() || busy}
          className="flex-1 rounded-lg bg-[var(--color-accent)] py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {busy ? '저장 중…' : '저장'}
        </button>
      </div>
    </div>
  )
}
