import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { WorkoutEntry, WorkoutSet } from '../lib/types'
import type { LastPerformance } from '../lib/workouts'

// 하나의 운동 항목 = 운동 이름 + 지난 기록 + 세트 목록. 드래그로 순서 변경 가능.
export function EntryCard({
  entry,
  last,
  onToggleComplete,
  onChangeSet,
  onPersistSet,
  onAddSet,
  onDeleteSet,
  onRemove,
}: {
  entry: WorkoutEntry
  last: LastPerformance | null
  onToggleComplete: (set: WorkoutSet) => void
  onChangeSet: (
    setId: string,
    patch: Partial<Pick<WorkoutSet, 'weight_kg' | 'reps'>>,
  ) => void
  // 저장은 상태를 다시 읽지 않고 구체적인 값을 직접 받는다 (stale 방지)
  onPersistSet: (
    setId: string,
    patch: Partial<Pick<WorkoutSet, 'weight_kg' | 'reps'>>,
  ) => void
  onAddSet: () => void
  onDeleteSet: (setId: string) => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: entry.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="mb-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5"
    >
      {/* 헤더: 드래그 핸들 + 이름 + 삭제 */}
      <div className="mb-2 flex items-center gap-2">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none text-[var(--color-text-dim)] active:cursor-grabbing"
          aria-label="순서 변경"
        >
          ⠿
        </button>
        <h3 className="flex-1 font-semibold">
          {entry.exercise?.name ?? '운동'}
        </h3>
        <button
          onClick={onRemove}
          className="text-xs text-[var(--color-text-dim)]"
        >
          삭제
        </button>
      </div>

      {/* 지난번 대비 */}
      {last && last.sets.length > 0 && (
        <div className="mb-2 text-xs text-[var(--color-text-dim)]">
          지난번 ({last.date.slice(5)}):{' '}
          {last.sets
            .map((s) => `${s.weight_kg ?? '맨몸'}kg×${s.reps}`)
            .join(' · ')}
        </div>
      )}

      {/* 세트 헤더 */}
      <div className="mb-1 grid grid-cols-[2rem_1fr_1fr_2.5rem_2rem] items-center gap-2 px-1 text-[10px] font-medium text-[var(--color-text-dim)]">
        <span>세트</span>
        <span>kg</span>
        <span>횟수</span>
        <span className="text-center">완료</span>
        <span></span>
      </div>

      {entry.sets.map((set, i) => (
        <SetRow
          key={set.id}
          index={i + 1}
          set={set}
          prev={last?.sets[i]}
          onToggleComplete={() => onToggleComplete(set)}
          onChange={(patch) => onChangeSet(set.id, patch)}
          onPersist={(patch) => onPersistSet(set.id, patch)}
          onDelete={() => onDeleteSet(set.id)}
        />
      ))}

      <button
        onClick={onAddSet}
        className="mt-2 w-full rounded-lg bg-[var(--color-surface-2)] py-2 text-sm font-medium text-[var(--color-text-dim)]"
      >
        + 세트 추가
      </button>
    </div>
  )
}

function SetRow({
  index,
  set,
  prev,
  onToggleComplete,
  onChange,
  onPersist,
  onDelete,
}: {
  index: number
  set: WorkoutSet
  prev?: { weight_kg: number | null; reps: number }
  onToggleComplete: () => void
  onChange: (patch: Partial<Pick<WorkoutSet, 'weight_kg' | 'reps'>>) => void
  onPersist: (patch: Partial<Pick<WorkoutSet, 'weight_kg' | 'reps'>>) => void
  onDelete: () => void
}) {
  const parseWeight = (v: string) => {
    const n = Number(v)
    return v.trim() === '' || Number.isNaN(n) ? null : n
  }
  const parseReps = (v: string) => {
    const n = parseInt(v, 10)
    return Number.isNaN(n) ? 0 : Math.max(0, n)
  }
  return (
    <div
      data-set-id={set.id}
      className={
        'grid grid-cols-[2rem_1fr_1fr_2.5rem_2rem] items-center gap-2 rounded-lg px-1 py-1 ' +
        (set.is_completed ? 'bg-[var(--color-success)]/10' : '')
      }
    >
      <span className="text-center text-sm text-[var(--color-text-dim)]">
        {index}
      </span>
      <input
        inputMode="decimal"
        value={
          set.weight_kg == null || Number.isNaN(set.weight_kg)
            ? ''
            : set.weight_kg
        }
        placeholder={prev?.weight_kg != null ? String(prev.weight_kg) : '0'}
        onChange={(e) => onChange({ weight_kg: parseWeight(e.target.value) })}
        onBlur={(e) => onPersist({ weight_kg: parseWeight(e.target.value) })}
        className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] py-1.5 text-center text-sm outline-none focus:border-[var(--color-accent)]"
      />
      <input
        inputMode="numeric"
        value={set.reps || ''}
        placeholder={prev?.reps != null ? String(prev.reps) : '0'}
        onChange={(e) => onChange({ reps: parseReps(e.target.value) })}
        onBlur={(e) => onPersist({ reps: parseReps(e.target.value) })}
        className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] py-1.5 text-center text-sm outline-none focus:border-[var(--color-accent)]"
      />
      <button
        onClick={onToggleComplete}
        className={
          'mx-auto flex h-6 w-6 items-center justify-center rounded-md text-xs ' +
          (set.is_completed
            ? 'bg-[var(--color-success)] text-white'
            : 'border border-[var(--color-border)]')
        }
      >
        {set.is_completed ? '✓' : ''}
      </button>
      <button
        onClick={onDelete}
        className="text-center text-xs text-[var(--color-text-dim)]"
      >
        ✕
      </button>
    </div>
  )
}
