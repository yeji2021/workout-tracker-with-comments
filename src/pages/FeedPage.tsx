import { useCallback, useEffect, useRef, useState } from 'react'
import { useProfile } from '../context/ProfileContext'
import {
  addComment,
  addReaction,
  deleteComment,
  fetchFeed,
  removeReaction,
  subscribeFeed,
  type FeedItem,
} from '../lib/feed'
import { todayISO } from '../lib/workouts'
import { markFeedSeen } from '../lib/feedUnread'
import { FeedCard } from '../components/FeedCard'

export function FeedPage() {
  const { profile } = useProfile()
  const today = todayISO()
  const [items, setItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!profile) return
    const f = await fetchFeed(profile.profile_id)
    setItems(f)
    markFeedSeen() // 피드를 봤으므로 안읽음 해제
  }, [profile])

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    setLoading(true)
    fetchFeed(profile.profile_id)
      .then((f) => {
        if (!cancelled) {
          setItems(f)
          markFeedSeen()
        }
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [profile])

  // Realtime: 리액션/댓글 변경 시 새로고침 (연속 이벤트는 debounce)
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const unsub = subscribeFeed(() => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => refreshRef.current(), 300)
    }, 'feed-page')
    return () => {
      if (timer) clearTimeout(timer)
      unsub()
    }
  }, [])

  async function toggleReaction(item: FeedItem, emoji: string) {
    if (!profile) return
    const pid = profile.profile_id
    const mine = item.reactions.some(
      (r) => r.emoji === emoji && r.user_id === pid,
    )
    // 낙관적 업데이트 (즉시 반영)
    setItems((prev) =>
      prev.map((it) =>
        it.session_id !== item.session_id
          ? it
          : {
              ...it,
              reactions: mine
                ? it.reactions.filter(
                    (r) => !(r.emoji === emoji && r.user_id === pid),
                  )
                : [
                    ...it.reactions,
                    { id: 'temp', emoji, user_id: pid, nickname: profile.nickname },
                  ],
            },
      ),
    )
    try {
      if (mine) await removeReaction(item.session_id, pid, emoji)
      else await addReaction(item.session_id, pid, emoji)
    } catch {
      refresh() // 실패 시 서버 상태로 되돌림
    }
  }

  async function submitComment(item: FeedItem, text: string) {
    if (!profile) return
    await addComment(item.session_id, profile.profile_id, text)
    await refresh()
  }

  async function removeComment(commentId: string) {
    await deleteComment(commentId)
    refresh()
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-dim)]">
        불러오는 중…
      </div>
    )
  }

  return (
    <div className="px-4 py-5">
      <h1 className="mb-1 text-2xl font-bold">피드</h1>
      <p className="mb-4 text-xs text-[var(--color-text-dim)]">
        그룹 친구들이 공유한 운동이에요. 오늘 운동에서 “피드에 공유”를 누르면
        여기에 올라와요.
      </p>

      {items.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-4 text-center">
          <div className="text-5xl">💬</div>
          <p className="text-sm text-[var(--color-text-dim)]">
            아직 공유된 운동이 없어요.
          </p>
        </div>
      ) : (
        items.map((item) => (
          <FeedCard
            key={item.session_id}
            item={item}
            myProfileId={profile!.profile_id}
            today={today}
            onToggleReaction={(emoji) => toggleReaction(item, emoji)}
            onAddComment={(text) => submitComment(item, text)}
            onDeleteComment={(cid) => removeComment(cid)}
          />
        ))
      )}
    </div>
  )
}
