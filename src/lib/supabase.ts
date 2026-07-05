import { createClient } from '@supabase/supabase-js'

// 클라이언트에서 사용하는 값만 읽는다. anon 키는 공개용이며 RLS가 보안을 담당한다.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!url || !anonKey) {
  // 개발 중 키 누락을 빨리 알아차리기 위한 가드
  throw new Error(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 가 .env.local 에 설정되어야 합니다.',
  )
}

export const supabase = createClient(url, anonKey, {
  auth: {
    // 완전한 로그인 시스템이 아니라 닉네임+초대코드 기반이므로
    // 익명 세션을 로컬에 유지하고 자동 갱신한다.
    persistSession: true,
    autoRefreshToken: true,
  },
})
