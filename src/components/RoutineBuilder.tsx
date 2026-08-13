import { useState } from 'react'
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
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Exercise, Routine, RoutineEntryInput } from '../lib/types'
import { DEFAULT_SUPERSET_ROUNDS } from '../lib/types'
import { createRoutine, updateRoutine } from '../lib/routines'
import { ExercisePicker } from './ExercisePicker'

interface Row {
  uid: string
  exercise: Exercise
  // 기존 루틴에 있던 묶음 소속 정보. 이 편집기에서는 새 묶음을 만들 수 없고
  // (범위 밖), 불러온 묶음이 저장 시 그대로 살아남도록만 보존한다.
  superset_id: string | null
  superset_name: string | null
  superset_rest_seconds: number | null
  default_rounds: number | null
}

// 드래그로 자유롭게 순서를 바꿔도 "같은 superset_id는 order_index가 연속"
// 불변식이 깨지지 않도록, 저장 직전에 묶음 멤버를 그룹의 첫 등장 위치로 모아 정렬한다.
// 묶음이 아닌 행은 원래 자리를 그대로 유지한다.
function orderedForSave(rows: Row[]): Row[] {
  const firstIndexByGroup = new Map<string, number>()
  rows.forEach((r, i) => {
    if (r.superset_id && !firstIndexByGroup.has(r.superset_id)) {
      firstIndexByGroup.set(r.superset_id, i)
    }
  })
  return rows
    .map((r, i) => ({
      row: r,
      i,
      sortKey: r.superset_id ? firstIndexByGroup.get(r.superset_id)! : i,
    }))
    .sort((a, b) => a.sortKey - b.sortKey || a.i - b.i)
    .map((x) => x.row)
}

// 묶음 멤버를 제거하고 나서, 그룹에 1명만 남으면 더 이상 "묶음"이 아니므로
// 남은 한 명은 단독 운동으로 되돌린다 (묶음의 정의는 2개 이상 — SUPERSET-AND-TIME.md §1).
function collapseSingletonGroups(rows: Row[]): Row[] {
  const counts = new Map<string, number>()
  for (const r of rows) {
    if (r.superset_id) counts.set(r.superset_id, (counts.get(r.superset_id) ?? 0) + 1)
  }
  return rows.map((r) => {
    if (r.superset_id && counts.get(r.superset_id) === 1) {
      return {
        ...r,
        superset_id: null,
        superset_name: null,
        superset_rest_seconds: null,
        default_rounds: null,
      }
    }
    return r
  })
}

// 루틴 생성/수정 전체화면. 이름 + 운동 목록(드래그 순서변경) 구성 후 저장.
export function RoutineBuilder({
  initial,
  exercises,
  profileId,
  onExercisesChanged,
  onClose,
  onSaved,
}: {
  initial?: Routine
  exercises: Exercise[]
  profileId: string
  onExercisesChanged: () => void
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [rows, setRows] = useState<Row[]>(
    () =>
      initial?.entries
        .filter((e) => e.exercise)
        .map((e) => ({
          uid: crypto.randomUUID(),
          exercise: e.exercise!,
          superset_id: e.superset_id,
          superset_name: e.superset_name,
          superset_rest_seconds: e.superset_rest_seconds,
          default_rounds: e.default_rounds,
        })) ?? [],
  )
  const [pickerOpen, setPickerOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setRows((rs) => {
      const oldIndex = rs.findIndex((r) => r.uid === active.id)
      const newIndex = rs.findIndex((r) => r.uid === over.id)
      return arrayMove(rs, oldIndex, newIndex)
    })
  }

  async function save() {
    setBusy(true)
    try {
      const entries: RoutineEntryInput[] = orderedForSave(rows).map((r) => ({
        exercise_id: r.exercise.id,
        superset_id: r.superset_id,
        superset_name: r.superset_name,
        superset_rest_seconds: r.superset_rest_seconds,
        default_rounds: r.default_rounds,
      }))
      if (initial) await updateRoutine(initial.id, name, entries)
      else await createRoutine(profileId, name, entries)
      onSaved()
    } finally {
      setBusy(false)
    }
  }

  const canSave = name.trim().length > 0 && rows.length > 0 && !busy

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--color-bg)]">
      {/* 헤더 */}
      <div
        className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-3"
        style={{ paddingTop: 'calc(var(--safe-top) + 0.75rem)' }}
      >
        <button onClick={onClose} className="text-sm text-[var(--color-text-dim)]">
          취소
        </button>
        <h2 className="flex-1 text-center font-semibold">
          {initial ? '루틴 수정' : '새 루틴'}
        </h2>
        <button
          onClick={save}
          disabled={!canSave}
          className="text-sm font-semibold text-[var(--color-accent)] disabled:opacity-40"
        >
          {busy ? '저장 중…' : '저장'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="루틴 이름 (예: 등/이두 데이)"
          maxLength={30}
          className="mb-4 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3.5 py-3 outline-none focus:border-[var(--color-accent)]"
        />

        {rows.length === 0 && (
          <p className="py-8 text-center text-sm text-[var(--color-text-dim)]">
            운동을 추가해 루틴을 구성하세요.
          </p>
        )}

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={rows.map((r) => r.uid)}
            strategy={verticalListSortingStrategy}
          >
            {rows.map((row) => (
              <RoutineRow
                key={row.uid}
                row={row}
                onRemove={() =>
                  setRows((rs) =>
                    collapseSingletonGroups(rs.filter((r) => r.uid !== row.uid)),
                  )
                }
              />
            ))}
          </SortableContext>
        </DndContext>

        <button
          onClick={() => setPickerOpen(true)}
          className="mt-3 w-full rounded-xl border border-dashed border-[var(--color-border)] py-3 text-sm text-[var(--color-text-dim)]"
        >
          + 운동 추가
        </button>
      </div>

      {pickerOpen && (
        <ExercisePicker
          exercises={exercises}
          profileId={profileId}
          onPick={(ex) =>
            setRows((rs) => [
              ...rs,
              {
                uid: crypto.randomUUID(),
                exercise: ex,
                superset_id: null,
                superset_name: null,
                superset_rest_seconds: null,
                default_rounds: null,
              },
            ])
          }
          onClose={() => setPickerOpen(false)}
          onExercisesChanged={onExercisesChanged}
        />
      )}
    </div>
  )
}

function RoutineRow({ row, onRemove }: { row: Row; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: row.uid })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="mb-2 flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-3"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none text-[var(--color-text-dim)] active:cursor-grabbing"
        aria-label="순서 변경"
      >
        ⠿
      </button>
      <span className="flex flex-1 flex-col gap-0.5">
        <span>{row.exercise.name}</span>
        {row.superset_id && (
          <span className="inline-flex w-fit items-center gap-1 rounded-full bg-[var(--color-accent)]/15 px-2 py-0.5 text-[11px] font-medium text-[var(--color-accent)]">
            {row.superset_name ?? '묶음'} · {row.default_rounds ?? DEFAULT_SUPERSET_ROUNDS}
            라운드
          </span>
        )}
      </span>
      <span className="text-xs text-[var(--color-text-dim)]">
        {row.exercise.primary_muscle_group}
      </span>
      <button onClick={onRemove} className="text-[var(--color-text-dim)]">
        ✕
      </button>
    </div>
  )
}
