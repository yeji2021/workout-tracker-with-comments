import { useState, type ReactNode } from 'react'
import { useProfile } from '../context/ProfileContext'
import {
  createGroupAndJoin,
  joinGroup,
  recoverProfile,
} from '../lib/profile'
import type { Profile } from '../lib/types'
import { RecoveryCodeCard } from '../components/RecoveryCodeCard'

type Mode = 'start' | 'create' | 'join' | 'recover'

export function OnboardingPage() {
  const { setProfile } = useProfile()
  const [mode, setMode] = useState<Mode>('start')
  const [nickname, setNickname] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 새로 발급된 복구코드 화면 (여기서만 사용자에게 노출됨)
  const [issued, setIssued] = useState<Profile | null>(null)

  async function run(fn: () => Promise<Profile>, needIssueScreen: boolean) {
    setBusy(true)
    setError(null)
    try {
      const p = await fn()
      if (needIssueScreen && p.recovery_code) {
        setIssued(p) // 복구코드 안내 화면 → 사용자가 확인 후 입장
      } else {
        setProfile(p)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  // 복구코드 안내 화면
  if (issued) {
    return (
      <RecoveryCodeCard
        profile={issued}
        onDone={() => setProfile(issued)}
      />
    )
  }

  return (
    <div className="flex min-h-full flex-col justify-center px-6 py-10">
      <div className="mb-8 text-center">
        <div className="mb-2 text-4xl">🏋️</div>
        <h1 className="text-2xl font-bold">운동 트래커</h1>
        <p className="mt-1 text-sm text-[var(--color-text-dim)]">
          닉네임만 정하면 바로 시작해요
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-3 py-2 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      )}

      {mode === 'start' && (
        <div className="flex flex-col gap-3">
          <PrimaryButton onClick={() => setMode('create')}>
            새로 시작하기
          </PrimaryButton>
          <SecondaryButton onClick={() => setMode('join')}>
            친구 초대코드로 참여
          </SecondaryButton>
          <button
            onClick={() => setMode('recover')}
            className="mt-2 text-center text-xs text-[var(--color-text-dim)] underline"
          >
            기존 기록 복구하기 (복구 코드)
          </button>
        </div>
      )}

      {mode === 'create' && (
        <Form
          onBack={() => setMode('start')}
          onSubmit={() => run(() => createGroupAndJoin(nickname), true)}
          busy={busy}
          submitLabel="시작하기"
          canSubmit={nickname.trim().length > 0}
        >
          <Field
            label="닉네임"
            value={nickname}
            onChange={setNickname}
            placeholder="예: 지혜"
            maxLength={20}
          />
        </Form>
      )}

      {mode === 'join' && (
        <Form
          onBack={() => setMode('start')}
          onSubmit={() => run(() => joinGroup(inviteCode, nickname), true)}
          busy={busy}
          submitLabel="참여하기"
          canSubmit={nickname.trim().length > 0 && inviteCode.trim().length > 0}
        >
          <Field
            label="초대코드"
            value={inviteCode}
            onChange={(v) => setInviteCode(v.toUpperCase())}
            placeholder="예: 9FC21C"
            maxLength={6}
            mono
          />
          <Field
            label="닉네임"
            value={nickname}
            onChange={setNickname}
            placeholder="이 그룹에서 쓸 이름"
            maxLength={20}
          />
        </Form>
      )}

      {mode === 'recover' && (
        <Form
          onBack={() => setMode('start')}
          onSubmit={() => run(() => recoverProfile(recoveryCode), false)}
          busy={busy}
          submitLabel="복구하기"
          canSubmit={recoveryCode.trim().length > 0}
        >
          <Field
            label="복구 코드"
            value={recoveryCode}
            onChange={setRecoveryCode}
            placeholder="가입 때 저장한 20자 코드"
            mono
          />
        </Form>
      )}
    </div>
  )
}

// ── 작은 UI 프리미티브 ──────────────────────────────────────────────
function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-xl bg-[var(--color-accent)] px-4 py-3.5 text-center font-semibold text-white disabled:opacity-40"
    >
      {children}
    </button>
  )
}

function SecondaryButton({
  children,
  onClick,
}: {
  children: ReactNode
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3.5 text-center font-semibold text-[var(--color-text)]"
    >
      {children}
    </button>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  mono,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  maxLength?: number
  mono?: boolean
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-[var(--color-text-dim)]">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className={
          'rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3.5 py-3 text-[var(--color-text)] outline-none focus:border-[var(--color-accent)] ' +
          (mono ? 'font-mono tracking-wider' : '')
        }
      />
    </label>
  )
}

function Form({
  children,
  onBack,
  onSubmit,
  busy,
  submitLabel,
  canSubmit,
}: {
  children: ReactNode
  onBack: () => void
  onSubmit: () => void
  busy: boolean
  submitLabel: string
  canSubmit: boolean
}) {
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (canSubmit && !busy) onSubmit()
      }}
    >
      {children}
      <PrimaryButton disabled={!canSubmit || busy}>
        {busy ? '처리 중…' : submitLabel}
      </PrimaryButton>
      <button
        type="button"
        onClick={onBack}
        className="text-center text-xs text-[var(--color-text-dim)]"
      >
        ← 뒤로
      </button>
    </form>
  )
}
