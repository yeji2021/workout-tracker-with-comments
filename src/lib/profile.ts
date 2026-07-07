import { supabase } from './supabase'
import type { Profile } from './types'

const CACHE_KEY = 'wt_profile'

// ── 로컬 캐시 (Supabase 익명 세션과 함께 localStorage에 상주) ───────────
// 세션과 캐시는 같은 localStorage에 있어 함께 살고 함께 지워진다.
export function loadCachedProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as Profile) : null
  } catch {
    return null
  }
}

function cacheProfile(p: Profile) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(p))
}

export function clearCachedProfile() {
  localStorage.removeItem(CACHE_KEY)
}

// ── 익명 세션 보장 ──────────────────────────────────────────────────
export async function ensureAnonSession(): Promise<void> {
  const { data } = await supabase.auth.getSession()
  if (!data.session) {
    const { error } = await supabase.auth.signInAnonymously()
    if (error) {
      throw new Error(
        '익명 로그인에 실패했어요. Supabase에서 Anonymous sign-ins이 켜져 있는지 확인해주세요. (' +
          error.message +
          ')',
      )
    }
  }
}

// 로컬 캐시가 지워졌어도 익명 세션이 살아있으면 내 프로필을 조용히 복구.
// 이 세션에 연결된 프로필이 없으면 null (신규 사용자 → 온보딩으로 진행).
export async function restoreProfileFromSession(): Promise<Profile | null> {
  const { data, error } = await supabase.rpc('get_my_profile')
  if (error) return null
  if (!data) return null
  const profile = data as Profile
  cacheProfile(profile)
  return profile
}

// ── 체중 (칼로리 추정용, 선택 입력) ──────────────────────────────────
// 마이그레이션(profiles.weight_kg) 미적용 시 조용히 null로 폴백.
export async function getMyWeightKg(profileId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('weight_kg')
    .eq('id', profileId)
    .single()
  if (error) return null
  return (data?.weight_kg as number | null) ?? null
}

export async function setMyWeightKg(
  profileId: string,
  weightKg: number,
): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ weight_kg: weightKg })
    .eq('id', profileId)
  if (error) throw error
}

// RPC 에러 코드를 한국어 메시지로
const ERROR_MESSAGES: Record<string, string> = {
  AUTH_REQUIRED: '세션이 만료됐어요. 새로고침 후 다시 시도해주세요.',
  PROFILE_EXISTS: '이미 프로필이 있어요. 복구 코드로 복구해주세요.',
  INVALID_INVITE_CODE: '초대코드를 찾을 수 없어요. 코드를 확인해주세요.',
  NICKNAME_TAKEN: '이미 사용 중인 닉네임이에요. 다른 닉네임을 써주세요.',
  INVALID_RECOVERY_CODE: '복구 코드를 찾을 수 없어요. 코드를 확인해주세요.',
  ALREADY_LINKED: '이 기기는 이미 다른 프로필에 연결돼 있어요.',
}

function humanizeRpcError(message: string): string {
  for (const code of Object.keys(ERROR_MESSAGES)) {
    if (message.includes(code)) return ERROR_MESSAGES[code]
  }
  return message
}

// ── 온보딩/복구 RPC 래퍼 ────────────────────────────────────────────
export async function createGroupAndJoin(nickname: string): Promise<Profile> {
  await ensureAnonSession()
  const { data, error } = await supabase.rpc('create_group_and_join', {
    p_nickname: nickname,
  })
  if (error) throw new Error(humanizeRpcError(error.message))
  const profile = data as Profile
  cacheProfile(profile)
  return profile
}

export async function joinGroup(
  inviteCode: string,
  nickname: string,
): Promise<Profile> {
  await ensureAnonSession()
  const { data, error } = await supabase.rpc('join_group', {
    p_invite_code: inviteCode,
    p_nickname: nickname,
  })
  if (error) throw new Error(humanizeRpcError(error.message))
  const profile = data as Profile
  cacheProfile(profile)
  return profile
}

export async function recoverProfile(recoveryCode: string): Promise<Profile> {
  await ensureAnonSession()
  const { data, error } = await supabase.rpc('recover_profile', {
    p_recovery_code: recoveryCode,
  })
  if (error) throw new Error(humanizeRpcError(error.message))
  const profile = data as Profile
  cacheProfile(profile)
  return profile
}
