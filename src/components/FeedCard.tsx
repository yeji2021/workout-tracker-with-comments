import { useMemo, useState } from 'react'
import { FEED_EMOJIS, type FeedItem } from '../lib/feed'
import { fmtVolume } from '../lib/format'
import { BodyHeatmap } from './BodyHeatmap'
import { StreakAvatar } from './StreakAvatar'

const VISIBLE_EXERCISES = 4

function relativeDate(iso: string, today: string): string {
  if (iso === today) return '오늘'
  return iso.slice(5).replace('-', '/')
}

export function FeedCard({
  item,
  myProfileId,
  today,
  showGroupBadge,
  onToggleReaction,
  onAddComment,
  onDeleteComment,
}: {
  item: FeedItem
  myProfileId: string
  today: string
  showGroupBadge: boolean
  onToggleReaction: (emoji: string) => void
  onAddComment: (text: string) => Promise<void>
  onDeleteComment: (commentId: string) => void
}) {
  const [commentText, setCommentText] = useState('')
  const [sending, setSending] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [showAllExercises, setShowAllExercises] = useState(false)

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
        <StreakAvatar nickname={item.nickname} streak={item.streak} />
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
            {showGroupBadge && (
              <span className="ml-1.5 rounded-full bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px]">
                {item.group_name}
              </span>
            )}
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

      {/* 자동 하이라이트 타이틀 + 멘트 */}
      {item.highlights?.title && (
        <div className="mb-1.5 text-sm font-bold">{item.highlights.title}</div>
      )}
      {item.message && (
        <div className="mb-2 text-sm italic text-[var(--color-text-dim)]">
          “{item.message}”
        </div>
      )}

      {/* 운동 요약 (좌: 세로 리스트) + 미니 바디 히트맵 (우: 고정폭) */}
      <div className="mb-3 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {item.exercises.length === 0 ? (
            <span className="text-xs text-[var(--color-text-dim)]">운동 없음</span>
          ) : (
            <ul className="flex flex-col gap-1">
              {(showAllExercises
                ? item.exercises
                : item.exercises.slice(0, VISIBLE_EXERCISES)
              ).map((e, i) => (
                <li key={i} className="truncate text-xs">
                  {e.name}
                  {e.setCount > 0 && (
                    <span className="text-[var(--color-text-dim)]">
                      {' '}
                      {e.setCount}세트
                    </span>
                  )}
                </li>
              ))}
              {!showAllExercises && item.exercises.length > VISIBLE_EXERCISES && (
                <li>
                  <button
                    onClick={() => setShowAllExercises(true)}
                    className="text-xs text-[var(--color-text-dim)] underline"
                  >
                    +{item.exercises.length - VISIBLE_EXERCISES}개 더보기
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>
        {item.volume > 0 && (
          <BodyHeatmap data={item.muscleVolume} variant="mini" />
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
