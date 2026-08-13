import { supabase } from './supabase'
import type { Profile, Routine, RoutineEntry, RoutineEntryInput } from './types'
import { DEFAULT_SUPERSET_ROUNDS } from './types'
import {
  addSetsBulk,
  createSession,
  getLastPerformanceMany,
  getSessionByDate,
} from './workouts'

const ROUTINE_SELECT =
  'id,name,' +
  'routine_entries(id,routine_id,exercise_id,order_index,' +
  'superset_id,superset_name,superset_rest_seconds,default_rounds,' +
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
      superset_id: (e.superset_id as string | null) ?? null,
      superset_name: (e.superset_name as string | null) ?? null,
      superset_rest_seconds: (e.superset_rest_seconds as number | null) ?? null,
      default_rounds: (e.default_rounds as number | null) ?? null,
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
  entries: RoutineEntryInput[],
): Promise<Routine> {
  const { data: routine, error } = await supabase
    .from('routines')
    .insert({ user_id: profileId, name: name.trim() })
    .select('id')
    .single()
  if (error) throw error
  const routineId = routine.id as string
  await replaceEntries(routineId, entries)
  return getRoutine(routineId)
}

// ── 수정 (이름 + 운동 구성 교체) ────────────────────────────────────
export async function updateRoutine(
  routineId: string,
  name: string,
  entries: RoutineEntryInput[],
): Promise<Routine> {
  const { error } = await supabase
    .from('routines')
    .update({ name: name.trim() })
    .eq('id', routineId)
  if (error) throw error
  await replaceEntries(routineId, entries)
  return getRoutine(routineId)
}

async function replaceEntries(routineId: string, entries: RoutineEntryInput[]) {
  // 기존 항목 전부 삭제 후 순서대로 재삽입 (항목 수가 적어 단순 교체가 안전)
  const { error: delErr } = await supabase
    .from('routine_entries')
    .delete()
    .eq('routine_id', routineId)
  if (delErr) throw delErr
  if (entries.length === 0) return
  const rows = entries.map((entry, i) => ({
    routine_id: routineId,
    exercise_id: entry.exercise_id,
    order_index: i,
    superset_id: entry.superset_id,
    superset_name: entry.superset_name,
    superset_rest_seconds: entry.superset_rest_seconds,
    default_rounds: entry.default_rounds,
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
// routineEntries는 로드된 Routine의 .entries를 그대로 넘긴다 — default_rounds/
// superset_* 필드는 RoutineEntry에만 있고 벌거벗은 exercise id 목록에는 없기 때문.
export async function applyRoutineToToday(
  profile: Profile,
  routineEntries: RoutineEntry[],
  date: string,
): Promise<void> {
  let session = await getSessionByDate(profile.profile_id, date)
  if (!session) session = await createSession(profile, date)
  const start = session.entries.length
  if (routineEntries.length === 0) return

  // 루틴-로컬 superset_id는 세션에 새겨 넣지 않는다 — 적용할 때마다
  // 그룹별로 새 UUID를 하나씩 발급해 재매핑한다.
  const newSupersetIdByOriginal = new Map<string, string>()
  for (const e of routineEntries) {
    if (e.superset_id && !newSupersetIdByOriginal.has(e.superset_id)) {
      newSupersetIdByOriginal.set(e.superset_id, crypto.randomUUID())
    }
  }

  // order_index를 미리 계산해 한 번에 배치 삽입 (N+1 왕복 제거)
  const rows = routineEntries.map((e, i) => ({
    session_id: session!.id,
    exercise_id: e.exercise_id,
    order_index: start + i,
    superset_id: e.superset_id ? newSupersetIdByOriginal.get(e.superset_id)! : null,
    superset_name: e.superset_id ? e.superset_name : null,
    superset_rest_seconds: e.superset_id ? e.superset_rest_seconds : null,
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
  const exerciseIds = routineEntries.map((e) => e.exercise_id)
  const lastByEx = await getLastPerformanceMany(
    profile.profile_id,
    exerciseIds,
    date,
  )

  // 묶음 그룹별 라운드 수 — 저장 규칙상 한 그룹의 멤버는 전원 같은 default_rounds를
  // 갖도록 만들어지므로, 그룹 첫 멤버의 값을 그 그룹의 라운드 수로 취급한다.
  const roundsByGroup = new Map<string, number>()
  for (const e of routineEntries) {
    if (e.superset_id && !roundsByGroup.has(e.superset_id)) {
      roundsByGroup.set(e.superset_id, e.default_rounds ?? DEFAULT_SUPERSET_ROUNDS)
    }
  }

  const setRows: {
    entry_id: string
    weight_kg: number | null
    reps: number
    duration_seconds?: number | null
    order_index: number
  }[] = []

  routineEntries.forEach((e, i) => {
    const entryId = entryIdByOrder.get(start + i)
    if (!entryId) return
    const perf = lastByEx[e.exercise_id]

    if (e.superset_id) {
      // 묶음 멤버: default_rounds(그룹 공통)만큼 세트를 만든다.
      // 지난 기록이 라운드 수보다 적으면 마지막 세트 값을 반복해서 채운다.
      const rounds = roundsByGroup.get(e.superset_id) ?? DEFAULT_SUPERSET_ROUNDS
      for (let r = 0; r < rounds; r++) {
        let weight: number | null = null
        let reps = 0
        let duration: number | null = null
        if (perf && perf.sets.length > 0) {
          const s = perf.sets[Math.min(r, perf.sets.length - 1)]
          weight = s.weight_kg
          reps = s.reps
          duration = s.duration_seconds
        }
        setRows.push({
          entry_id: entryId,
          weight_kg: weight,
          reps,
          duration_seconds: duration,
          order_index: r,
        })
      }
    } else {
      // 단독 운동: 기존과 동일 — 지난 기록의 세트 수만큼, 있는 그대로 복사
      if (!perf) return
      perf.sets.forEach((s, si) => {
        setRows.push({
          entry_id: entryId,
          weight_kg: s.weight_kg,
          reps: s.reps,
          order_index: si, // is_completed는 DB 기본값(false) 사용
        })
      })
    }
  })
  await addSetsBulk(setRows)
}
