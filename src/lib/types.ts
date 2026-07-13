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

export interface SessionShareRef {
  id: string
  group_id: string
}

export interface WorkoutSession {
  id: string
  user_id: string
  date: string // YYYY-MM-DD
  started_at: string | null // ISO timestamptz — 세션 최초 생성 시각(= 운동 시작)
  ended_at: string | null // ISO timestamptz — "운동 완료" 시각
  entries: WorkoutEntry[]
  shares: SessionShareRef[] // 이 세션이 공유된 그룹들 (여러 그룹에 동시 공유 가능)
}

export interface RoutineEntry {
  id: string
  routine_id: string
  exercise_id: string
  order_index: number
  exercise?: Exercise
}

export interface Routine {
  id: string
  name: string
  entries: RoutineEntry[]
}

// 한 사용자가 속한 그룹 (다대다 — profile당 여러 그룹 가능)
export interface Group {
  group_id: string
  invite_code: string
  name: string
}

// 온보딩/복구 RPC 응답 및 로컬 캐시
export interface Profile {
  profile_id: string
  nickname: string
  groups: Group[]
  recovery_code?: string // 발급 시 1회만 존재. 복구 후엔 없음
}
