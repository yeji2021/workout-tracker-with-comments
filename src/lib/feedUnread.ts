import { useEffect, useId, useState } from 'react'
import { supabase } from './supabase'
import { subscribeFeed } from './feed'

const SEEN_KEY = 'wt_feed_seen_at'

function getLastSeen(): string {
  return localStorage.getItem(SEEN_KEY) ?? '1970-01-01T00:00:00Z'
}

// 피드를 봤을 때 호출 → 안읽음 기준시각 갱신 + 탭 뱃지에 알림
export function markFeedSeen() {
  localStorage.setItem(SEEN_KEY, new Date().toISOString())
  window.dispatchEvent(new Event('feed-seen'))
}

// 마지막으로 본 이후, 남이 남긴 리액션/댓글이 있는지 (RLS로 내 그룹 공유분만 조회됨)
export async function fetchFeedUnread(profileId: string): Promise<boolean> {
  const since = getLastSeen()
  const [c, r] = await Promise.all([
    supabase
      .from('comments')
      .select('id', { count: 'exact', head: true })
      .gt('created_at', since)
      .neq('user_id', profileId),
    supabase
      .from('reactions')
      .select('id', { count: 'exact', head: true })
      .gt('created_at', since)
      .neq('user_id', profileId),
  ])
  return (c.count ?? 0) + (r.count ?? 0) > 0
}

// 피드 안읽음 여부 훅 (탭 뱃지·홈 대시보드 등에서 사용). 실시간으로 갱신됨.
// 여러 곳에서 동시에 써도 되도록 실시간 채널명을 인스턴스별로 고유하게 만든다
// (subscribeFeed는 채널명이 중복되면 두 번째 구독에서 예외를 던진다).
export function useFeedUnread(profileId: string | undefined): boolean {
  const [unread, setUnread] = useState(false)
  const channelName = `feed-badge-${useId()}`
  useEffect(() => {
    if (!profileId) return
    let cancelled = false
    const check = () =>
      fetchFeedUnread(profileId)
        .then((u) => !cancelled && setUnread(u))
        .catch(() => {})
    check()
    const unsub = subscribeFeed(check, channelName)
    const onSeen = () => setUnread(false)
    window.addEventListener('feed-seen', onSeen)
    return () => {
      cancelled = true
      unsub()
      window.removeEventListener('feed-seen', onSeen)
    }
  }, [profileId, channelName])
  return unread
}
