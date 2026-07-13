import { useState } from 'react'
import type { Profile } from '../lib/types'

// 복구코드는 발급 시 이 화면에서만 노출된다. 사용자가 저장을 확인해야 입장.
export function RecoveryCodeCard({
  profile,
  onDone,
}: {
  profile: Profile
  onDone: () => void
}) {
  const [confirmed, setConfirmed] = useState(false)

  return (
    <div className="flex min-h-full flex-col justify-center px-6 py-10">
      <div className="mb-6 text-center">
        <div className="mb-2 text-4xl">🔑</div>
        <h1 className="text-xl font-bold">복구 코드를 저장하세요</h1>
        <p className="mt-2 text-sm text-[var(--color-text-dim)]">
          폰을 바꾸거나 앱 데이터를 지우면 이 코드로만 기록을 되찾을 수 있어요.
          <br />
          <b className="text-[var(--color-text)]">지금 꼭 저장</b>해두세요. 다시
          볼 수 없어요.
        </p>
      </div>

      <CopyRow label="복구 코드" value={profile.recovery_code ?? ''} highlight />
      <div className="h-3" />
      <CopyRow
        label="내 그룹 초대코드"
        value={profile.groups[0]?.invite_code ?? ''}
      />

      <label className="mt-8 flex items-center gap-3 rounded-lg bg-[var(--color-surface)] px-4 py-3">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="h-5 w-5 accent-[var(--color-accent)]"
        />
        <span className="text-sm">복구 코드를 안전한 곳에 저장했어요</span>
      </label>

      <button
        onClick={onDone}
        disabled={!confirmed}
        className="mt-4 rounded-xl bg-[var(--color-accent)] px-4 py-3.5 font-semibold text-white disabled:opacity-40"
      >
        시작하기
      </button>
    </div>
  )
}

function CopyRow({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // 클립보드 실패 시 사용자가 직접 선택 복사
    }
  }
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-[var(--color-text-dim)]">
        {label}
      </div>
      <div
        className={
          'flex items-center justify-between gap-3 rounded-lg border px-4 py-3 ' +
          (highlight
            ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]/30'
            : 'border-[var(--color-border)] bg-[var(--color-surface-2)]')
        }
      >
        <code className="break-all font-mono text-sm tracking-wide">
          {value}
        </code>
        <button
          onClick={copy}
          className="shrink-0 rounded-md bg-[var(--color-surface)] px-3 py-1.5 text-xs font-semibold"
        >
          {copied ? '복사됨 ✓' : '복사'}
        </button>
      </div>
    </div>
  )
}
