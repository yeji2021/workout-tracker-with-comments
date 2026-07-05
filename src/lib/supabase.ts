import { createClient } from '@supabase/supabase-js'

// 클라이언트에서 사용하는 값만 읽는다. secret key는 절대 여기서 참조하지 않는다.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as
  | string
  | undefined

if (!url || !publishableKey) {
  // 개발 중 키 누락을 빨리 알아차리기 위한 가드
  throw new Error(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY 가 .env.local 에 설정되어야 합니다.',
  )
}

export const supabase = createClient(url, publishableKey, {
  auth: {
    // 완전한 로그인 시스템이 아니라 닉네임+초대코드 기반이므로
    // Supabase 세션은 로컬에 유지만 하고 자동 갱신한다.
    persistSession: true,
    autoRefreshToken: true,
  },
})
