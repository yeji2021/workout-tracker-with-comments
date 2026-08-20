import { supabase } from './supabase'
import type {
  Profile,
  SupersetPreset,
  SupersetPresetMemberInput,
  WorkoutSession,
} from './types'
import { createSession, getSessionByDate, addSetsBulk } from './workouts'

const PRESET_SELECT =
  'id,name,rest_seconds,' +
  'superset_preset_exercises(id,exercise_id,order_index,' +
  'exercises(id,name,primary_muscle_group,secondary_muscle_group,kind,is_default,created_by),' +
  'superset_preset_sets(weight_kg,reps,duration_seconds,order_index))'

function mapPreset(row: Record<string, unknown>): SupersetPreset {
  const exercisesRaw =
    (row.superset_preset_exercises as Record<string, unknown>[] | undefined) ?? []
  const exercises = exercisesRaw
    .map((e) => {
      const setsRaw = (e.superset_preset_sets as Record<string, unknown>[] | undefined) ?? []
      return {
        exercise_id: e.exercise_id as string,
        exercise: (e.exercises as SupersetPreset['exercises'][number]['exercise']) ?? undefined,
        order_index: e.order_index as number,
        sets: setsRaw
          .slice()
          .sort((a, b) => (a.order_index as number) - (b.order_index as number))
          .map((s) => ({
            weight_kg: (s.weight_kg as number | null) ?? null,
            reps: (s.reps as number) ?? 0,
            duration_seconds: (s.duration_seconds as number | null) ?? null,
          })),
      }
    })
    .sort((a, b) => a.order_index - b.order_index)
    .map(({ order_index: _order_index, ...rest }) => rest)
  return {
    id: row.id as string,
    name: row.name as string,
    rest_seconds: row.rest_seconds as number,
    exercises,
  }
}

export async function listSupersetPresets(profileId: string): Promise<SupersetPreset[]> {
  const { data, error } = await supabase
    .from('superset_presets')
    .select(PRESET_SELECT)
    .eq('user_id', profileId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapPreset)
}

// 현재 세션에 이미 만들어진 묶음(무게/횟수 입력 완료 상태)을 그대로 스냅샷해 저장.
export async function createSupersetPreset(
  profileId: string,
  name: string,
  restSeconds: number,
  members: SupersetPresetMemberInput[],
): Promise<SupersetPreset> {
  const { data: preset, error: presetErr } = await supabase
    .from('superset_presets')
    .insert({ user_id: profileId, name: name.trim(), rest_seconds: restSeconds })
    .select('id')
    .single()
  if (presetErr) throw presetErr
  const presetId = preset.id as string

  const exerciseRows = members.map((m, i) => ({
    preset_id: presetId,
    exercise_id: m.exercise_id,
    order_index: i,
  }))
  const { data: createdExercises, error: exErr } = await supabase
    .from('superset_preset_exercises')
    .insert(exerciseRows)
    .select('id,order_index')
  if (exErr) throw exErr

  const presetExerciseIdByOrder = new Map<number, string>()
  for (const row of (createdExercises ?? []) as { id: string; order_index: number }[]) {
    presetExerciseIdByOrder.set(row.order_index, row.id)
  }

  const setRows: {
    preset_exercise_id: string
    weight_kg: number | null
    reps: number
    duration_seconds: number | null
    order_index: number
  }[] = []
  members.forEach((m, i) => {
    const presetExerciseId = presetExerciseIdByOrder.get(i)
    if (!presetExerciseId) return
    m.sets.forEach((s, si) => {
      setRows.push({
        preset_exercise_id: presetExerciseId,
        weight_kg: s.weight_kg,
        reps: s.reps,
        duration_seconds: s.duration_seconds,
        order_index: si,
      })
    })
  })
  if (setRows.length > 0) {
    const { error: setErr } = await supabase.from('superset_preset_sets').insert(setRows)
    if (setErr) throw setErr
  }

  return getSupersetPreset(presetId)
}

export async function getSupersetPreset(presetId: string): Promise<SupersetPreset> {
  const { data, error } = await supabase
    .from('superset_presets')
    .select(PRESET_SELECT)
    .eq('id', presetId)
    .single()
  if (error) throw error
  return mapPreset(data as unknown as Record<string, unknown>)
}

export async function deleteSupersetPreset(presetId: string): Promise<void> {
  const { error } = await supabase.from('superset_presets').delete().eq('id', presetId)
  if (error) throw error
}

// 오늘 세션에 프리셋을 통째로 추가 — 저장된 무게/횟수를 그대로 넣는다
// (루틴 적용과 달리 "지난 기록"을 보지 않음 — 프리셋 존재 이유 자체가 고정값).
export async function applySupersetPresetToToday(
  profile: Profile,
  preset: SupersetPreset,
  date: string,
): Promise<void> {
  let session: WorkoutSession | null = await getSessionByDate(profile.profile_id, date)
  if (!session) session = await createSession(profile, date)
  if (preset.exercises.length === 0) return
  const start = session.entries.length
  const supersetId = crypto.randomUUID()

  const rows = preset.exercises.map((pe, i) => ({
    session_id: session!.id,
    exercise_id: pe.exercise_id,
    order_index: start + i,
    superset_id: supersetId,
    superset_name: preset.name,
    superset_rest_seconds: preset.rest_seconds,
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
    const reloaded = await getSessionByDate(profile.profile_id, date)
    for (const e of reloaded?.entries ?? []) {
      if (!before.has(e.id)) entryIdByOrder.set(e.order_index, e.id)
    }
  }

  const setRows: {
    entry_id: string
    weight_kg: number | null
    reps: number
    duration_seconds: number | null
    order_index: number
  }[] = []
  preset.exercises.forEach((pe, i) => {
    const entryId = entryIdByOrder.get(start + i)
    if (!entryId) return
    pe.sets.forEach((s, si) => {
      setRows.push({
        entry_id: entryId,
        weight_kg: s.weight_kg,
        reps: s.reps,
        duration_seconds: s.duration_seconds,
        order_index: si,
      })
    })
  })
  await addSetsBulk(setRows)
}
