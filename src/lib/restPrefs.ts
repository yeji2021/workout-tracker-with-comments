import { supabase } from './supabase'

export const DEFAULT_REST_SECONDS = 60
const MIN_REST = 10
const MAX_REST = 600

export function clampRest(sec: number): number {
  return Math.min(MAX_REST, Math.max(MIN_REST, Math.round(sec)))
}

// 프로필의 운동별 휴식 설정 전체를 한 번에 로드 (LogPage 진입 시 1회).
// 마이그레이션(exercise_rest_prefs)이 아직 적용되지 않았으면 조용히 빈 값으로
// 폴백해 전역 기본값(DEFAULT_REST_SECONDS)만 쓰이게 한다.
export async function listRestPrefs(
  profileId: string,
): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('exercise_rest_prefs')
    .select('exercise_id, rest_seconds')
    .eq('profile_id', profileId)
  if (error) return {}
  const map: Record<string, number> = {}
  for (const row of (data ?? []) as { exercise_id: string; rest_seconds: number }[]) {
    map[row.exercise_id] = row.rest_seconds
  }
  return map
}

// 휴식 조정(−10초 등)은 곧 그 운동의 다음 기본 휴식값 확정을 의미한다.
export async function setRestPref(
  profileId: string,
  exerciseId: string,
  restSeconds: number,
): Promise<void> {
  const value = clampRest(restSeconds)
  await supabase.from('exercise_rest_prefs').upsert(
    { profile_id: profileId, exercise_id: exerciseId, rest_seconds: value },
    { onConflict: 'profile_id,exercise_id' },
  )
}
