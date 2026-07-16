import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { liveChannelName, type Cheer, type LiveMember } from '../lib/live'
import { useProfile } from './ProfileContext'

// 앱 전역에서 내 그룹들의 live 채널(live:group:{id})을 그룹당 1개씩만 유지한다.
// supabase-js는 같은 topic 중복 구독이 안전하지 않아서, 채널이 필요한 화면들
// (피드 라이브 바, 운동 중 presence/응원, 운동 시작 팝업)이 전부 이 컨텍스트를
// 공유한다.
//
// - membersByGroup: 그룹별 "지금 운동 중" 멤버 목록 (presence sync)
// - startAlert: 다른 멤버가 방금 운동을 시작함 → 전역 팝업용 (presence join)
// - trackWorkout/untrackWorkout: 내 운동 시작~완료 동안 presence 등록 (LogPage)
// - onCheer: 나에게 온 응원 broadcast 수신 등록 (LogPage)
// - sendCheer: 응원 보내기 (LiveBar)

export interface LiveStart {
  member: LiveMember
  groupId: string
}

interface LiveContextValue {
  membersByGroup: Record<string, LiveMember[]>
  startAlert: LiveStart | null
  dismissStartAlert: () => void
  sendCheer: (groupId: string, cheer: Cheer) => void
  trackWorkout: (me: LiveMember) => void
  untrackWorkout: () => void
  onCheer: (handler: (cheer: Cheer) => void) => () => void
}

const LiveContext = createContext<LiveContextValue | undefined>(undefined)

// 운동 시작 1건의 고유 키. 같은 시작(재접속으로 join이 다시 와도)은 한 번만 알린다.
function startKey(m: LiveMember): string {
  return `${m.profile_id}:${m.started_at}`
}

export function LiveProvider({ children }: { children: ReactNode }) {
  const { profile } = useProfile()
  const [membersByGroup, setMembersByGroup] = useState<
    Record<string, LiveMember[]>
  >({})
  const [startAlert, setStartAlert] = useState<LiveStart | null>(null)

  const channelsRef = useRef<Map<string, RealtimeChannel>>(new Map())
  // 운동 중이면 내 presence 정보. 채널이 늦게 SUBSCRIBED 되어도 track되도록 보관.
  const trackedRef = useRef<LiveMember | null>(null)
  const cheerHandlerRef = useRef<((cheer: Cheer) => void) | null>(null)
  // 이미 알렸거나(또는 첫 sync에 이미 운동 중이던) 시작 건들
  const seenStartsRef = useRef<Set<string>>(new Set())

  const myId = profile?.profile_id
  // 그룹 가입/탈퇴 시에만 채널을 다시 만들도록 id 목록을 문자열 키로 축약
  const groupKey = (profile?.groups ?? []).map((g) => g.group_id).join(',')

  useEffect(() => {
    if (!myId || !groupKey) return
    const channels = new Map<string, RealtimeChannel>()

    for (const gid of groupKey.split(',')) {
      let synced = false
      const channel = supabase.channel(liveChannelName(gid), {
        config: { presence: { key: myId } },
      })
      // 리스너는 subscribe() 전에 붙여야 안전하다.
      channel.on('presence', { event: 'sync' }, () => {
        // 같은 사람이 두 기기/탭으로 접속하면 한 key에 meta가 여러 개 온다 → 1개만
        const members = [
          ...new Map(
            Object.values(channel.presenceState<LiveMember>())
              .flat()
              .map((m) => [m.profile_id, m]),
          ).values(),
        ]
        // 첫 sync에 이미 운동 중이던 멤버는 "방금 시작"이 아니므로 알림 없이 기록만
        if (!synced) {
          synced = true
          members.forEach((m) => seenStartsRef.current.add(startKey(m)))
        }
        setMembersByGroup((prev) => ({ ...prev, [gid]: members }))
      })
      channel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
        if (!synced || key === myId) return
        for (const p of newPresences as unknown as LiveMember[]) {
          const k = startKey(p)
          if (seenStartsRef.current.has(k)) continue
          seenStartsRef.current.add(k)
          setStartAlert({ member: p, groupId: gid })
        }
      })
      channel.on('broadcast', { event: 'cheer' }, ({ payload }) => {
        const cheer = payload as Cheer
        if (cheer.to === myId) cheerHandlerRef.current?.(cheer)
      })
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED' && trackedRef.current) {
          channel.track(trackedRef.current)
        }
      })
      channels.set(gid, channel)
    }

    channelsRef.current = channels
    return () => {
      channels.forEach((c) => supabase.removeChannel(c))
      channelsRef.current = new Map()
      setMembersByGroup({})
    }
  }, [myId, groupKey])

  const dismissStartAlert = useCallback(() => setStartAlert(null), [])

  const sendCheer = useCallback((groupId: string, cheer: Cheer) => {
    channelsRef.current
      .get(groupId)
      ?.send({ type: 'broadcast', event: 'cheer', payload: cheer })
  }, [])

  const trackWorkout = useCallback((me: LiveMember) => {
    trackedRef.current = me
    channelsRef.current.forEach((c) => c.track(me))
  }, [])

  const untrackWorkout = useCallback(() => {
    trackedRef.current = null
    channelsRef.current.forEach((c) => c.untrack())
  }, [])

  const onCheer = useCallback((handler: (cheer: Cheer) => void) => {
    cheerHandlerRef.current = handler
    return () => {
      if (cheerHandlerRef.current === handler) cheerHandlerRef.current = null
    }
  }, [])

  const value = useMemo(
    () => ({
      membersByGroup,
      startAlert,
      dismissStartAlert,
      sendCheer,
      trackWorkout,
      untrackWorkout,
      onCheer,
    }),
    [
      membersByGroup,
      startAlert,
      dismissStartAlert,
      sendCheer,
      trackWorkout,
      untrackWorkout,
      onCheer,
    ],
  )

  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>
}

export function useLive(): LiveContextValue {
  const ctx = useContext(LiveContext)
  if (!ctx) throw new Error('useLive must be used within LiveProvider')
  return ctx
}
