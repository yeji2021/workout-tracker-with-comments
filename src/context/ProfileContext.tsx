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
  // 그룹 생성/참여/탈퇴 후 groups 목록을 서버에서 다시 읽어옴
  refreshProfile: () => Promise<void>
}

const ProfileContext = createContext<ProfileContextValue | undefined>(undefined)

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfileState] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    // 오프라인 우선: 캐시를 네트워크보다 먼저 동기적으로 읽어 즉시 화면을 띄운다.
    // (모바일/PWA에서 getSession()이 멈춰도 재방문 사용자가 로더에 갇히지 않도록)
    let cached = loadCachedProfile()
    // Phase 8 멀티그룹 마이그레이션 이전의 캐시(groups 배열 없음)는 폐기.
    if (cached && !Array.isArray(cached.groups)) cached = null
    if (cached) {
      setProfileState(cached)
      setLoading(false)
    }

    ;(async () => {
      try {
        // 익명 세션과 캐시는 같은 localStorage에 있으므로 보통 함께 유효하다.
        await ensureAnonSession()
        // 캐시가 없거나 폐기된 경우에만 서버에서 조용히 복구(재온보딩 회피).
        if (!cached) {
          const restored = await restoreProfileFromSession()
          if (!cancelled) setProfileState(restored)
        }
      } catch (e) {
        // 캐시로 이미 화면을 띄운 상태라면 백그라운드 갱신 실패는 조용히 무시한다.
        if (!cancelled && !cached)
          setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function refreshProfile() {
    const p = await restoreProfileFromSession()
    if (p) setProfileState(p)
  }

  return (
    <ProfileContext.Provider
      value={{ profile, loading, error, setProfile: setProfileState, refreshProfile }}
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
