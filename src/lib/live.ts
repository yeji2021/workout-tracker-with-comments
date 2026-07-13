import { supabase } from './supabase'

// "지금 운동 중" 라이브 + 실시간 응원. 스키마 변경 없이 Supabase Realtime의
// presence(누가 접속해 있나)와 broadcast(휘발성 메시지)만 사용한다.
//
// 주의: supabase-js 채널은 인스턴스당 subscribe()를 한 번만 허용하고,
// 리스너(.on)는 subscribe() 전에 붙여야 안전하다. 같은 topic을 중복 구독하지
// 않도록 화면당 채널 1개를 만들고 송수신에 공용으로 쓴다.

export interface LiveMember {
  profile_id: string
  nickname: string
  started_at: string
}

export interface Cheer {
  to: string
  from_nickname: string
  emoji: string
}

function channelName(groupId: string): string {
  return `live:group:${groupId}`
}

// 운동 시작~완료 동안 내가 속한 그룹들에 "운동 중" 상태를 알리고,
// 나에게 온 응원 broadcast를 수신한다 (LogPage에서 사용).
// 반환된 함수를 호출하면 모든 채널에서 나간다 (운동 완료/페이지 이탈 시).
export function announcePresence(
  groupIds: string[],
  me: LiveMember,
  onCheer: (cheer: Cheer) => void,
): () => void {
  const channels = groupIds.map((gid) => {
    const channel = supabase.channel(channelName(gid), {
      config: { presence: { key: me.profile_id } },
    })
    channel.on('broadcast', { event: 'cheer' }, ({ payload }) => {
      const cheer = payload as Cheer
      if (cheer.to === me.profile_id) onCheer(cheer)
    })
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') channel.track(me)
    })
    return channel
  })
  return () => channels.forEach((c) => supabase.removeChannel(c))
}

// 피드 라이브 바: 그룹의 운동 중 멤버 목록을 구독하고, 같은 채널로 응원을
// 보낸다. track()을 하지 않으므로 구경만 하는 사람은 목록에 뜨지 않는다.
export function joinLiveBar(
  groupId: string,
  onMembers: (members: LiveMember[]) => void,
): { sendCheer: (cheer: Cheer) => void; leave: () => void } {
  const channel = supabase.channel(channelName(groupId))
  channel.on('presence', { event: 'sync' }, () => {
    const state = channel.presenceState<LiveMember>()
    onMembers(Object.values(state).flat())
  })
  channel.subscribe()
  return {
    sendCheer: (cheer) => {
      channel.send({ type: 'broadcast', event: 'cheer', payload: cheer })
    },
    leave: () => {
      supabase.removeChannel(channel)
    },
  }
}
