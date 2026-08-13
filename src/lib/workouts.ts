import { supabase } from './supabase'
import { isLoggedSet } from './stats'
import type {
  Exercise,
  ExerciseKind,
  MuscleGroup,
  Profile,
  RoutineEntryInput,
  WorkoutEntry,
  WorkoutSession,
  WorkoutSet,
} from './types'

const EXERCISE_COLUMNS =
  'id,name,primary_muscle_group,secondary_muscle_group,kind,is_default,created_by'

// ── 날짜 헬퍼 (로컬 기준 YYYY-MM-DD) ────────────────────────────────
export function todayISO(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// ── 운동 목록 ───────────────────────────────────────────────────────
export async function listExercises(): Promise<Exercise[]> {
  const { data, error } = await supabase
    .from('exercises')
    .select(EXERCISE_COLUMNS)
    .order('name')
  if (error) throw error
  return (data ?? []) as Exercise[]
}

// kind='time' 은 코어 운동에만 허용된다 (DB CHECK exercises_time_is_core_only).
// 호출부(ExercisePicker)에서 부위가 코어일 때만 시간 토글을 보여주므로 여기서는
// 방어적으로 한 번 더 눌러 준다 — DB 제약 위반으로 던지는 것보다 낫다.
export async function addCustomExercise(
  name: string,
  primary: MuscleGroup,
  secondary: MuscleGroup | null,
  profileId: string,
  kind: ExerciseKind = 'reps',
): Promise<Exercise> {
  const { data, error } = await supabase
    .from('exercises')
    .insert({
      name: name.trim(),
      primary_muscle_group: primary,
      secondary_muscle_group: secondary,
      kind: primary === '코어' ? kind : 'reps',
      is_default: false,
      created_by: profileId,
    })
    .select(EXERCISE_COLUMNS)
    .single()
  if (error) throw error
  return data as Exercise
}

// 내 커스텀 운동만 대상 (RLS exercises_update_own_custom / delete_own_custom —
// is_default 운동은 정책상 애초에 업데이트/삭제가 막혀 있다).
export async function updateCustomExercise(
  id: string,
  name: string,
  primary: MuscleGroup,
  kind: ExerciseKind,
): Promise<Exercise> {
  const { data, error } = await supabase
    .from('exercises')
    .update({
      name: name.trim(),
      primary_muscle_group: primary,
      kind: primary === '코어' ? kind : 'reps',
    })
    .eq('id', id)
    .select(EXERCISE_COLUMNS)
    .single()
  if (error) throw error
  return data as Exercise
}

// FK가 RESTRICT라 이미 기록/루틴에 쓰인 운동은 DB가 23503으로 거절한다 —
// 호출부에서 이 값으로 사용자에게 이유를 설명한다.
export const EXERCISE_IN_USE_ERROR = 'EXERCISE_IN_USE'

export async function deleteCustomExercise(id: string): Promise<void> {
  const { error } = await supabase.from('exercises').delete().eq('id', id)
  if (error) {
    if (error.code === '23503') throw new Error(EXERCISE_IN_USE_ERROR)
    throw error
  }
}

// ── 세션 조회/생성 ──────────────────────────────────────────────────
const SESSION_SELECT =
  'id,user_id,date,started_at,ended_at,' +
  'workout_entries(id,session_id,exercise_id,order_index,notes,' +
  'superset_id,superset_name,superset_rest_seconds,' +
  'sets(id,entry_id,weight_kg,reps,duration_seconds,is_completed,order_index),' +
  `exercises(${EXERCISE_COLUMNS})),` +
  'session_shares(id,group_id)'

// PostgREST 중첩 응답을 도메인 타입으로 정리 (정렬 포함)
function mapSession(row: Record<string, unknown>): WorkoutSession {
  const entriesRaw = (row.workout_entries as Record<string, unknown>[]) ?? []
  const entries: WorkoutEntry[] = entriesRaw
    .map((e) => {
      const setsRaw = (e.sets as WorkoutSet[]) ?? []
      const sets = [...setsRaw].sort((a, b) => a.order_index - b.order_index)
      return {
        id: e.id as string,
        session_id: e.session_id as string,
        exercise_id: e.exercise_id as string,
        order_index: e.order_index as number,
        notes: (e.notes as string | null) ?? null,
        superset_id: (e.superset_id as string | null) ?? null,
        superset_name: (e.superset_name as string | null) ?? null,
        superset_rest_seconds: (e.superset_rest_seconds as number | null) ?? null,
        sets,
        exercise: (e.exercises as Exercise) ?? undefined,
      }
    })
    .sort((a, b) => a.order_index - b.order_index)

  const sharesRaw = (row.session_shares as Record<string, unknown>[]) ?? []

  return {
    id: row.id as string,
    user_id: row.user_id as string,
    date: row.date as string,
    started_at: (row.started_at as string | null) ?? null,
    ended_at: (row.ended_at as string | null) ?? null,
    entries,
    shares: sharesRaw.map((s) => ({
      id: s.id as string,
      group_id: s.group_id as string,
    })),
  }
}

export async function getSessionByDate(
  profileId: string,
  date: string,
): Promise<WorkoutSession | null> {
  const { data, error } = await supabase
    .from('workout_sessions')
    .select(SESSION_SELECT)
    .eq('user_id', profileId)
    .eq('date', date)
    .maybeSingle()
  if (error) throw error
  return data ? mapSession(data as unknown as Record<string, unknown>) : null
}

export async function createSession(
  profile: Profile,
  date: string,
): Promise<WorkoutSession> {
  const { data, error } = await supabase
    .from('workout_sessions')
    .insert({
      user_id: profile.profile_id,
      date,
      started_at: new Date().toISOString(), // 세션 최초 생성 = 운동 시작
    })
    .select(SESSION_SELECT)
    .single()
  if (error) throw error
  return mapSession(data as unknown as Record<string, unknown>)
}

// "운동 완료" — 종료 시각을 기록해 소요시간/칼로리 계산의 기준이 된다.
export async function endSession(sessionId: string): Promise<string> {
  const endedAt = new Date().toISOString()
  const { error } = await supabase
    .from('workout_sessions')
    .update({ ended_at: endedAt })
    .eq('id', sessionId)
  if (error) throw error
  return endedAt
}

export async function deleteSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('workout_sessions')
    .delete()
    .eq('id', sessionId)
  if (error) throw error
}

