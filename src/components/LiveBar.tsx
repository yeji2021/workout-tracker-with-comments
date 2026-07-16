import { useState } from 'react'
import { FEED_EMOJIS } from '../lib/feed'
import type { LiveMember } from '../lib/live'
import { useLive } from '../context/LiveContext'
import { ElapsedTimer } from './ElapsedTimer'

// 현재 그룹에서 운동 중인 멤버 가로 스크롤 바 + 탭하면 응원 이모지 보내기.
// 목록/응원 모두 LiveContext의 그룹 채널을 공유한다 (topic 중복 구독 방지).
export function LiveBar({
  groupId,
  myProfileId,
  myNickname,
}: {
  groupId: string
  myProfileId: string
  myNickname: string
}) {
  const { membersByGroup, sendCheer } = useLive()
  const [target, setTarget] = useState<LiveMember | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  const members = membersByGroup[groupId] ?? []
  const others = members.filter((m) => m.profile_id !== myProfileId)
  if (others.length === 0) return null

  function cheer(emoji: string) {
    if (!target) return
    sendCheer(groupId, {
      to: target.profile_id,
      from_nickname: myNickname,
      emoji,
    })
    setSentTo(target.profile_id)
    setTarget(null)
    setTimeout(() => setSentTo(null), 2000)
  }

  return (
    <div className="mb-4 flex gap-2 overflow-x-auto">
      {others.map((m) => (
        <button
          key={m.profile_id}
          onClick={() => setTarget(m)}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--color-accent)] bg-[var(--color-accent-soft)]/20 px-3 py-1.5 text-xs font-semibold"
        >
          💪 {m.nickname} <ElapsedTimer startedAt={m.started_at} />
          {sentTo === m.profile_id && <span>✅</span>}
        </button>
      ))}

      {target && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
          onClick={() => setTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
            style={{ paddingBottom: 'calc(var(--safe-bottom) + 1.25rem)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-4 text-lg font-bold">{target.nickname}님 응원하기</h2>
            <div className="flex justify-center gap-3">
              {FEED_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => cheer(emoji)}
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-surface-2)] text-2xl"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
