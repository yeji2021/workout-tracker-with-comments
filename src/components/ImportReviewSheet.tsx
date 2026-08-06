import { useEffect, useState } from 'react'
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
import {
  MUSCLE_GROUPS,
  type Exercise,
  type ExtractedRoutine,
  type MuscleGroup,
  type RoutineImport,
} from '../lib/types'
import { listExercises } from '../lib/workouts'
import { saveAsRoutine } from '../lib/routineImports'
import { ExercisePicker } from './ExercisePicker'

// 편집 중인 운동 한 줄.
// sets 는 입력 도중 빈 문자열이 될 수 있어 문자열로 들고 있다가 저장할 때 숫자로 바꾼다.
interface Row {
  uid: string
  name: string
  matchedExerciseId: string | null
  target: MuscleGroup | null
  setsText: string
  reps: string
  notes: string
}

// 추출 결과(ExtractedRoutine)를 사용자가 검토·수정한 뒤 내 루틴으로 저장하는 시트.
// imp.result 를 로컬 상태로 복사해서 편집하므로 DB 행은 건드리지 않는다
// (routine_imports 는 애초에 update 정책이 없어 클라이언트가 고칠 수 없다).
export function ImportReviewSheet({
  imp,
  onClose,
  onSaved,
}: {
  imp: RoutineImport
  onClose: () => void
  onSaved: () => void
}) {
  const [routineName, setRoutineName] = useState(() => safeRoutineName(imp.result))
  const [rows, setRows] = useState<Row[]>(() => toRows(imp.result))
  const [exercises, setExercises] = useState<Exercise[]>([])
  // 운동 선택기를 어떤 줄 때문에 열었는지. 'new' 면 새 줄 추가.
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )

  // 운동 선택기(기존 운동으로 대체/추가)에 넘길 목록
  async function loadExercises() {
    try {
      setExercises(await listExercises())
    } catch {
      // 목록을 못 읽어도 편집 자체는 계속할 수 있으므로 조용히 넘어간다
    }
  }

  useEffect(() => {
    void loadExercises()
  }, [])

  function patchRow(uid: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.uid === uid ? { ...r, ...patch } : r)))
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setRows((rs) => {
      const oldIndex = rs.findIndex((r) => r.uid === active.id)
      const newIndex = rs.findIndex((r) => r.uid === over.id)
      return arrayMove(rs, oldIndex, newIndex)
    })
  }

  // 선택기에서 고른 기존 운동을 새 줄로 추가하거나, 미매칭 줄을 대체한다
  function handlePick(ex: Exercise) {
    if (pickerFor === 'new') {
      setRows((rs) => [
        ...rs,
        {
          uid: crypto.randomUUID(),
          name: ex.name,
          matchedExerciseId: ex.id,
          target: ex.primary_muscle_group,
          setsText: '',
          reps: '',
          notes: '',
        },
      ])
    } else if (pickerFor) {
      patchRow(pickerFor, {
        name: ex.name,
        matchedExerciseId: ex.id,
        target: ex.primary_muscle_group,
      })
    }
    setPickerFor(null)
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const extracted: ExtractedRoutine = {
        routine_name: routineName,
        source_summary: safeSummary(imp.result) || null,
        exercises: rows
          .filter((r) => r.name.trim() !== '')
          .map((r) => {
            const sets = Number(r.setsText.trim())
            return {
              name: r.name.trim(),
              matched_exercise_id: r.matchedExerciseId,
              target: r.target,
              sets: r.setsText.trim() === '' || !Number.isFinite(sets) ? null : sets,
              reps: r.reps.trim() ? r.reps.trim() : null,
              notes: r.notes.trim() ? r.notes.trim() : null,
            }
          }),
      }
      await saveAsRoutine(imp.profile_id, extracted)
      onSaved()
    } catch (e) {
      // 대표 실패 경로는 "영상에서 인식한 운동 id 가 실제로는 없는" FK 위반이다.
      // 원문(violates foreign key constraint …) 대신 할 수 있는 행동을 알려준다.
      setError(
        userMessage(
          e,
          '저장에 실패했어요. 인식된 운동 중 일부를 찾을 수 없으니 해당 운동을 다시 골라 주세요.',
        ),
      )
    } finally {
      setBusy(false)
    }
  }

  const namedRows = rows.filter((r) => r.name.trim() !== '')
  const canSave = namedRows.length > 0 && !busy
  const newCount = namedRows.filter((r) => !r.matchedExerciseId).length

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-md flex-col rounded-t-2xl border border-[var(--color-border)] bg-[var(--color-surface)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-5 py-4">
          <h2 className="flex-1 text-lg font-bold">가져온 루틴 검토</h2>
          <button
            onClick={onClose}
            className="text-lg leading-none text-[var(--color-text-dim)]"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* 출처 요약 + 원본 링크 */}
          {safeSummary(imp.result) && (
            <p className="mb-2 text-sm text-[var(--color-text-dim)]">
              {safeSummary(imp.result)}
            </p>
          )}
          <a
            href={imp.url}
            target="_blank"
            rel="noreferrer noopener"
            className="mb-4 block truncate text-xs text-[var(--color-accent)] underline"
          >
            🔗 {imp.url}
          </a>

          {imp.result === null ? (
            <p className="py-10 text-center text-sm text-[var(--color-text-dim)]">
              아직 추출된 루틴이 없어요.
            </p>
          ) : (
            <>
              <input
                value={routineName}
                onChange={(e) => setRoutineName(e.target.value)}
                placeholder="루틴 이름 (예: 상체 푸시 데이)"
                maxLength={30}
                className="mb-3 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3.5 py-3 outline-none focus:border-[var(--color-accent)]"
              />

              <p className="mb-4 text-xs leading-relaxed text-[var(--color-text-dim)]">
                루틴에는 운동 구성과 순서만 저장돼요. 세트/횟수는 참고용이고, 운동을
                시작할 때 지난 기록에서 채워져요.
              </p>

              {rows.length === 0 && (
                <p className="py-8 text-center text-sm text-[var(--color-text-dim)]">
                  운동이 없어요. 아래에서 추가해 주세요.
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
                    <ExerciseRow
                      key={row.uid}
                      row={row}
                      onPatch={(patch) => patchRow(row.uid, patch)}
                      onRemove={() =>
                        setRows((rs) => rs.filter((r) => r.uid !== row.uid))
                      }
                      onReplace={() => setPickerFor(row.uid)}
                    />
                  ))}
                </SortableContext>
              </DndContext>

              <button
                onClick={() => setPickerFor('new')}
                className="mt-1 w-full rounded-xl border border-dashed border-[var(--color-border)] py-3 text-sm text-[var(--color-text-dim)]"
              >
                + 운동 추가
              </button>

              {newCount > 0 && (
                <p className="mt-3 text-xs text-[var(--color-text-dim)]">
                  ✨ 표시된 {newCount}개는 내 운동 목록에 없는 운동이에요. 저장하면
                  선택한 부위로 커스텀 운동이 만들어져요.
                </p>
              )}
            </>
          )}
        </div>

        {/* 하단 액션 */}
        <div
          className="border-t border-[var(--color-border)] px-5 py-4"
          style={{ paddingBottom: 'calc(var(--safe-bottom) + 1rem)' }}
        >
          {error && (
            <div className="mb-3 rounded-lg border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-3 py-2 text-sm text-[var(--color-danger)]">
              {error}
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 rounded-xl bg-[var(--color-surface-2)] py-3 text-sm font-semibold"
            >
              닫기
            </button>
            <button
              onClick={save}
              disabled={!canSave}
              className="flex-[2] rounded-xl bg-[var(--color-accent)] py-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              {busy ? '저장 중…' : '내 루틴으로 저장'}
            </button>
          </div>
        </div>
      </div>

      {/* 선택기 클릭이 오버레이(onClick={onClose})로 버블링되지 않도록 감싼다 */}
      {pickerFor && (
        <div onClick={(e) => e.stopPropagation()}>
          <ExercisePicker
            exercises={exercises}
            profileId={imp.profile_id}
            onPick={handlePick}
            onClose={() => setPickerFor(null)}
            onExercisesChanged={() => void loadExercises()}
          />
        </div>
      )}
    </div>
  )
}