// ── 기록 탭(캘린더/상세)용 세션 개요 ────────────────────────────────
export interface SessionOverview {
  id: string
  date: string
  started_at: string | null
  ended_at: string | null
  exerciseCount: number
  setCount: number
  volume: number
}

// 전체 세션의 가벼운 요약 목록 (캘린더 점 표시 + 날짜 순회 + N번째 운동 계산용)
export async function listSessionsOverview(
  profileId: string,
): Promise<SessionOverview[]> {
  const { data, error } = await supabase
    .from('workout_sessions')
    .select(
      'id,date,started_at,ended_at,' +
        'workout_entries(id,sets(weight_kg,reps,duration_seconds,is_completed))',
    )
    .eq('user_id', profileId)
    .order('date', { ascending: true })
  if (error) throw error
  const rows = (data ?? []) as unknown as {
    id: string
    date: string
    started_at: string | null
    ended_at: string | null
    workout_entries: {
      sets: {
        weight_kg: number | null
        reps: number
        duration_seconds: number | null
        is_completed: boolean
      }[]
    }[]
  }[]
  return rows
    .map((row) => {
      let setCount = 0
      let volume = 0
      for (const e of row.workout_entries) {
        for (const st of e.sets) {
          // 시간 세트(플랭크 등)도 한 세트로 센다. 볼륨은 reps=0 이라 자연히 0.
          if (isLoggedSet(st)) {
            setCount += 1
            volume += (st.weight_kg ?? 0) * st.reps
          }
        }
      }
      return {
        id: row.id,
        date: row.date,
        started_at: row.started_at,
        ended_at: row.ended_at,
        exerciseCount: row.workout_entries.length,
        setCount,
        volume,
      }
    })
    .filter((s) => s.exerciseCount > 0) // 빈 세션(생성만 되고 운동 없음)은 기록에서 제외
}

