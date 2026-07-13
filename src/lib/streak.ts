import { supabase } from './supabase'
import { computeStreak } from './stats'
import { todayISO } from './workouts'

// 운동한 날짜 목록으로 스트릭을 계산해 profiles.streak_count/streak_date에 저장.
// 그룹 피드 아바타에 표시하려면 다른 멤버가 이 값을 읽을 수 있어야 하는데,
// RLS상 남의 세션 날짜는 조회할 수 없으므로 본인이 계산해 스냅샷으로 남긴다.
// 마이그레이션(04-streak.sql) 미적용 시 조용히 무시한다.
export async function syncStreak(
  profileId: string,
  loggedDates: string[],
): Promise<number> {
  const today = todayISO()
  const streak = computeStreak(loggedDates, today)
  // upsert 대상 컬럼이 없어도(마이그레이션 미적용) supabase-js는 throw하지 않고
  // {error}만 반환하므로, restPrefs.ts와 동일하게 결과를 그냥 무시한다.
  await supabase
    .from('profiles')
    .update({ streak_count: streak, streak_date: today })
    .eq('id', profileId)
  return streak
}
