import { supabase } from './supabase'
import type { Profile, Routine } from './types'
import {
  addSetsBulk,
  createSession,
  getLastPerformanceMany,
  getSessionByDate,
} from './workouts'

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

// ── 오늘 세션에 루틴 적용 (운동 항목 + 지난 기록의 세트까지 복사) ────
export async function applyRoutineToToday(
  profile: Profile,
  exerciseIds: string[],
  date: string,
): Promise<void> {
  let session = await getSessionByDate(profile.profile_id, date)
  if (!session) session = await createSession(profile, date)
  const start = session.entries.length
  if (exerciseIds.length === 0) return
  // order_index를 미리 계산해 한 번에 배치 삽입 (N+1 왕복 제거)
  const rows = exerciseIds.map((exId, i) => ({
    session_id: session.id,
    exercise_id: exId,
    order_index: start + i,
  }))
  const { data, error } = await supabase
    .from('workout_entries')
    .insert(rows)
    .select('id,exercise_id,order_index')
  if (error) throw error

  // 방금 만든 entry를 order_index로 찾는다.
  // (같은 운동이 루틴에 두 번 들어있어도 order_index는 유일하므로 안전)
  const created = (data ?? []) as unknown as {
    id: string
    exercise_id: string
    order_index: number
  }[]
  const entryIdByOrder = new Map<number, string>()
  for (const r of created) entryIdByOrder.set(r.order_index, r.id)
  // RLS/GRANT로 insert…select가 막힌 경우엔 세션을 다시 읽어 보완.
  // 기존에 있던 entry는 제외해야 중복 운동을 잘못 매칭하지 않는다.
  if (entryIdByOrder.size === 0) {
    const before = new Set(session.entries.map((e) => e.id))
    const reloaded = await getSessionByDate(profile.profile_id, date)
    for (const e of reloaded?.entries ?? []) {
      if (!before.has(e.id)) entryIdByOrder.set(e.order_index, e.id)
    }
  }

  // 운동별 직전 기록을 한 번에 조회해 세트를 그대로 복사한다
  // (기록이 없는 운동은 세트 없이 그대로 둔다)
  const lastByEx = await getLastPerformanceMany(
    profile.profile_id,
    exerciseIds,
    date,
  )
  const setRows: {
    entry_id: string
    weight_kg: number | null
    reps: number
    order_index: number
  }[] = []
  exerciseIds.forEach((exId, i) => {
    const entryId = entryIdByOrder.get(start + i)
    const perf = lastByEx[exId]
    if (!entryId || !perf) return
    perf.sets.forEach((s, si) => {
      setRows.push({
        entry_id: entryId,
        weight_kg: s.weight_kg,
        reps: s.reps,
        order_index: si, // is_completed는 DB 기본값(false) 사용
      })
    })
  })
  await addSetsBulk(setRows)
}