// ── 운동 항목 (entry) ───────────────────────────────────────────────
export async function addEntry(
  sessionId: string,
  exerciseId: string,
  orderIndex: number,
): Promise<void> {
  const { error } = await supabase.from('workout_entries').insert({
    session_id: sessionId,
    exercise_id: exerciseId,
    order_index: orderIndex,
  })
  if (error) throw error
}

// 다른 세션의 운동 구성을 그대로 복사할 때 사용 ("이 기록으로 운동 시작")
export async function addEntriesBulk(
  sessionId: string,
  exerciseIds: string[],
  startIndex: number,
): Promise<void> {
  if (exerciseIds.length === 0) return
  const rows = exerciseIds.map((exId, i) => ({
    session_id: sessionId,
    exercise_id: exId,
    order_index: startIndex + i,
  }))
  const { error } = await supabase.from('workout_entries').insert(rows)
  if (error) throw error
}

export async function updateEntryNotes(
  entryId: string,
  notes: string,
): Promise<void> {
  const { error } = await supabase
    .from('workout_entries')
    .update({ notes: notes.trim() === '' ? null : notes })
    .eq('id', entryId)
  if (error) throw error
}

export async function deleteEntry(entryId: string): Promise<void> {
  const { error } = await supabase
    .from('workout_entries')
    .delete()
    .eq('id', entryId)
  if (error) throw error
}

// 드래그 순서 변경: 정렬된 id 배열을 받아 order_index를 일괄 갱신
// (묶음 블록 전체 드래그도 이걸 그대로 쓴다 — 호출부가 블록을 펼쳐 멤버 id들을
//  연속으로 배치한 뒤 넘기면 되므로, 블록 이동 전용 함수가 따로 필요 없다)
export async function reorderEntries(orderedIds: string[]): Promise<void> {
  await Promise.all(
    orderedIds.map((id, i) =>
      supabase.from('workout_entries').update({ order_index: i }).eq('id', id),
    ),
  )
}

// 오늘 세션 구성을 "루틴 저장"할 때 쓰는 변환. 묶음 멤버의 default_rounds는
// 그 멤버가 실제로 가진 세트 수를 그대로 쓴다 (저장 시점 라운드 수 = 다음 적용 시 라운드 수).
export function toRoutineEntryInputs(entries: WorkoutEntry[]): RoutineEntryInput[] {
  return entries.map((e) => ({
    exercise_id: e.exercise_id,
    superset_id: e.superset_id,
    superset_name: e.superset_name,
    superset_rest_seconds: e.superset_rest_seconds,
    default_rounds: e.superset_id ? e.sets.length : null,
  }))
}

// "이 기록으로 운동 시작"(SessionDetailPage)처럼 다른 세션의 구성을 통째로 복사할 때,
// 묶음 구성까지 함께 옮긴다. superset_id는 세션 로컬 식별자이므로 원본 그룹별로
// 새 id를 하나씩 발급해 재매핑한다 (여러 세션에 같은 superset_id가 남으면 안 됨).
export interface EntryCopySpec {
  exercise_id: string
  superset_id: string | null
  superset_name: string | null
  superset_rest_seconds: number | null
}
export async function copyEntriesToSession(
  sessionId: string,
  specs: EntryCopySpec[],
  startIndex: number,
): Promise<void> {
  if (specs.length === 0) return
  const idMap = new Map<string, string>() // 원본 superset_id → 새로 발급한 id
  const rows = specs.map((s, i) => {
    let supersetId: string | null = null
    if (s.superset_id) {
      supersetId = idMap.get(s.superset_id) ?? crypto.randomUUID()
      idMap.set(s.superset_id, supersetId)
    }
    return {
      session_id: sessionId,
      exercise_id: s.exercise_id,
      order_index: startIndex + i,
      superset_id: supersetId,
      superset_name: supersetId ? s.superset_name : null,
      superset_rest_seconds: supersetId ? s.superset_rest_seconds : null,
    }
  })
  const { error } = await supabase.from('workout_entries').insert(rows)
  if (error) throw error
}

