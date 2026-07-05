import { useMemo, useState } from 'react'
import { MUSCLE_GROUPS, type Exercise, type MuscleGroup } from '../lib/types'
import { addCustomExercise } from '../lib/workouts'

// 부위별 카테고리 탭 + 검색 + 커스텀 추가가 있는 전체화면 운동 선택기
export function ExercisePicker({
  exercises,
  profileId,
  onPick,
  onClose,
  onExercisesChanged,
}: {
  exercises: Exercise[]
  profileId: string
  onPick: (exercise: Exercise) => void
  onClose: () => void
  onExercisesChanged: () => void
}) {
  const [tab, setTab] = useState<MuscleGroup | '전체'>('전체')
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return exercises.filter((e) => {
      const matchTab = tab === '전체' || e.primary_muscle_group === tab
      const matchQuery = q === '' || e.name.toLowerCase().includes(q)
      return matchTab && matchQuery
    })
  }, [exercises, tab, query])

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

      {/* 목록 */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {filtered.length === 0 && (
          <p className="py-10 text-center text-sm text-[var(--color-text-dim)]">
            일치하는 운동이 없어요.
          </p>
        )}
        {filtered.map((ex) => (
          <button
            key={ex.id}
            onClick={() => onPick(ex)}
            className="flex w-full items-center justify-between border-b border-[var(--color-border)]/50 py-3 text-left"
          >
            <span className="text-[var(--color-text)]">{ex.name}</span>
            <span className="flex items-center gap-2">
              <span className="text-xs text-[var(--color-text-dim)]">
                {ex.primary_muscle_group}
              </span>
              {!ex.is_default && (
                <span className="rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-dim)]">
                  내 운동
                </span>
              )}
            </span>
          </button>
        ))}
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
              onPick(ex) // 추가하자마자 바로 선택
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
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!name.trim()) return
    setBusy(true)
    try {
      const ex = await addCustomExercise(name, group, null, profileId)
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
            onClick={() => setGroup(g)}
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
