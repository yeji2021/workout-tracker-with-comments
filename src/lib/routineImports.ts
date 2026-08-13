import { supabase } from './supabase'
import { createRoutine } from './routines'
import { addCustomExercise, listExercises } from './workouts'
import { normalizeExerciseName } from './exerciseMatch'
import { MUSCLE_GROUPS } from './types'
import type {
  ExtractedRoutine,
  ImportPlatform,
  MuscleGroup,
  Routine,
  RoutineImport,
} from './types'

const IMPORT_SELECT =
  'id,profile_id,url,platform,user_note,status,source_text,used_video,result,error,created_at,processed_at'

// 미매칭 운동을 커스텀으로 만들 때, 추출된 부위가 없거나 이상할 때의 기본값.
// 특정 부위로 몰아넣으면 통계가 왜곡되므로 중립적인 '코어'로 둔다.
const FALLBACK_MUSCLE_GROUP: MuscleGroup = '코어'

// ── URL → 플랫폼 판별 ───────────────────────────────────────────────
// http(s) URL 이 아니면 던진다. 인스타/유튜브가 아닌 정상 링크는 'other'.
// 던지는 메시지는 그대로 사용자에게 보여줘도 되는 한국어 문구다.
export function detectPlatform(url: string): ImportPlatform {
  let parsed: URL
  try {
    parsed = new URL(url.trim())
  } catch {
    throw new Error('링크 형식이 올바르지 않아요. 주소를 다시 확인해 주세요.')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('링크 형식이 올바르지 않아요. 주소를 다시 확인해 주세요.')
  }
  // www./m. 같은 서브도메인까지 포함해 뒤에서부터 맞춘다
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
  const isHost = (domain: string) => host === domain || host.endsWith(`.${domain}`)

  if (isHost('instagram.com') || isHost('instagr.am') || isHost('cdninstagram.com')) {
    return 'instagram'
  }
  if (isHost('youtube.com') || isHost('youtu.be') || isHost('youtube-nocookie.com')) {
    return 'youtube'
  }
  return 'other'
}

// ── 목록 (최신순) ───────────────────────────────────────────────────
export async function listImports(profileId: string): Promise<RoutineImport[]> {
  const { data, error } = await supabase
    .from('routine_imports')
    .select(IMPORT_SELECT)
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as RoutineImport[]
}

// ── 단건 조회 (미리보기 화면에서 새로고침할 때) ─────────────────────
export async function getImport(id: string): Promise<RoutineImport | null> {
  const { data, error } = await supabase
    .from('routine_imports')
    .select(IMPORT_SELECT)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data ? (data as unknown as RoutineImport) : null
}

// ── 등록 (큐에 쌓기) ────────────────────────────────────────────────
// platform 은 여기서 URL 패턴으로 채운다. status 는 DB 기본값('queued') 사용.
export async function createImport(
  profileId: string,
  url: string,
  userNote?: string,
): Promise<RoutineImport> {
  const trimmedUrl = url.trim()
  const platform = detectPlatform(trimmedUrl) // 잘못된 URL 이면 여기서 던진다
  const note = userNote?.trim()
  const { data, error } = await supabase
    .from('routine_imports')
    .insert({
      profile_id: profileId,
      url: trimmedUrl,
      platform,
      user_note: note ? note : null,
    })
    .select(IMPORT_SELECT)
    .single()
  if (error) throw error
  return data as unknown as RoutineImport
}

// ── 삭제 (queued 취소 / done·failed 정리) ───────────────────────────
// processing 행은 RLS 가 막는다 — 삭제된 행이 0건이어도 에러는 나지 않으므로
// 호출부는 삭제 후 목록을 다시 읽어 확인하는 편이 안전하다.
export async function deleteImport(id: string): Promise<void> {
  const { error } = await supabase.from('routine_imports').delete().eq('id', id)
  if (error) throw error
}

// ── 추출 결과 → 내 루틴으로 저장 ────────────────────────────────────
// 미매칭 운동(matched_exercise_id === null)은 먼저 exercises 로 만들어야
// routine_entries 가 참조할 수 있다. 순서:
//   1) 내가 볼 수 있는 운동 목록을 한 번 읽어 이름으로 재매칭 시도
//      (예전에 같은 이름으로 만들어 둔 커스텀 운동이 있으면 재사용 — 중복 방지)
//   2) 그래도 없으면 커스텀 운동 생성 (같은 이름이 여러 번 나와도 1회만)
//   3) 확보한 exercise_id 배열로 기존 createRoutine 재사용
//
// 주의: routine_entries 스키마에는 세트/횟수 컬럼이 없다. extracted 의
// sets/reps/notes 는 저장되지 않고, 실제 세트는 루틴을 오늘 운동에 적용할 때
// 지난 기록에서 채워진다 (routines.applyRoutineToToday).
export async function saveAsRoutine(
  profileId: string,
  extracted: ExtractedRoutine,
): Promise<Routine> {
  const items = extracted.exercises.filter((e) => e.name.trim() !== '')
  if (items.length === 0) {
    throw new Error('저장할 운동이 없어요. 운동을 하나 이상 남겨 주세요.')
  }

  // 이름 재매칭용 사전. 정규화 규칙은 exerciseMatch 와 반드시 같아야 한다 —
  // 여기서만 규칙이 약하면 처리 세션이 못 맞춘 "Incline DB Press" 가 이미 갖고 있는
  // "인클라인 덤벨 프레스" 와도 안 붙어서 커스텀 운동이 중복 생성된다.
  const normalize = normalizeExerciseName
  const needsLookup = items.some((e) => !e.matched_exercise_id)
  const idByName = new Map<string, string>()
  if (needsLookup) {
    for (const ex of await listExercises()) {
      // 먼저 나온 것을 우선 (listExercises 는 이름순이라 결과가 안정적)
      if (!idByName.has(normalize(ex.name))) idByName.set(normalize(ex.name), ex.id)
    }
  }

  const exerciseIds: string[] = []
  for (const item of items) {
    if (item.matched_exercise_id) {
      exerciseIds.push(item.matched_exercise_id)
      continue
    }
    const key = normalize(item.name)
    const known = idByName.get(key)
    if (known) {
      exerciseIds.push(known)
      continue
    }
    const primary =
      item.target && MUSCLE_GROUPS.includes(item.target)
        ? item.target
        : FALLBACK_MUSCLE_GROUP
    const created = await addCustomExercise(
      item.name.trim(),
      primary,
      null,
      profileId,
    )
    idByName.set(key, created.id) // 같은 루틴 안 중복 이름은 한 번만 만든다
    exerciseIds.push(created.id)
  }

  const name = extracted.routine_name.trim() || '가져온 루틴'
  // 릴스 추출 결과에는 묶음 개념이 없다 — 전부 단독 운동으로 저장한다.
  return createRoutine(
    profileId,
    name,
    exerciseIds.map((exercise_id) => ({
      exercise_id,
      superset_id: null,
      superset_name: null,
      superset_rest_seconds: null,
      default_rounds: null,
    })),
  )
}

// ── Realtime 구독 (관리자가 처리를 끝내면 목록/뱃지 갱신) ────────────
// channelName 은 구독마다 고유해야 한다 (feed.ts subscribeFeed 와 같은 규칙).
export function subscribeImports(
  profileId: string,
  onChange: () => void,
  channelName = 'routine-imports',
): () => void {
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'routine_imports',
        filter: `profile_id=eq.${profileId}`,
      },
      onChange,
    )
    .subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}
