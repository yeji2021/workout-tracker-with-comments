import { supabase } from './supabase'
import type { Profile, Routine } from './types'
import { addEntry, createSession, getSessionByDate } from './workouts'

const ROUTINE_SELECT =
  'id,name,' +
  'routine_entries(id,routine_id,exercise_id,order_index,' +
  'exercises(id,name,primary_muscle_group,secondary_muscle_group,is_default,created_by))'

function mapRoutine(row: Record<string, unknown>): Routine {
  const entriesRaw =
    (row.routine_entries as Record<string, unknown>[] | undefined) ?? []
  const entries = entriesRaw
    .map((e) => ({
      id: e.id as string,
      routine_id: e.routine_id as string,
      exercise_id: e.exercise_id as string,
      order_index: e.order_index as number,
      exercise: (e.exercises as Routine['entries'][number]['exercise']) ?? undefined,
    }))
    .sort((a, b) => a.order_index - b.order_index)
  return { id: row.id as string, name: row.name as string, entries }
}

// ── 목록 ────────────────────────────────────────────────────────────
export async function listRoutines(profileId: string): Promise<Routine[]> {
  const { data, error } = await supabase
    .from('routines')
    .select(ROUTINE_SELECT)
    .eq('user_id', profileId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapRoutine)
}

// ── 생성 ────────────────────────────────────────────────────────────
export async function createRoutine(
  profileId: string,
  name: string,
  exerciseIds: string[],
): Promise<Routine> {
  const { data: routine, error } = await supabase
    .from('routines')
    .insert({ user_id: profileId, name: name.trim() })
    .select('id')
    .single()
  if (error) throw error
  const routineId = routine.id as string
  await replaceEntries(routineId, exerciseIds)
  return getRoutine(routineId)
}

// ── 수정 (이름 + 운동 구성 교체) ────────────────────────────────────
export async function updateRoutine(
  routineId: string,
  name: string,
  exerciseIds: string[],
): Promise<Routine> {
  const { error } = await supabase
    .from('routines')
    .update({ name: name.trim() })
    .eq('id', routineId)
  if (error) throw error
  await replaceEntries(routineId, exerciseIds)
  return getRoutine(routineId)
}

async function replaceEntries(routineId: string, exerciseIds: string[]) {
  // 기존 항목 전부 삭제 후 순서대로 재삽입 (항목 수가 적어 단순 교체가 안전)
  const { error: delErr } = await supabase
    .from('routine_entries')
    .delete()
    .eq('routine_id', routineId)
  if (delErr) throw delErr
  if (exerciseIds.length === 0) return
  const rows = exerciseIds.map((exId, i) => ({
    routine_id: routineId,
    exercise_id: exId,
    order_index: i,
  }))
  const { error: insErr } = await supabase.from('routine_entries').insert(rows)
  if (insErr) throw insErr
}

export async function getRoutine(routineId: string): Promise<Routine> {
  const { data, error } = await supabase
    .from('routines')
    .select(ROUTINE_SELECT)
    .eq('id', routineId)
    .single()
  if (error) throw error
  return mapRoutine(data as unknown as Record<string, unknown>)
}

export async function deleteRoutine(routineId: string): Promise<void> {
  const { error } = await supabase.from('routines').delete().eq('id', routineId)
  if (error) throw error
}

// ── 오늘 세션에 루틴 적용 (운동 항목만 추가, 세트는 사용자가 채움) ──
export async function applyRoutineToToday(
  profile: Profile,
  exerciseIds: string[],
  date: string,
): Promise<void> {
  let session = await getSessionByDate(profile.profile_id, date)
  if (!session) session = await createSession(profile, date)
  const start = session.entries.length
  // 순서 보장을 위해 순차 삽입
  for (let i = 0; i < exerciseIds.length; i++) {
    await addEntry(session.id, exerciseIds[i], start + i)
  }
}
