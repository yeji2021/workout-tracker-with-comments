import { useEffect, useRef, useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { WorkoutEntry, WorkoutSet } from '../lib/types'
import { isTimeBased } from '../lib/types'
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
  onChangeNotes,
  onPersistNotes,
  onRemove,
  onStartTimer,
}: {
  entry: WorkoutEntry
  last: LastPerformance | null
  onToggleComplete: (set: WorkoutSet) => void
  onChangeSet: (
    setId: string,
    patch: Partial<Pick<WorkoutSet, 'weight_kg' | 'reps' | 'duration_seconds'>>,
  ) => void
  // 저장은 상태를 다시 읽지 않고 구체적인 값을 직접 받는다 (stale 방지)
  onPersistSet: (
    setId: string,
    patch: Partial<Pick<WorkoutSet, 'weight_kg' | 'reps' | 'duration_seconds'>>,
  ) => void
  onAddSet: () => void
  onDeleteSet: (setId: string) => void
  onChangeNotes: (notes: string) => void
  onPersistNotes: (notes: string) => void
  onRemove: () => void
  // 시간 기반(코어) 운동에서만 쓰인다 — 세트의 ▶ 탭 시 목표 시간(초)과 함께 호출
  onStartTimer?: (setId: string, targetSeconds: number) => void
}) {
  const timeBased = isTimeBased(entry.exercise)
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

      {/* 메모 (운동별 자유 기록: 폼 느낌, 통증 등) */}
      <input
        value={entry.notes ?? ''}
        onChange={(e) => onChangeNotes(e.target.value)}
        onBlur={(e) => onPersistNotes(e.target.value)}
        placeholder="📝 메모 추가"
        maxLength={200}
        className="mb-2 w-full rounded-md bg-[var(--color-surface-2)] px-2.5 py-1.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
      />

      {/* 지난번 대비 */}
      {last && last.sets.length > 0 && (
        <div className="mb-2 text-xs text-[var(--color-text-dim)]">
          지난번 ({last.date.slice(5)}):{' '}
          {last.sets
            .map((s) =>
              timeBased
                ? `${s.weight_kg != null ? s.weight_kg + 'kg·' : ''}${s.duration_seconds ?? 0}초`
                : `${s.weight_kg ?? '맨몸'}kg×${s.reps}`,
            )
            .join(' · ')}
        </div>
      )}

      {/* 세트 헤더 */}
      <div
        className={
          'mb-1 grid items-center gap-2 px-1 text-[10px] font-medium text-[var(--color-text-dim)] ' +
          (timeBased
            ? 'grid-cols-[2rem_1fr_1fr_2rem_2.5rem_2rem]'
            : 'grid-cols-[2rem_1fr_1fr_2.5rem_2rem]')
        }
      >
        <span>세트</span>
        <span>kg</span>
        <span>{timeBased ? '시간' : '횟수'}</span>
        {timeBased && <span></span>}
        <span className="text-center">완료</span>
        <span></span>
      </div>

      {entry.sets.map((set, i) => (
        <SetRow
          key={set.id}
          index={i + 1}
          set={set}
          prev={last?.sets[i]}
          timeBased={timeBased}
          onToggleComplete={() => onToggleComplete(set)}
          onChange={(patch) => onChangeSet(set.id, patch)}
          onPersist={(patch) => onPersistSet(set.id, patch)}
          onDelete={() => onDeleteSet(set.id)}
          onStartTimer={
            onStartTimer ? (target) => onStartTimer(set.id, target) : undefined
          }
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
  timeBased,
  onToggleComplete,
  onChange,
  onPersist,
  onDelete,
  onStartTimer,
}: {
  index: number
  set: WorkoutSet
  prev?: { weight_kg: number | null; reps: number; duration_seconds?: number | null }
  timeBased: boolean
  onToggleComplete: () => void
  onChange: (
    patch: Partial<Pick<WorkoutSet, 'weight_kg' | 'reps' | 'duration_seconds'>>,
  ) => void
  onPersist: (
    patch: Partial<Pick<WorkoutSet, 'weight_kg' | 'reps' | 'duration_seconds'>>,
  ) => void
  onDelete: () => void
  onStartTimer?: (targetSeconds: number) => void
}) {
  const parseWeight = (v: string) => {
    const n = Number(v)
    return v.trim() === '' || Number.isNaN(n) ? null : n
  }
  const parseReps = (v: string) => {
    const n = parseInt(v, 10)
    return Number.isNaN(n) ? 0 : Math.max(0, n)
  }
  const parseDuration = (v: string) => {
    const n = parseInt(v, 10)
    return Number.isNaN(n) ? null : Math.max(0, n)
  }

  // 소수점 입력 중("12.", "12.50") 값이 즉시 숫자로 반올림되어 '.'이
  // 지워지는 문제를 막기 위해 입력창 텍스트를 별도로 들고 있는다.
  // set.weight_kg가 우리 입력이 아닌 외부(자동 채우기 등)에서 바뀐 경우에만 동기화한다.
  const [weightText, setWeightText] = useState(() =>
    set.weight_kg == null ? '' : String(set.weight_kg),
  )
  const lastEmitted = useRef(set.weight_kg)
  useEffect(() => {
    if (set.weight_kg !== lastEmitted.current) {
      lastEmitted.current = set.weight_kg
      setWeightText(set.weight_kg == null ? '' : String(set.weight_kg))
    }
  }, [set.weight_kg])

  function handleWeightChange(v: string) {
    if (!/^\d*\.?\d*$/.test(v)) return
    setWeightText(v)
    const parsed = parseWeight(v)
    lastEmitted.current = parsed
    onChange({ weight_kg: parsed })
  }

  function handleWeightBlur() {
    const parsed = parseWeight(weightText)
    setWeightText(parsed == null ? '' : String(parsed))
    onPersist({ weight_kg: parsed })
  }

  const gridCols = timeBased
    ? 'grid-cols-[2rem_1fr_1fr_2rem_2.5rem_2rem]'
    : 'grid-cols-[2rem_1fr_1fr_2.5rem_2rem]'

  return (
    <div
      data-set-id={set.id}
      className={
        `grid items-center gap-2 rounded-lg px-1 py-1 ${gridCols} ` +
        (set.is_completed ? 'bg-[var(--color-success)]/10' : '')
      }
    >
      <span className="text-center text-sm text-[var(--color-text-dim)]">
        {index}
      </span>
      <input
        inputMode="decimal"
        value={weightText}
        placeholder={prev?.weight_kg != null ? String(prev.weight_kg) : '0'}
        onChange={(e) => handleWeightChange(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={handleWeightBlur}
        className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] py-1.5 text-center text-sm outline-none focus:border-[var(--color-accent)]"
      />
      {timeBased ? (
        <input
          inputMode="numeric"
          value={set.duration_seconds ?? ''}
          placeholder={prev?.duration_seconds != null ? String(prev.duration_seconds) : '0'}
          onChange={(e) => onChange({ duration_seconds: parseDuration(e.target.value) })}
          onFocus={(e) => e.target.select()}
          onBlur={(e) => onPersist({ duration_seconds: parseDuration(e.target.value) })}
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] py-1.5 text-center text-sm outline-none focus:border-[var(--color-accent)]"
        />
      ) : (
        <input
          inputMode="numeric"
          value={set.reps || ''}
          placeholder={prev?.reps != null ? String(prev.reps) : '0'}
          onChange={(e) => onChange({ reps: parseReps(e.target.value) })}
          onFocus={(e) => e.target.select()}
          onBlur={(e) => onPersist({ reps: parseReps(e.target.value) })}
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] py-1.5 text-center text-sm outline-none focus:border-[var(--color-accent)]"
        />
      )}
      {timeBased && (
        <button
          onClick={() => onStartTimer?.(set.duration_seconds ?? 0)}
          className="mx-auto flex h-6 w-6 items-center justify-center rounded-md border border-[var(--color-border)] text-xs"
          aria-label="타이머 시작"
        >
          ▶
        </button>
      )}
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
