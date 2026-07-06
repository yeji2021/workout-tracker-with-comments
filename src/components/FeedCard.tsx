import { useMemo, useState } from 'react'
import { FEED_EMOJIS, type FeedItem } from '../lib/feed'
import { fmtVolume } from '../lib/format'

function relativeDate(iso: string, today: string): string {
  if (iso === today) return '오늘'
  return iso.slice(5).replace('-', '/')
}

export function FeedCard({
  item,
  myProfileId,
  today,
  onToggleReaction,
  onAddComment,
  onDeleteComment,
}: {
  item: FeedItem
  myProfileId: string
  today: string
  onToggleReaction: (emoji: string) => void
  onAddComment: (text: string) => Promise<void>
  onDeleteComment: (commentId: string) => void
}) {
  const [commentText, setCommentText] = useState('')
  const [sending, setSending] = useState(false)
  const [showComments, setShowComments] = useState(false)

  // 이모지별 집계 + 내가 눌렀는지
  const reactionAgg = useMemo(() => {
    return FEED_EMOJIS.map((emoji) => {
      const list = item.reactions.filter((r) => r.emoji === emoji)
      return {
        emoji,
        count: list.length,
        mine: list.some((r) => r.user_id === myProfileId),
      }
    })
  }, [item.reactions, myProfileId])

  async function submit() {
    const text = commentText.trim()
    if (!text || sending) return
    setSending(true)
    try {
      await onAddComment(text)
      setCommentText('')
      setShowComments(true)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="mb-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      {/* 헤더 */}
      <div className="mb-2 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-sm font-bold">
          {item.nickname.slice(0, 1)}
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold">
            {item.nickname}
            {item.is_mine && (
              <span className="ml-1 text-xs text-[var(--color-text-dim)]">
                (나)
              </span>
            )}
          </div>
          <div className="text-xs text-[var(--color-text-dim)]">
            {relativeDate(item.date, today)}
          </div>
        </div>
        {item.volume > 0 && (
          <div className="text-right text-xs text-[var(--color-text-dim)]">
            총 볼륨
            <div className="text-sm font-semibold text-[var(--color-text)]">
              {fmtVolume(item.volume)}
            </div>
          </div>
        )}
      </div>

      {/* 운동 요약 */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {item.exercises.length === 0 ? (
          <span className="text-xs text-[var(--color-text-dim)]">운동 없음</span>
        ) : (
          item.exercises.map((e, i) => (
            <span
              key={i}
              className="rounded-full bg-[var(--color-surface-2)] px-2.5 py-1 text-xs"
            >
              {e.name}
              {e.setCount > 0 && (
                <span className="text-[var(--color-text-dim)]">
                  {' '}
                  {e.setCount}세트
                </span>
              )}
            </span>
          ))
        )}
      </div>

      {/* 이모지 리액션 바 */}
      <div className="flex flex-wrap gap-1.5">
        {reactionAgg.map((r) => (
          <button
            key={r.emoji}
            onClick={() => onToggleReaction(r.emoji)}
            className={
              'flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm transition-colors ' +
              (r.mine
                ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]/40'
                : 'border-[var(--color-border)]')
            }
          >
            <span>{r.emoji}</span>
            {r.count > 0 && (
              <span className="text-xs tabular-nums text-[var(--color-text-dim)]">
                {r.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 댓글 */}
      <div className="mt-3 border-t border-[var(--color-border)]/50 pt-2">
        {item.comments.length > 0 && !showComments && (
          <button
            onClick={() => setShowComments(true)}
            className="text-xs text-[var(--color-text-dim)]"
          >
            댓글 {item.comments.length}개 보기
          </button>
        )}
        {(showComments || item.comments.length === 0) &&
          item.comments.map((c) => (
            <div key={c.id} className="flex items-start gap-2 py-1 text-sm">
              <span className="font-semibold">{c.nickname}</span>
              <span className="flex-1">{c.text}</span>
              {c.user_id === myProfileId && (
                <button
                  onClick={() => onDeleteComment(c.id)}
                  className="text-xs text-[var(--color-text-dim)]"
                >
                  삭제
                </button>
              )}
            </div>
          ))}

        {/* 댓글 입력 */}
        <div className="mt-2 flex gap-2">
          <input
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
            }}
            placeholder="댓글 달기…"
            maxLength={1000}
            className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
          />
          <button
            onClick={submit}
            disabled={!commentText.trim() || sending}
            className="rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            등록
          </button>
        </div>
      </div>
    </div>
  )
}
