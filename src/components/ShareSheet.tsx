import { useState } from 'react'
import type { Group, SessionShareRef } from '../lib/types'
import type { ShareHighlights } from '../lib/share'

// 여러 그룹에 동시 공유 + 그룹별이 아닌 공통 멘트(셋로그 스타일 캡션) 입력 +
// 자동 감지된 하이라이트(PR/새운동/피곤함) 토글.
export function ShareSheet({
  groups,
  currentShares,
  highlight,
  onClose,
  onConfirm,
}: {
  groups: Group[]
  currentShares: SessionShareRef[]
  highlight: ShareHighlights | null
  onClose: () => void
  onConfirm: (
    groupIds: string[],
    message: string,
    highlight: ShareHighlights | null,
  ) => Promise<void>
}) {
  const sharedIds = new Set(currentShares.map((s) => s.group_id))
  const [selected, setSelected] = useState<Set<string>>(new Set(sharedIds))
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  // '피곤함' 하이라이트는 기본 켜짐이지만 놀림당하기 싫은 날엔 끌 수 있어야 한다.
  const [highlightOn, setHighlightOn] = useState(true)

  function toggle(groupId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  async function submit() {
    setBusy(true)
    try {
      await onConfirm([...selected], message, highlightOn ? highlight : null)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  // 그룹 선택이 바뀌지 않았어도 멘트를 새로 추가하는 경우가 있으므로,
  // "아무 것도 안 하는" 경우(선택 없음+과거 공유 없음+멘트 없음)만 막는다.
  const changed = selected.size > 0 || sharedIds.size > 0 || message.trim().length > 0

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
        <h2 className="mb-4 text-lg font-bold">피드에 공유하기</h2>

        {highlight && (
          <button
            onClick={() => setHighlightOn((v) => !v)}
            className={
              'mb-4 flex w-full items-center justify-between gap-2 rounded-xl border px-3.5 py-3 text-left text-sm font-semibold transition-colors ' +
              (highlightOn
                ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]/30'
                : 'border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-dim)]')
            }
          >
            <span className={highlightOn ? '' : 'line-through'}>
              {highlight.title}
            </span>
            <span className="shrink-0 text-xs font-normal">
              {highlightOn ? '표시함' : '숨김'}
            </span>
          </button>
        )}

        <div className="mb-4 flex flex-col gap-2">
          {groups.map((g) => (
            <label
              key={g.group_id}
              className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3.5 py-3"
            >
              <input
                type="checkbox"
                checked={selected.has(g.group_id)}
                onChange={() => toggle(g.group_id)}
                className="h-5 w-5 accent-[var(--color-accent)]"
              />
              <span className="flex-1 text-sm font-medium">{g.name}</span>
              {sharedIds.has(g.group_id) && (
                <span className="text-xs text-[var(--color-accent)]">
                  공유됨
                </span>
              )}
            </label>
          ))}
        </div>

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="한마디 남기기 (선택)"
          maxLength={120}
          rows={2}
          className="mb-4 w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--color-accent)]"
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
            disabled={busy || !changed}
            className="flex-1 rounded-xl bg-[var(--color-accent)] py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy
              ? '처리 중…'
              : selected.size === 0
                ? '공유 취소'
                : `${selected.size}개 그룹에 공유`}
          </button>
        </div>
      </div>
    </div>
  )
}
