import { useState } from 'react'

// 묶음(슈퍼세트)을 지금 입력된 무게/횟수 그대로 프리셋으로 저장하는 이름 입력 모달.
// SaveRoutineModal과 같은 "busy 상태 + 성공 화면 + 스스로 안 닫음" 패턴.
export function SavePresetModal({
  defaultName,
  onClose,
  onSave,
}: {
  defaultName: string
  onClose: () => void
  onSave: (name: string) => Promise<void>
}) {
  const [name, setName] = useState(defaultName)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  async function submit() {
    if (!name.trim()) return
    setBusy(true)
    try {
      await onSave(name)
      setSaved(true)
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
        <h2 className="mb-1 text-lg font-bold">묶음 프리셋으로 저장</h2>
        <p className="mb-4 text-sm text-[var(--color-text-dim)]">
          지금 입력된 무게/횟수 그대로 저장해요. 다음부터 운동 고르기 화면의
          "묶음" 탭에서 바로 골라 추가할 수 있어요.
        </p>
        {saved ? (
          <div className="flex flex-col items-center gap-3 py-2">
            <div className="text-3xl">✅</div>
            <p className="text-sm">프리셋으로 저장했어요.</p>
            <button
              onClick={onClose}
              className="mt-1 w-full rounded-xl bg-[var(--color-accent)] py-3 font-semibold text-white"
            >
              확인
            </button>
          </div>
        ) : (
          <>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={30}
              className="mb-4 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3.5 py-3 outline-none focus:border-[var(--color-accent)]"
            />
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
                {busy ? '저장 중…' : '저장'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
