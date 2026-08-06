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

// ── 릴스 투 루틴 (routine_imports) ───────────────────────────────────
// 설계: REEL-TO-ROUTINE.md / 스키마: scripts/05-routine-imports.sql
// 사용자는 링크를 큐에 쌓기만 하고, 실제 추출은 관리자 세션이 처리한다.

// DB의 status 컬럼 값. 사용자에게 보일 문구는 IMPORT_STATUS_LABEL 을 쓴다.
export type ImportStatus = 'queued' | 'processing' | 'done' | 'failed'

// 등록 시 URL 패턴으로 클라이언트가 채운다 (routineImports.detectPlatform)
export type ImportPlatform = 'instagram' | 'youtube' | 'other'

// 상태 뱃지 문구 — 화면마다 다르게 쓰지 않도록 여기 한 곳에서만 정의
export const IMPORT_STATUS_LABEL: Record<ImportStatus, string> = {
  queued: '대기중',
  processing: '처리중',
  done: '완료',
  failed: '실패',
}

// result jsonb 안의 운동 하나.
// matched_exercise_id 가 null 이면 시드 exercises 와 매칭되지 않은 운동 —
// 저장 시 커스텀 운동으로 새로 만들어진다 (routineImports.saveAsRoutine).
export interface ExtractedExercise {
  name: string
  matched_exercise_id: string | null
  target: MuscleGroup | null // 미매칭 운동을 커스텀 생성할 때의 부위 후보
  sets: number | null
  reps: string | null // "8-12", "실패까지" 같은 자유 표기라 문자열
  notes: string | null
}

// routine_imports.result 의 확정 구조 (처리 세션이 이 모양으로 써 넣는다)
export interface ExtractedRoutine {
  routine_name: string
  source_summary: string | null
  exercises: ExtractedExercise[]
}

// routine_imports 한 행
export interface RoutineImport {
  id: string
  profile_id: string
  url: string
  platform: ImportPlatform
  user_note: string | null
  status: ImportStatus
  source_text: string | null // 처리 시 읽은 캡션 (앱에서는 보통 쓰지 않음)
  used_video: boolean
  result: ExtractedRoutine | null // status==='done' 일 때만 채워진다
  error: string | null // status==='failed' 일 때의 사유. 그대로 노출해도 되는 문구
  created_at: string // ISO timestamptz
  processed_at: string | null
}