// ── 묶음(슈퍼세트) ────────────────────────────────────────────────────
// 새 테이블 없이 workout_entries의 superset_* 컬럼만 쓴다 (SUPERSET-AND-TIME.md 2.2절).
// 묶음의 "라운드"는 결국 각 멤버 entry의 세트일 뿐이라, 세트 자체는 기존 addSetsBulk /
// sets 테이블을 그대로 쓰고 여기서는 entry 그룹핑과 라운드 단위 조작만 다룬다.

export interface CreateSupersetInput {
  exerciseIds: string[] // 2개 이상
  name: string
  rounds: number
  restSeconds: number
}

// 새 묶음 생성: 멤버 entry들을 만들고, 라운드 수만큼 세트를 채운다.
// 세트 값은 단일 운동 추가(LogPage.handlePick)와 동일하게 직전 기록에서 autofill —
// 직전 기록이 이번 라운드 수보다 적으면 마지막 세트 값을 반복해서 채운다.
export async function createSuperset(
  profile: Profile,
  session: WorkoutSession,
  input: CreateSupersetInput,
): Promise<void> {
  const supersetId = crypto.randomUUID()
  const name = input.name.trim()
  const restSeconds = clampSupersetRest(input.restSeconds)
  const startIndex = session.entries.length

  const rows = input.exerciseIds.map((exId, i) => ({
    session_id: session.id,
    exercise_id: exId,
    order_index: startIndex + i,
    superset_id: supersetId,
    superset_name: name,
    superset_rest_seconds: restSeconds,
  }))
  const { data, error } = await supabase
    .from('workout_entries')
    .insert(rows)
    .select('id,exercise_id,order_index')
  if (error) throw error

  const created = (data ?? []) as { id: string; exercise_id: string; order_index: number }[]
  const entryIdByOrder = new Map<number, string>()
  for (const r of created) entryIdByOrder.set(r.order_index, r.id)
  // RLS/GRANT로 insert…select가 막힌 경우의 폴백 (routines.applyRoutineToToday와 동일 패턴)
  if (entryIdByOrder.size === 0) {
    const before = new Set(session.entries.map((e) => e.id))
    const reloaded = await getSessionByDate(profile.profile_id, session.date)
    for (const e of reloaded?.entries ?? []) {
      if (!before.has(e.id)) entryIdByOrder.set(e.order_index, e.id)
    }
  }

  const lastByEx = await getLastPerformanceMany(
    profile.profile_id,
    input.exerciseIds,
    session.date,
  )
  const setRows: {
    entry_id: string
    weight_kg: number | null
    reps: number
    duration_seconds: number | null
    order_index: number
  }[] = []
  input.exerciseIds.forEach((exId, i) => {
    const entryId = entryIdByOrder.get(startIndex + i)
    if (!entryId) return
    const srcSets = lastByEx[exId]?.sets ?? []
    for (let r = 0; r < input.rounds; r++) {
      const src = srcSets.length > 0 ? srcSets[Math.min(r, srcSets.length - 1)] : undefined
      setRows.push({
        entry_id: entryId,
        weight_kg: src?.weight_kg ?? null,
        reps: src?.reps ?? 0,
        duration_seconds: src?.duration_seconds ?? null,
        order_index: r,
      })
    }
  })
  await addSetsBulk(setRows)
}

function clampSupersetRest(sec: number): number {
  return Math.min(600, Math.max(10, Math.round(sec)))
}

export interface SupersetRoundMemberInput {
  entryId: string
  orderIndex: number
  weight_kg: number | null
  reps: number
  duration_seconds: number | null
}

// "+ 라운드 추가" — 멤버 전원에 세트를 하나씩 동시에 붙인다.
// 어떤 값으로 채울지(직전 라운드 복사 등)는 호출부(LogPage)가 계산해서 넘긴다 —
// 단일 운동의 handleAddSet과 같은 자리의 로직이라 여기 중복시키지 않는다.
export async function addSupersetRound(
  members: SupersetRoundMemberInput[],
): Promise<WorkoutSet[]> {
  if (members.length === 0) return []
  const rows = members.map((m) => ({
    entry_id: m.entryId,
    weight_kg: m.weight_kg,
    reps: m.reps,
    duration_seconds: m.duration_seconds,
    order_index: m.orderIndex,
  }))
  const { data, error } = await supabase.from('sets').insert(rows).select(SET_COLUMNS)
  if (error) throw error
  return (data ?? []) as WorkoutSet[]
}

