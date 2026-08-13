import { useState } from 'react'
import type { Exercise } from '../lib/types'
import { DEFAULT_SUPERSET_REST_SECONDS, DEFAULT_SUPERSET_ROUNDS } from '../lib/types'

// ExercisePicker에서 2개 이상 다중 선택한 직후, 묶음 이름/라운드 수/휴식을 정하는 시트.
// 저장 로직은 caller(LogPage)가 onConfirm에서 처리하고, 완료 후 닫을지는 caller가 결정한다
// (SaveRoutineModal과 동일한 "busy 상태 + 스스로 안 닫음" 패턴).
export function SupersetSetupSheet({
  exercises,
  defaultName,
  onClose,
  onConfirm,
}: {
  exercises: Exercise[]
  defaultName: string
  onClose: () => void
  onConfirm: (params: {
    name: string
    rounds: number
    restSeconds: number
  }) => void | Promise<void>
}) {
  const [name, setName] = useState(defaultName)
  const [rounds, setRounds] = useState(DEFAULT_SUPERSET_ROUNDS)
  const [restSeconds, setRestSeconds] = useState(DEFAULT_SUPERSET_REST_SECONDS)
  const [busy, setBusy] = useState(false)

  function clampRounds(n: number) {
    return Math.min(20, Math.max(1, n))
  }
  function clampRest(n: number) {
    return Math.min(600, Math.max(10, n))
  }

  async function submit() {
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      await onConfirm({ name: name.trim(), rounds, restSeconds })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
        style={{ marginBottom: 'calc(var(--safe-bottom) + 1rem)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-bold">묶음 만들기</h2>
        <p className="mb-4 text-sm text-[var(--color-text-dim)]">
          선택한 운동 {exercises.length}개를 라운드 단위로 반복해요.
        </p>

        <label className="mb-1 block text-xs font-medium text-[var(--color-text-dim)]">
          이름
        </label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={30}
          className="mb-4 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3.5 py-3 outline-none focus:border-[var(--color-accent)]"
        />

        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm font-medium">라운드 수</span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setRounds((r) => clampRounds(r - 1))}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-surface-2)] text-lg font-semibold"
              aria-label="라운드 수 줄이기"
            >
              −
            </button>
            <span className="w-8 text-center tabular-nums">{rounds}</span>
            <button
              onClick={() => setRounds((r) => clampRounds(r + 1))}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-surface-2)] text-lg font-semibold"
              aria-label="라운드 수 늘리기"
            >
              +
            </button>
          </div>
        </div>

        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm font-medium">라운드 간 휴식</span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setRestSeconds((s) => clampRest(s - 15))}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-surface-2)] text-lg font-semibold"
              aria-label="휴식 줄이기"
            >
              −
            </button>
            <span className="w-12 text-center tabular-nums">{restSeconds}초</span>
            <button
              onClick={() => setRestSeconds((s) => clampRest(s + 15))}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-surface-2)] text-lg font-semibold"
              aria-label="휴식 늘리기"
            >
              +
            </button>
          </div>
        </div>

        <div className="mb-5 rounded-xl bg-[var(--color-surface-2)] p-3">
          <div className="mb-1.5 text-xs font-medium text-[var(--color-text-dim)]">
            묶이는 운동
          </div>
          <ul className="space-y-1 text-sm">
            {exercises.map((ex) => (
              <li key={ex.id} className="flex items-center gap-1.5">
                <span className="text-[var(--color-text-dim)]">·</span>
                <span>{ex.name}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl bg-[var(--color-surface-2)] py-3 text-sm font-semibold"
          >
            취소
          </button>
          <button
            onClick={submit}
            disabled={!name.trim() || busy}
            className="flex-1 rounded-xl bg-[var(--color-accent)] py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy ? '만드는 중…' : '만들기'}
          </button>
        </div>
      </div>
    </div>
  )
}
