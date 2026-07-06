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
import type { Exercise, Routine } from '../lib/types'
import { createRoutine, updateRoutine } from '../lib/routines'
import { ExercisePicker } from './ExercisePicker'

interface Row {
  uid: string
  exercise: Exercise
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
        .map((e) => ({ uid: crypto.randomUUID(), exercise: e.exercise! })) ?? [],
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
      const ids = rows.map((r) => r.exercise.id)
      if (initial) await updateRoutine(initial.id, name, ids)
      else await createRoutine(profileId, name, ids)
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
                  setRows((rs) => rs.filter((r) => r.uid !== row.uid))
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
            setRows((rs) => [...rs, { uid: crypto.randomUUID(), exercise: ex }])
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
      <span className="flex-1">{row.exercise.name}</span>
      <span className="text-xs text-[var(--color-text-dim)]">
        {row.exercise.primary_muscle_group}
      </span>
      <button onClick={onRemove} className="text-[var(--color-text-dim)]">
        ✕
      </button>
    </div>
  )
}
