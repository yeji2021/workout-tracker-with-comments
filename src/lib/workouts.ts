import { supabase } from './supabase'
import type {
  Exercise,
  MuscleGroup,
  Profile,
  WorkoutEntry,
  WorkoutSession,
  WorkoutSet,
} from './types'

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
    .select(
      'id,name,primary_muscle_group,secondary_muscle_group,is_default,created_by',
    )
    .order('name')
  if (error) throw error
  return (data ?? []) as Exercise[]
}

export async function addCustomExercise(
  name: string,
  primary: MuscleGroup,
  secondary: MuscleGroup | null,
  profileId: string,
): Promise<Exercise> {
  const { data, error } = await supabase
    .from('exercises')
    .insert({
      name: name.trim(),
      primary_muscle_group: primary,
      secondary_muscle_group: secondary,
      is_default: false,
      created_by: profileId,
    })
    .select(
      'id,name,primary_muscle_group,secondary_muscle_group,is_default,created_by',
    )
    .single()
  if (error) throw error
  return data as Exercise
}

// ── 세션 조회/생성 ──────────────────────────────────────────────────
const SESSION_SELECT =
  'id,user_id,group_id,date,is_shared,' +
  'workout_entries(id,session_id,exercise_id,order_index,notes,' +
  'sets(id,entry_id,weight_kg,reps,is_completed,order_index),' +
  'exercises(id,name,primary_muscle_group,secondary_muscle_group,is_default,created_by))'

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
        sets,
        exercise: (e.exercises as Exercise) ?? undefined,
      }
    })
    .sort((a, b) => a.order_index - b.order_index)

  return {
    id: row.id as string,
    user_id: row.user_id as string,
    group_id: row.group_id as string,
    date: row.date as string,
    is_shared: row.is_shared as boolean,
    entries,
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
      group_id: profile.group_id,
      date,
    })
    .select(SESSION_SELECT)
    .single()
  if (error) throw error
  return mapSession(data as unknown as Record<string, unknown>)
}

export async function setSessionShared(
  sessionId: string,
  shared: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('workout_sessions')
    .update({ is_shared: shared })
    .eq('id', sessionId)
  if (error) throw error
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
export async function reorderEntries(orderedIds: string[]): Promise<void> {
  await Promise.all(
    orderedIds.map((id, i) =>
      supabase.from('workout_entries').update({ order_index: i }).eq('id', id),
    ),
  )
}

// ── 세트 (set) ──────────────────────────────────────────────────────
export async function addSet(
  entryId: string,
  weightKg: number | null,
  reps: number,
  orderIndex: number,
): Promise<WorkoutSet> {
  const { data, error } = await supabase
    .from('sets')
    .insert({
      entry_id: entryId,
      weight_kg: weightKg,
      reps,
      order_index: orderIndex,
    })
    .select('id,entry_id,weight_kg,reps,is_completed,order_index')
    .single()
  if (error) throw error
  return data as WorkoutSet
}

export async function updateSet(
  setId: string,
  patch: Partial<Pick<WorkoutSet, 'weight_kg' | 'reps' | 'is_completed'>>,
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
  sets: { weight_kg: number | null; reps: number }[]
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
      'id, workout_sessions!inner(user_id,date), sets(weight_kg,reps,order_index)',
    )
    .eq('exercise_id', exerciseId)
    .eq('workout_sessions.user_id', profileId)
    .lt('workout_sessions.date', beforeDate)
  if (error) throw error
  if (!data || data.length === 0) return null

  // 가장 최근 날짜의 entry 선택 (클라이언트 정렬 — 운동당 건수가 적음)
  const rows = data as unknown as {
    workout_sessions: { date: string }
    sets: { weight_kg: number | null; reps: number; order_index: number }[]
  }[]
  rows.sort((a, b) =>
    a.workout_sessions.date < b.workout_sessions.date ? 1 : -1,
  )
  const latest = rows[0]
  const sets = [...latest.sets]
    .sort((a, b) => a.order_index - b.order_index)
    .map((s) => ({ weight_kg: s.weight_kg, reps: s.reps }))
  return { date: latest.workout_sessions.date, sets }
}
