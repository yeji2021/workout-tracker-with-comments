import { useEffect, useRef, useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { WorkoutEntry, WorkoutSet } from '../lib/types'
import { isTimeBased } from '../lib/types'
import type { LastPerformance } from '../lib/workouts'

// 묶음(슈퍼세트) 멤버 하나 = 운동 entry + 그 운동의 지난 기록
export interface SupersetMember {
  entry: WorkoutEntry
  last: LastPerformance | null
}

// 묶음 하나를 렌더링. 라운드 i = 각 멤버 entry의 sets[i] (SUPERSET-AND-TIME.md §2.2 불변식 2).
export function SupersetCard({
  supersetId,
  name,
  restSeconds,
  rounds,
  members,
  onToggleComplete,
  onChangeSet,
  onPersistSet,
  onStartTimer,
  onAddRound,
  onRemoveRound,
  onMoveMemberUp,
  onMoveMemberDown,
  onRename,
  onChangeRestSeconds,
  onUngroup,
  onDelete,
  onSaveAsPreset,
}: {
  supersetId: string
  name: string
  restSeconds: number
  rounds: number
  members: SupersetMember[]
  onToggleComplete: (entryId: string, set: WorkoutSet) => void
  onChangeSet: (
    entryId: string,
    setId: string,
    patch: Partial<Pick<WorkoutSet, 'weight_kg' | 'reps' | 'duration_seconds'>>,
  ) => void
  onPersistSet: (
    entryId: string,
    setId: string,
    patch: Partial<Pick<WorkoutSet, 'weight_kg' | 'reps' | 'duration_seconds'>>,
  ) => void
  onStartTimer: (entryId: string, setId: string, targetSeconds: number) => void
  onAddRound: () => void
  onRemoveRound: (roundIndex: number) => void
  onMoveMemberUp: (entryId: string) => void
  onMoveMemberDown: (entryId: string) => void
  onRename: (newName: string) => void
  onChangeRestSeconds: (newSeconds: number) => void
  onUngroup: () => void
  onDelete: () => void
  onSaveAsPreset?: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: supersetId })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  }

  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState(name)
  const [editingRest, setEditingRest] = useState(false)

  // 이름이 외부(다른 세션/탭)에서 바뀌면 인라인 입력 초안도 맞춰준다.
  useEffect(() => {
    setNameDraft(name)
  }, [name])

  function submitRename() {
    const trimmed = nameDraft.trim()
    if (trimmed && trimmed !== name) onRename(trimmed.slice(0, 30))
    else setNameDraft(name)
    setRenaming(false)
  }

  function adjustRest(delta: number) {
    const next = Math.min(600, Math.max(10, restSeconds + delta))
    onChangeRestSeconds(next)
  }

  function handleDelete() {
    if (window.confirm('이 묶음을 삭제할까요? 기록도 함께 삭제돼요.')) onDelete()
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="mb-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5"
    >
      {/* 헤더: 드래그 핸들 + 이름/라운드 수 + 메뉴 */}
      <div className="mb-2 flex items-center gap-2">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none text-[var(--color-text-dim)] active:cursor-grabbing"
          aria-label="순서 변경"
        >
          ⠿
        </button>
        <h3 className="flex-1 truncate font-semibold">
          {name} · {rounds}라운드
        </h3>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="px-1 text-[var(--color-text-dim)]"
          aria-label="묶음 메뉴"
        >
          ⋯
        </button>
      </div>

      {menuOpen && (
        <div className="mb-3 rounded-xl bg-[var(--color-surface-2)] p-3 text-sm">
          {renaming ? (
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={submitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              }}
              maxLength={30}
              className="mb-2 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 outline-none focus:border-[var(--color-accent)]"
            />
          ) : (
            <button
              onClick={() => setRenaming(true)}
              className="mb-2 block w-full text-left text-[var(--color-text)]"
            >
              이름 변경
            </button>
          )}

          {editingRest ? (
            <div className="mb-2 flex items-center gap-2">
              <span className="text-[var(--color-text-dim)]">라운드 휴식</span>
              <button
                onClick={() => adjustRest(-15)}
                className="rounded-md bg-[var(--color-surface)] px-2 py-1 text-xs font-semibold"
              >
                −15초
              </button>
              <span className="tabular-nums">{restSeconds}초</span>
              <button
                onClick={() => adjustRest(15)}
                className="rounded-md bg-[var(--color-surface)] px-2 py-1 text-xs font-semibold"
              >
                +15초
              </button>
              <button
                onClick={() => setEditingRest(false)}
                className="ml-auto text-xs text-[var(--color-text-dim)]"
              >
                닫기
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditingRest(true)}
              className="mb-2 block w-full text-left text-[var(--color-text)]"
            >
              라운드 휴식 변경 ({restSeconds}초)
            </button>
          )}

          <button
            onClick={onUngroup}
            className="mb-2 block w-full text-left text-[var(--color-text)]"
          >
            묶음 해제
          </button>
          {onSaveAsPreset && (
            <button
              onClick={onSaveAsPreset}
              className="mb-2 block w-full text-left text-[var(--color-text)]"
            >
              📦 프리셋으로 저장 (지금 무게/횟수 그대로)
            </button>
          )}
          <button onClick={handleDelete} className="block w-full text-left text-red-500">
            묶음 삭제
          </button>
        </div>
      )}

      {/* 라운드별 렌더 */}
      {Array.from({ length: rounds }, (_, roundIndex) => (
        <div key={roundIndex} className="mb-3">
          <div className="mb-1 flex items-center gap-2 px-1">
            <span className="text-xs font-medium text-[var(--color-text-dim)]">
              라운드 {roundIndex + 1}
            </span>
            <button
              onClick={() => onRemoveRound(roundIndex)}
              className="ml-auto text-xs text-[var(--color-text-dim)]"
              aria-label={`라운드 ${roundIndex + 1} 삭제`}
            >
              ✕
            </button>
          </div>

          {members.map((member, memberIndex) => {
            const set = member.entry.sets[roundIndex]
            const timeBased = isTimeBased(member.entry.exercise)
            return (
              <div key={member.entry.id}>
                {roundIndex === 0 && (
                  <div className="mb-0.5 flex items-center gap-1.5 px-1 text-xs text-[var(--color-text-dim)]">
                    <span className="flex-1 truncate font-medium text-[var(--color-text)]">
                      {member.entry.exercise?.name ?? '운동'}
                    </span>
                    {memberIndex > 0 && (
                      <button
                        onClick={() => onMoveMemberUp(member.entry.id)}
                        aria-label="위로 이동"
                      >
                        ↑
                      </button>
                    )}
                    {memberIndex < members.length - 1 && (
                      <button
                        onClick={() => onMoveMemberDown(member.entry.id)}
                        aria-label="아래로 이동"
                      >
                        ↓
                      </button>
                    )}
                  </div>
                )}
                {set ? (
                  <SupersetSetRow
                    key={set.id}
                    set={set}
                    prev={member.last?.sets[roundIndex]}
                    timeBased={timeBased}
                    onToggleComplete={() => onToggleComplete(member.entry.id, set)}
                    onChange={(patch) => onChangeSet(member.entry.id, set.id, patch)}
                    onPersist={(patch) => onPersistSet(member.entry.id, set.id, patch)}
                    onStartTimer={(target) => onStartTimer(member.entry.id, set.id, target)}
                  />
                ) : (
                  <div
                    className={
                      'grid items-center gap-2 rounded-lg px-1 py-1 opacity-40 ' +
                      (timeBased
                        ? 'grid-cols-[1fr_1fr_2rem_2.5rem]'
                        : 'grid-cols-[1fr_1fr_2.5rem]')
                    }
                  >
                    <span className="text-center text-sm text-[var(--color-text-dim)]">＋</span>
                    <span />
                    {timeBased && <span />}
                    <span />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ))}

      <button
        onClick={onAddRound}
        className="mt-1 w-full rounded-lg bg-[var(--color-surface-2)] py-2 text-sm font-medium text-[var(--color-text-dim)]"
      >
        + 라운드 추가
      </button>
    </div>
  )
}

// 한 라운드 안, 한 멤버의 세트 입력 행. EntryCard의 SetRow와 동일한 시각/입력 패턴을 따르되,
// 묶음 불변식(라운드 단위 삭제만 허용)에 따라 세트 개별 삭제 버튼은 없다.
function SupersetSetRow({
  set,
  prev,
  timeBased,
  onToggleComplete,
  onChange,
  onPersist,
  onStartTimer,
}: {
  set: WorkoutSet
  prev?: { weight_kg: number | null; reps: number; duration_seconds: number | null }
  timeBased: boolean
  onToggleComplete: () => void
  onChange: (
    patch: Partial<Pick<WorkoutSet, 'weight_kg' | 'reps' | 'duration_seconds'>>,
  ) => void
  onPersist: (
    patch: Partial<Pick<WorkoutSet, 'weight_kg' | 'reps' | 'duration_seconds'>>,
  ) => void
  onStartTimer: (targetSeconds: number) => void
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

  // 소수점 입력 중("12.", "12.50")에 값이 즉시 반올림되어 '.'이 지워지는 문제를 막기 위해
  // 입력창 텍스트를 별도로 들고, set.weight_kg가 외부에서 바뀐 경우에만 동기화한다.
  // (EntryCard의 SetRow와 동일한 트릭)
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

  const gridCols = timeBased ? 'grid-cols-[1fr_1fr_2rem_2.5rem]' : 'grid-cols-[1fr_1fr_2.5rem]'

  return (
    <div
      data-set-id={set.id}
      className={
        `grid items-center gap-2 rounded-lg px-1 py-1 ${gridCols} ` +
        (set.is_completed ? 'bg-[var(--color-success)]/10' : '')
      }
    >
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
          onClick={() => onStartTimer(set.duration_seconds ?? 0)}
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
    </div>
  )
}