// 라운드 삭제는 항상 멤버 전원에 동시 적용한다 (불변식 — 한 멤버만 지우면 라운드가
// 어긋난다). 호출부가 그 라운드에 해당하는 멤버별 세트 id를 모아 한 번에 넘긴다.
export async function removeSupersetRound(setIds: string[]): Promise<void> {
  if (setIds.length === 0) return
  const { error } = await supabase.from('sets').delete().in('id', setIds)
  if (error) throw error
}

export async function renameSuperset(
  sessionId: string,
  supersetId: string,
  name: string,
): Promise<void> {
  const { error } = await supabase
    .from('workout_entries')
    .update({ superset_name: name.trim() })
    .eq('session_id', sessionId)
    .eq('superset_id', supersetId)
  if (error) throw error
}

export async function setSupersetRestSeconds(
  sessionId: string,
  supersetId: string,
  restSeconds: number,
): Promise<void> {
  const { error } = await supabase
    .from('workout_entries')
    .update({ superset_rest_seconds: clampSupersetRest(restSeconds) })
    .eq('session_id', sessionId)
    .eq('superset_id', supersetId)
  if (error) throw error
}

// 묶음 해제 — 멤버 entry는 그대로 남고 개별 운동 카드로 분리된다 (세트/기록 보존)
export async function ungroupSuperset(
  sessionId: string,
  supersetId: string,
): Promise<void> {
  const { error } = await supabase
    .from('workout_entries')
    .update({ superset_id: null, superset_name: null, superset_rest_seconds: null })
    .eq('session_id', sessionId)
    .eq('superset_id', supersetId)
  if (error) throw error
}

// 묶음 삭제 — 멤버 entry를 전부 지운다 (sets는 FK CASCADE로 함께 삭제됨)
export async function deleteSuperset(
  sessionId: string,
  supersetId: string,
): Promise<void> {
  const { error } = await supabase
    .from('workout_entries')
    .delete()
    .eq('session_id', sessionId)
    .eq('superset_id', supersetId)
  if (error) throw error
}

// 묶음 안 운동 순서 교체 (↑↓) — 두 멤버의 order_index를 맞바꾼다
export async function swapEntryOrder(
  aId: string,
  aOrder: number,
  bId: string,
  bOrder: number,
): Promise<void> {
  await Promise.all([
    supabase.from('workout_entries').update({ order_index: bOrder }).eq('id', aId),
    supabase.from('workout_entries').update({ order_index: aOrder }).eq('id', bId),
  ])
}

// ── 세트 (set) ──────────────────────────────────────────────────────
const SET_COLUMNS =
  'id,entry_id,weight_kg,reps,duration_seconds,is_completed,order_index'

export async function addSet(
  entryId: string,
  weightKg: number | null,
  reps: number,
  orderIndex: number,
  durationSeconds: number | null = null,
): Promise<WorkoutSet> {
  const { data, error } = await supabase
    .from('sets')
    .insert({
      entry_id: entryId,
      weight_kg: weightKg,
      reps,
      duration_seconds: durationSeconds,
      order_index: orderIndex,
    })
    .select(SET_COLUMNS)
    .single()
  if (error) throw error
  return data as WorkoutSet
}

// 여러 세트를 한 번에 삽입 (루틴 적용처럼 세트를 통째로 복사할 때 사용)
export async function addSetsBulk(
  rows: {
    entry_id: string
    weight_kg: number | null
    reps: number
    duration_seconds?: number | null
    order_index: number
  }[],
): Promise<void> {
  if (rows.length === 0) return
  const { error } = await supabase.from('sets').insert(rows)
  if (error) throw error
}

