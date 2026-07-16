// "지금 운동 중" 라이브 + 실시간 응원의 공용 타입/채널명.
// 스키마 변경 없이 Supabase Realtime의 presence(누가 접속해 있나)와
// broadcast(휘발성 메시지)만 사용한다.
//
// 주의: supabase-js 채널은 인스턴스당 subscribe()를 한 번만 허용하고,
// 같은 topic을 중복 구독하면 안 된다. 그래서 채널 생성/구독은 전부
// LiveContext(앱 전역, 그룹당 채널 1개)에서만 하고, 화면들은 컨텍스트를
// 통해 송수신한다.

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

export function liveChannelName(groupId: string): string {
  return `live:group:${groupId}`
}
