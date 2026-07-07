import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { Profile } from '../lib/types'
import {
  ensureAnonSession,
  loadCachedProfile,
  restoreProfileFromSession,
} from '../lib/profile'

interface ProfileContextValue {
  profile: Profile | null
  loading: boolean
  error: string | null
  // 온보딩/복구 성공 시 호출해 상태를 갱신
  setProfile: (p: Profile) => void
}

const ProfileContext = createContext<ProfileContextValue | undefined>(undefined)

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfileState] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        // 익명 세션과 캐시는 같은 localStorage에 있으므로 보통 함께 유효하다.
        await ensureAnonSession()
        let profile = loadCachedProfile()
        // 캐시만 지워진 경우(부분 저장소 삭제, iOS ITP 등) — 세션이 살아있으면
        // 서버에서 조용히 복구해 재온보딩을 피한다.
        if (!profile) profile = await restoreProfileFromSession()
        if (!cancelled) setProfileState(profile)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <ProfileContext.Provider
      value={{ profile, loading, error, setProfile: setProfileState }}
    >
      {children}
    </ProfileContext.Provider>
  )
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider')
  return ctx
}

// 로그인된 프로필을 보장하는 헬퍼 (게이트 통과 후 사용)
export function useRequireProfile(): Profile {
  const { profile } = useProfile()
  if (!profile) throw new Error('프로필이 필요합니다 (온보딩 게이트 확인)')
  return profile
}
