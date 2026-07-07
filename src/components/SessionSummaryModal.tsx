import { fmtVolume } from '../lib/format'
import { fmtDuration } from './ElapsedTimer'

// "운동 완료" 직후 보여주는 요약 화면
export function SessionSummaryModal({
  durationSec,
  exerciseCount,
  setCount,
  volume,
  onClose,
}: {
  durationSec: number
  exerciseCount: number
  setCount: number
  volume: number
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4">
      <div
        className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-center"
        style={{ marginBottom: 'calc(var(--safe-bottom) + 1rem)' }}
      >
        <div className="mb-2 text-4xl">🎉</div>
        <h2 className="mb-1 text-lg font-bold">오늘 운동 완료!</h2>
        <p className="mb-5 text-sm text-[var(--color-text-dim)]">
          수고하셨어요.
        </p>

        <div className="mb-5 grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-[var(--color-surface-2)] py-3">
            <div className="text-lg font-bold">{fmtDuration(durationSec)}</div>
            <div className="text-[11px] text-[var(--color-text-dim)]">소요시간</div>
          </div>
          <div className="rounded-xl bg-[var(--color-surface-2)] py-3">
            <div className="text-lg font-bold">{exerciseCount}개 / {setCount}세트</div>
            <div className="text-[11px] text-[var(--color-text-dim)]">운동/세트</div>
          </div>
          <div className="rounded-xl bg-[var(--color-surface-2)] py-3">
            <div className="text-lg font-bold">{fmtVolume(volume)}</div>
            <div className="text-[11px] text-[var(--color-text-dim)]">볼륨</div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full rounded-xl bg-[var(--color-accent)] py-3 font-semibold text-white"
        >
          확인
        </button>
      </div>
    </div>
  )
}
