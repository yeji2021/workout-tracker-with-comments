import { useState } from 'react'
import type { Group } from '../lib/types'
import { createGroup, joinGroupExisting, leaveGroup } from '../lib/profile'

type Mode = 'list' | 'create' | 'join'

// 내 그룹 목록 + 새 그룹 만들기 / 초대코드로 참여 / 초대코드 확인 / 탈퇴.
export function GroupManageSheet({
  groups,
  onClose,
  onChanged,
}: {
  groups: Group[]
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const [mode, setMode] = useState<Mode>('list')
  const [name, setName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  async function copyInvite(g: Group) {
    try {
      await navigator.clipboard.writeText(g.invite_code)
      setCopiedId(g.group_id)
      setTimeout(() => setCopiedId(null), 1500)
    } catch {
      // 클립보드 실패 — 무시
    }
  }

  async function handleCreate() {
    if (!name.trim()) return
    setBusy(true)
    setError(null)
    try {
      await createGroup(name.trim())
      await onChanged()
      setMode('list')
      setName('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleJoin() {
    if (!inviteCode.trim()) return
    setBusy(true)
    setError(null)
    try {
      await joinGroupExisting(inviteCode.trim())
      await onChanged()
      setMode('list')
      setInviteCode('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleLeave(g: Group) {
    if (!confirm(`'${g.name}' 그룹에서 나갈까요?`)) return
    setBusy(true)
    setError(null)
    try {
      await leaveGroup(g.group_id)
      await onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
        style={{ paddingBottom: 'calc(var(--safe-bottom) + 1.25rem)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-bold">내 그룹</h2>

        {error && (
          <div className="mb-3 rounded-lg border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-3 py-2 text-sm text-[var(--color-danger)]">
            {error}
          </div>
        )}

        {mode === 'list' && (
          <>
            <div className="mb-4 flex flex-col gap-2">
              {groups.map((g) => (
                <div
                  key={g.group_id}
                  className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3.5 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">
                      {g.name}
                    </div>
                    <div className="font-mono text-xs text-[var(--color-text-dim)]">
                      {g.invite_code}
                    </div>
                  </div>
                  <button
                    onClick={() => copyInvite(g)}
                    className="shrink-0 rounded-md bg-[var(--color-surface)] px-2.5 py-1.5 text-xs font-semibold"
                  >
                    {copiedId === g.group_id ? '복사됨 ✓' : '초대코드 복사'}
                  </button>
                  <button
                    onClick={() => handleLeave(g)}
                    disabled={busy}
                    className="shrink-0 text-xs text-[var(--color-danger)] disabled:opacity-40"
                  >
                    나가기
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setMode('create')}
                className="flex-1 rounded-xl bg-[var(--color-surface-2)] py-3 text-sm font-semibold"
              >
                + 새 그룹 만들기
              </button>
              <button
                onClick={() => setMode('join')}
                className="flex-1 rounded-xl bg-[var(--color-surface-2)] py-3 text-sm font-semibold"
              >
                초대코드로 참여
              </button>
            </div>
          </>
        )}

        {mode === 'create' && (
          <>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 헬창들"
              maxLength={30}
              className="mb-4 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3.5 py-3 outline-none focus:border-[var(--color-accent)]"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setMode('list')}
                className="flex-1 rounded-xl bg-[var(--color-surface-2)] py-3 text-sm font-semibold"
              >
                취소
              </button>
              <button
                onClick={handleCreate}
                disabled={!name.trim() || busy}
                className="flex-1 rounded-xl bg-[var(--color-accent)] py-3 text-sm font-semibold text-white disabled:opacity-40"
              >
                {busy ? '만드는 중…' : '만들기'}
              </button>
            </div>
          </>
        )}

        {mode === 'join' && (
          <>
            <input
              autoFocus
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              placeholder="예: 9FC21C"
              maxLength={6}
              className="mb-4 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3.5 py-3 font-mono tracking-wider outline-none focus:border-[var(--color-accent)]"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setMode('list')}
                className="flex-1 rounded-xl bg-[var(--color-surface-2)] py-3 text-sm font-semibold"
              >
                취소
              </button>
              <button
                onClick={handleJoin}
                disabled={!inviteCode.trim() || busy}
                className="flex-1 rounded-xl bg-[var(--color-accent)] py-3 text-sm font-semibold text-white disabled:opacity-40"
              >
                {busy ? '참여 중…' : '참여하기'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