// ── 운동 한 줄 (순서 변경 + 이름/세트/횟수/메모 편집) ────────────────
function ExerciseRow({
  row,
  onPatch,
  onRemove,
  onReplace,
}: {
  row: Row
  onPatch: (patch: Partial<Row>) => void
  onRemove: () => void
  onReplace: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: row.uid })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  }
  const isNew = row.matchedExerciseId === null

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={
        'mb-2 rounded-xl bg-[var(--color-surface-2)] px-3.5 py-3 ' +
        (isNew
          ? 'border border-dashed border-[var(--color-accent)]'
          : 'border border-[var(--color-border)]')
      }
    >
      {/* 이름 줄 */}
      <div className="flex items-center gap-2">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none text-[var(--color-text-dim)] active:cursor-grabbing"
          aria-label="순서 변경"
        >
          ⠿
        </button>
        <input
          value={row.name}
          onChange={(e) => onPatch({ name: e.target.value })}
          placeholder="운동 이름"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
        {isNew && (
          <span className="shrink-0 rounded bg-[var(--color-accent)]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-accent)]">
            새 운동
          </span>
        )}
        <button
          onClick={onRemove}
          className="shrink-0 text-[var(--color-text-dim)]"
          aria-label="삭제"
        >
          ✕
        </button>
      </div>

      {/* 세트 / 횟수 */}
      <div className="mt-2 flex gap-2">
        <label className="flex flex-1 items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5">
          <span className="text-xs text-[var(--color-text-dim)]">세트</span>
          <input
            inputMode="numeric"
            value={row.setsText}
            onChange={(e) =>
              onPatch({ setsText: e.target.value.replace(/[^0-9]/g, '') })
            }
            placeholder="4"
            className="w-full min-w-0 bg-transparent text-sm outline-none"
          />
        </label>
        <label className="flex flex-1 items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5">
          <span className="text-xs text-[var(--color-text-dim)]">횟수</span>
          <input
            value={row.reps}
            onChange={(e) => onPatch({ reps: e.target.value })}
            placeholder="8-12"
            className="w-full min-w-0 bg-transparent text-sm outline-none"
          />
        </label>
      </div>

      {/* 메모 */}
      <input
        value={row.notes}
        onChange={(e) => onPatch({ notes: e.target.value })}
        placeholder="메모 (예: 천천히 내리기)"
        className="mt-2 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
      />

      {/* 미매칭 운동: 부위 선택(커스텀 생성용) + 기존 운동으로 대체 */}
      {isNew ? (
        <div className="mt-2">
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {MUSCLE_GROUPS.map((g) => (
              <button
                key={g}
                onClick={() => onPatch({ target: g })}
                className={
                  'shrink-0 rounded-full px-3 py-1 text-xs font-medium ' +
                  (row.target === g
                    ? 'bg-[var(--color-accent)] text-white'
                    : 'bg-[var(--color-surface)] text-[var(--color-text-dim)]')
                }
              >
                {g}
              </button>
            ))}
          </div>
          <button
            onClick={onReplace}
            className="mt-1 text-xs text-[var(--color-accent)] underline"
          >
            기존 운동에서 고르기
          </button>
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-[var(--color-text-dim)]">{row.target}</span>
          <button
            onClick={onReplace}
            className="text-xs text-[var(--color-accent)] underline"
          >
            다른 운동으로 변경
          </button>
        </div>
      )}
    </div>
  )
}