export async function updateSet(
  setId: string,
  patch: Partial<
    Pick<WorkoutSet, 'weight_kg' | 'reps' | 'duration_seconds' | 'is_completed'>
  >,
): Promise<void> {
  const { error } = await supabase.from('sets').update(patch).eq('id', setId)
  if (error) throw error
}

export async function deleteSet(setId: string): Promise<void> {
  const { error } = await supabase.from('sets').delete().eq('id', setId)
  if (error) throw error
}

// ── 이전 기록 (autofill + "지난번 대비") ────────────────────────────
export interface LastPerformance {
  date: string
  sets: {
    weight_kg: number | null
    reps: number
    duration_seconds: number | null
  }[]
}

// 특정 운동의, 오늘 이전 가장 최근 세션 기록을 반환
export async function getLastPerformance(
  profileId: string,
  exerciseId: string,
  beforeDate: string,
): Promise<LastPerformance | null> {
  const { data, error } = await supabase
    .from('workout_entries')
    .select(
      'id, workout_sessions!inner(user_id,date), sets(weight_kg,reps,duration_seconds,order_index)',
    )
    .eq('exercise_id', exerciseId)
    .eq('workout_sessions.user_id', profileId)
    .lt('workout_sessions.date', beforeDate)
  if (error) throw error
  if (!data || data.length === 0) return null

  // 가장 최근 날짜의 entry 선택 (클라이언트 정렬 — 운동당 건수가 적음)
  const rows = data as unknown as {
    workout_sessions: { date: string }
    sets: {
      weight_kg: number | null
      reps: number
      duration_seconds: number | null
      order_index: number
    }[]
  }[]
  rows.sort((a, b) =>
    a.workout_sessions.date < b.workout_sessions.date ? 1 : -1,
  )
  const latest = rows[0]
  const sets = [...latest.sets]
    .sort((a, b) => a.order_index - b.order_index)
    .map((s) => ({
      weight_kg: s.weight_kg,
      reps: s.reps,
      duration_seconds: s.duration_seconds,
    }))
  return { date: latest.workout_sessions.date, sets }
}

// 여러 운동의 직전 기록을 한 번의 왕복으로 조회 (루틴 적용 시 N+1 방지)
// 반환 맵은 요청한 모든 exercise_id를 키로 가지며, 기록이 없으면 null.
export async function getLastPerformanceMany(
  profileId: string,
  exerciseIds: string[],
  beforeDate: string,
): Promise<Record<string, LastPerformance | null>> {
  const result: Record<string, LastPerformance | null> = {}
  // 중복 운동이 들어와도 한 번만 조회하도록 정리
  const uniqueIds = [...new Set(exerciseIds)]
  for (const id of uniqueIds) result[id] = null
  if (uniqueIds.length === 0) return result

  const { data, error } = await supabase
    .from('workout_entries')
    .select(
      'id, exercise_id, workout_sessions!inner(user_id,date), sets(weight_kg,reps,duration_seconds,order_index)',
    )
    .in('exercise_id', uniqueIds)
    .eq('workout_sessions.user_id', profileId)
    .lt('workout_sessions.date', beforeDate)
  if (error) throw error

  const rows = (data ?? []) as unknown as {
    exercise_id: string
    workout_sessions: { date: string }
    sets: {
      weight_kg: number | null
      reps: number
      duration_seconds: number | null
      order_index: number
    }[]
  }[]

  // 운동별로 가장 최근 날짜의 entry만 남긴다 (클라이언트 비교 — 건수가 적음)
  const latestByEx: Record<string, (typeof rows)[number]> = {}
  for (const row of rows) {
    const prev = latestByEx[row.exercise_id]
    if (!prev || prev.workout_sessions.date < row.workout_sessions.date) {
      latestByEx[row.exercise_id] = row
    }
  }

  for (const [exId, row] of Object.entries(latestByEx)) {
    const sets = [...row.sets]
      .sort((a, b) => a.order_index - b.order_index)
      .map((s) => ({
        weight_kg: s.weight_kg,
        reps: s.reps,
        duration_seconds: s.duration_seconds,
      }))
    result[exId] = { date: row.workout_sessions.date, sets }
  }
  return result
}
