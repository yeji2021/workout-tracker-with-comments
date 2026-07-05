// ── 도메인 타입 (Supabase 스키마와 1:1 대응) ──────────────────────────

export const MUSCLE_GROUPS = ['가슴', '등', '어깨', '하체', '팔', '코어'] as const
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number]

export interface Exercise {
  id: string
  name: string
  primary_muscle_group: MuscleGroup
  secondary_muscle_group: MuscleGroup | null
  is_default: boolean
  created_by: string | null
}

export interface WorkoutSet {
  id: string
  entry_id: string
  weight_kg: number | null
  reps: number
  is_completed: boolean
  order_index: number
}

export interface WorkoutEntry {
  id: string
  session_id: string
  exercise_id: string
  order_index: number
  notes: string | null
  sets: WorkoutSet[]
  // 조회 시 조인해서 채움
  exercise?: Exercise
}

export interface WorkoutSession {
  id: string
  user_id: string
  group_id: string
  date: string // YYYY-MM-DD
  is_shared: boolean
  entries: WorkoutEntry[]
}

// 온보딩/복구 RPC 응답 및 로컬 캐시
export interface Profile {
  profile_id: string
  group_id: string
  nickname: string
  invite_code: string
  recovery_code?: string // 발급 시 1회만 존재. 복구 후엔 없음
}