// ── result jsonb 방어적 읽기 ────────────────────────────────────────
// result 는 앱이 아니라 관리자 처리 세션이 써 넣는 jsonb 이고, DB 컬럼에는
// 형태 제약이 전혀 없다. 타입 선언(ExtractedRoutine)은 약속일 뿐 보장이 아니라서
// 필드가 비거나 타입이 어긋난 채로 들어올 수 있다. 렌더 도중 터지면 앱 트리 전체가
// 언마운트되어 흰 화면이 되므로, 아래 세 함수를 통해서만 result 를 읽는다.
function safeText(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function safeRoutineName(result: ExtractedRoutine | null): string {
  return safeText((result as { routine_name?: unknown } | null)?.routine_name).trim()
}

function safeSummary(result: ExtractedRoutine | null): string {
  return safeText((result as { source_summary?: unknown } | null)?.source_summary).trim()
}

// result 를 편집용 로컬 상태로 복사 (원본 jsonb 는 손대지 않는다)
function toRows(result: ExtractedRoutine | null): Row[] {
  const list = (result as { exercises?: unknown } | null)?.exercises
  if (!Array.isArray(list)) return []
  return list.map((raw) => {
    const e = (raw ?? {}) as Record<string, unknown>
    const target = e.target
    const sets = e.sets
    return {
      uid: crypto.randomUUID(),
      name: safeText(e.name),
      matchedExerciseId:
        typeof e.matched_exercise_id === 'string' ? e.matched_exercise_id : null,
      target: MUSCLE_GROUPS.includes(target as MuscleGroup)
        ? (target as MuscleGroup)
        : null,
      setsText: typeof sets === 'number' && Number.isFinite(sets) ? String(sets) : '',
      reps: safeText(e.reps),
      notes: safeText(e.notes),
    }
  })
}

// 저장 실패 문구.
// PostgrestError 도 Error 를 상속하므로 instanceof 만으로는 DB 원문 영어 메시지를
// 못 거른다. code 속성 유무로 갈라서, 우리가 의도적으로 던진 Error 만 그대로 보여준다.
function userMessage(e: unknown, fallback: string): string {
  if (e instanceof Error && !('code' in e)) return e.message
  return fallback
}
