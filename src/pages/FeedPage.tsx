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
import { GroupManageSheet } from '../components/GroupManageSheet'
import { WeeklyRecapCard } from '../components/WeeklyRecapCard'
import { LiveBar } from '../components/LiveBar'

export function FeedPage() {
  const { profile, refreshProfile } = useProfile()
  const today = todayISO()
  const [activeGroup, setActiveGroup] = useState<string | 'all'>('all')
  const [items, setItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [manageOpen, setManageOpen] = useState(false)

  const groups = profile?.groups ?? []
  // 그룹이 1개면 탭 없이 그 그룹이 곧 피드 — 라이브 바/주간 리캡도 그 그룹 기준.
  const feedGroup: string | 'all' =
    groups.length === 1 ? groups[0].group_id : activeGroup

  // 탈퇴 등으로 활성 탭 그룹이 사라졌으면 '전체'로 복귀
  useEffect(() => {
    if (activeGroup !== 'all' && !groups.some((g) => g.group_id === activeGroup)) {
      setActiveGroup('all')
    }
  }, [groups, activeGroup])

  const refresh = useCallback(async () => {
    if (!profile) return
    const f = await fetchFeed(profile.profile_id, feedGroup)
    setItems(f)
    markFeedSeen() // 피드를 봤으므로 안읽음 해제
  }, [profile, feedGroup])

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    setLoading(true)
    fetchFeed(profile.profile_id, feedGroup)
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
  }, [profile, feedGroup])

  // Realtime: 리액션/댓글/새 공유 변경 시 새로고침 (연속 이벤트는 debounce)
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
        it.share_id !== item.share_id
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
      if (mine) await removeReaction(item.share_id, pid, emoji)
      else await addReaction(item.share_id, pid, emoji)
    } catch {
      refresh() // 실패 시 서버 상태로 되돌림
    }
  }

  async function submitComment(item: FeedItem, text: string) {
    if (!profile) return
    await addComment(item.share_id, profile.profile_id, text)
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
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-bold">피드</h1>
        <button
          onClick={() => setManageOpen(true)}
          className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs font-semibold text-[var(--color-text-dim)]"
        >
          내 그룹 관리
        </button>
      </div>
      <p className="mb-4 text-xs text-[var(--color-text-dim)]">
        그룹 친구들이 공유한 운동이에요. 운동 완료 후 “피드에 공유”를 누르면
        여기에 올라와요.
      </p>

      {/* 그룹 탭 (2개 이상일 때만) */}
      {groups.length > 1 && (
        <div className="mb-4 flex gap-1.5 overflow-x-auto">
          <TabButton
            active={activeGroup === 'all'}
            onClick={() => setActiveGroup('all')}
          >
            전체
          </TabButton>
          {groups.map((g) => (
            <TabButton
              key={g.group_id}
              active={activeGroup === g.group_id}
              onClick={() => setActiveGroup(g.group_id)}
            >
              {g.name}
            </TabButton>
          ))}
        </div>
      )}

      {feedGroup !== 'all' && profile && (
        <LiveBar
          groupId={feedGroup}
          myProfileId={profile.profile_id}
          myNickname={profile.nickname}
        />
      )}
      {feedGroup !== 'all' && <WeeklyRecapCard groupId={feedGroup} />}

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
            key={item.share_id}
            item={item}
            myProfileId={profile!.profile_id}
            today={today}
            showGroupBadge={activeGroup === 'all' && groups.length > 1}
            onToggleReaction={(emoji) => toggleReaction(item, emoji)}
            onAddComment={(text) => submitComment(item, text)}
            onDeleteComment={(cid) => removeComment(cid)}
          />
        ))
      )}

      {manageOpen && (
        <GroupManageSheet
          groups={groups}
          onClose={() => setManageOpen(false)}
          onChanged={refreshProfile}
        />
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={
        'shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ' +
        (active
          ? 'bg-[var(--color-accent)] text-white'
          : 'border border-[var(--color-border)] text-[var(--color-text-dim)]')
      }
    >
      {children}
    </button>
  )
}
