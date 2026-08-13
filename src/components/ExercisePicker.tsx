import { useMemo, useState } from 'react'
import {
  MUSCLE_GROUPS,
  TIME_KIND_MUSCLE_GROUP,
  type Exercise,
  type ExerciseKind,
  type MuscleGroup,
} from '../lib/types'
import { addCustomExercise } from '../lib/workouts'

// 부위별 카테고리 탭 + 검색 + 커스텀 추가가 있는 전체화면 운동 선택기.
// multiSelect=true면 탭이 선택을 토글하고, 2개 이상 골랐을 때만 "다음"으로
// onConfirmMulti를 호출한다 ("+ 묶음 추가" 플로우 — SUPERSET-AND-TIME.md 3.2).
export function ExercisePicker({
  exercises,
  profileId,
  onPick,
  onClose,
  onExercisesChanged,
  multiSelect = false,
  onConfirmMulti,
}: {
  exercises: Exercise[]
  profileId: string
  onPick: (exercise: Exercise) => void
  onClose: () => void
  onExercisesChanged: () => void
  multiSelect?: boolean
  onConfirmMulti?: (exercises: Exercise[]) => void
}) {
  const [tab, setTab] = useState<MuscleGroup | '전체'>('전체')
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [selected, setSelected] = useState<Exercise[]>([])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return exercises.filter((e) => {
      const matchTab = tab === '전체' || e.primary_muscle_group === tab
      const matchQuery = q === '' || e.name.toLowerCase().includes(q)
      return matchTab && matchQuery
    })
  }, [exercises, tab, query])

  function toggleSelect(ex: Exercise) {
    setSelected((prev) =>
      prev.some((s) => s.id === ex.id)
        ? prev.filter((s) => s.id !== ex.id)
        : [...prev, ex],
    )
  }

  function handleRowClick(ex: Exercise) {
    if (multiSelect) toggleSelect(ex)
    else onPick(ex)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--color-bg)]">
      {/* 헤더 */}
      <div
        className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-3"
        style={{ paddingTop: 'calc(var(--safe-top) + 0.75rem)' }}
      >
        <button onClick={onClose} className="text-xl leading-none">
          ✕
        </button>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="운동 검색"
          className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
        />
      </div>

      {/* 부위 탭 */}
      <div className="flex gap-2 overflow-x-auto border-b border-[var(--color-border)] px-4 py-2.5">
        {(['전체', ...MUSCLE_GROUPS] as const).map((g) => (
          <button
            key={g}
            onClick={() => setTab(g)}
            className={
              'shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ' +
              (tab === g
                ? 'bg-[var(--color-accent)] text-white'
                : 'bg-[var(--color-surface)] text-[var(--color-text-dim)]')
            }
          >
            {g}
          </button>
        ))}
      </div>

      {multiSelect && (
        <div className="border-b border-[var(--color-border)] px-4 py-2.5">
          <button
            onClick={() => selected.length >= 2 && onConfirmMulti?.(selected)}
            disabled={selected.length < 2}
            className="w-full rounded-lg bg-[var(--color-accent)] py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {selected.length < 2 ? '묶을 운동 2개 이상 선택' : `다음 (${selected.length}개 선택됨)`}
          </button>
        </div>
      )}

      {/* 목록 */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {filtered.length === 0 && (
          <p className="py-10 text-center text-sm text-[var(--color-text-dim)]">
            일치하는 운동이 없어요.
          </p>
        )}
        {filtered.map((ex) => {
          const isSelected = multiSelect && selected.some((s) => s.id === ex.id)
          return (
            <button
              key={ex.id}
              onClick={() => handleRowClick(ex)}
              className={
                'flex w-full items-center justify-between border-b border-[var(--color-border)]/50 py-3 text-left ' +
                (isSelected ? 'bg-[var(--color-accent)]/10' : '')
              }
            >
              <span className="flex items-center gap-2 text-[var(--color-text)]">
                {multiSelect && (
                  <span
                    className={
                      'flex h-4 w-4 items-center justify-center rounded-full border text-[9px] ' +
                      (isSelected
                        ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-white'
                        : 'border-[var(--color-border)]')
                    }
                  >
                    {isSelected ? '✓' : ''}
                  </span>
                )}
                {ex.name}
              </span>
              <span className="flex items-center gap-2">
                <span className="text-xs text-[var(--color-text-dim)]">
                  {ex.primary_muscle_group}
                  {ex.kind === 'time' && ' · 시간'}
                </span>
                {!ex.is_default && (
                  <span className="rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-dim)]">
                    내 운동
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>

      {/* 커스텀 추가 */}
      <div
        className="border-t border-[var(--color-border)] px-4 py-3"
        style={{ paddingBottom: 'calc(var(--safe-bottom) + 0.75rem)' }}
      >
        {adding ? (
          <CustomExerciseForm
            defaultGroup={tab === '전체' ? '가슴' : tab}
            profileId={profileId}
            onCancel={() => setAdding(false)}
            onAdded={(ex) => {
              setAdding(false)
              onExercisesChanged()
              // multiSelect에서는 바로 선택 목록에 추가 (단일 모드는 기존처럼 즉시 선택)
              if (multiSelect) toggleSelect(ex)
              else onPick(ex)
            }}
          />
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="w-full rounded-lg border border-dashed border-[var(--color-border)] py-2.5 text-sm text-[var(--color-text-dim)]"
          >
            + 목록에 없는 운동 직접 추가
          </button>
        )}
      </div>
    </div>
  )
}

function CustomExerciseForm({
  defaultGroup,
  profileId,
  onCancel,
  onAdded,
}: {
  defaultGroup: MuscleGroup
  profileId: string
  onCancel: () => void
  onAdded: (ex: Exercise) => void
}) {
  const [name, setName] = useState('')
  const [group, setGroup] = useState<MuscleGroup>(defaultGroup)
  const [kind, setKind] = useState<ExerciseKind>('reps')
  const [busy, setBusy] = useState(false)

  // 시간 기반은 코어에서만 허용된다 (DB 제약 exercises_time_is_core_only —
  // SUPERSET-AND-TIME.md 2.1절). 부위를 코어 밖으로 바꾸면 토글도 되돌린다.
  function changeGroup(g: MuscleGroup) {
    setGroup(g)
    if (g !== TIME_KIND_MUSCLE_GROUP) setKind('reps')
  }

  async function submit() {
    if (!name.trim()) return
    setBusy(true)
    try {
      const ex = await addCustomExercise(name, group, null, profileId, kind)
      onAdded(ex)
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
                : 'bg-[var(--color-surface)] text-[var(--color-text-dim)]')
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
                  : 'bg-[var(--color-surface)] text-[var(--color-text-dim)]')
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
          className="flex-1 rounded-lg bg-[var(--color-surface)] py-2 text-sm"
        >
          취소
        </button>
        <button
          onClick={submit}
          disabled={!name.trim() || busy}
          className="flex-1 rounded-lg bg-[var(--color-accent)] py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {busy ? '추가 중…' : '추가'}
        </button>
      </div>
    </div>
  )
}
