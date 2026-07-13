import { supabase } from './supabase'
import { MUSCLE_GROUPS, type MuscleGroup, type WorkoutSession } from './types'
import { todayISO } from './workouts'

// ── 통계용 경량 세션 모델 ────────────────────────────────────────────
export interface StatSet {
  weight_kg: number | null
  reps: number
  is_completed: boolean
}
export interface StatEntry {
  muscle: MuscleGroup | null
  exerciseName: string
  sets: StatSet[]
}
export interface StatSession {
  date: string // YYYY-MM-DD
  entries: StatEntry[]
}

export type Period = '7' | '30' | '90' | 'all'

// ── 날짜 헬퍼 (tz 안전, UTC 기준 문자열 연산) ───────────────────────
export function shiftISO(iso: string, deltaDays: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + deltaDays)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`
}

// ── 조회 ────────────────────────────────────────────────────────────
export async function fetchAllSessions(
  profileId: string,
): Promise<StatSession[]> {
  const { data, error } = await supabase
    .from('workout_sessions')
    .select(
      'date, workout_entries(exercises(name,primary_muscle_group), sets(weight_kg,reps,is_completed))',
    )
    .eq('user_id', profileId)
    .order('date', { ascending: true })
  if (error) throw error
  const rows = (data ?? []) as unknown as Record<string, unknown>[]
  return rows.map((s) => ({
    date: s.date as string,
    entries: ((s.workout_entries as Record<string, unknown>[]) ?? []).map(
      (e) => {
        const ex = e.exercises as
          | { name: string; primary_muscle_group: MuscleGroup }
          | null
        return {
          muscle: ex?.primary_muscle_group ?? null,
          exerciseName: ex?.name ?? '',
          sets: (e.sets as StatSet[]) ?? [],
        }
      },
    ),
  }))
}

// ── 계산 유틸 ────────────────────────────────────────────────────────
// ?? 는 NaN을 걸러내지 못하므로 Number.isFinite로 방어한다.
const num = (v: number | null | undefined) => (Number.isFinite(v) ? (v as number) : 0)
const isLogged = (s: StatSet) => num(s.reps) > 0
const setVolume = (s: StatSet) => num(s.weight_kg) * num(s.reps)

function emptyGroups(): Record<MuscleGroup, number> {
  return Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, 0])) as Record<
    MuscleGroup,
    number
  >
}

function inRange(date: string, fromISO: string, toISO: string) {
  return date >= fromISO && date <= toISO
}

// 부위별 볼륨(무게×횟수 합)
export function volumeByGroup(
  sessions: StatSession[],
  fromISO: string,
  toISO: string,
): Record<MuscleGroup, number> {
  const acc = emptyGroups()
  for (const ses of sessions) {
    if (!inRange(ses.date, fromISO, toISO)) continue
    for (const e of ses.entries) {
      if (!e.muscle) continue
      for (const st of e.sets) if (isLogged(st)) acc[e.muscle] += setVolume(st)
    }
  }
  return acc
}

// 부위별 세트 수 (근육 사용 빈도)
export function setCountByGroup(
  sessions: StatSession[],
  fromISO: string,
  toISO: string,
): Record<MuscleGroup, number> {
  const acc = emptyGroups()
  for (const ses of sessions) {
    if (!inRange(ses.date, fromISO, toISO)) continue
    for (const e of ses.entries) {
      if (!e.muscle) continue
      for (const st of e.sets) if (isLogged(st)) acc[e.muscle] += 1
    }
  }
  return acc
}

// 기간 → [fromISO, toISO]
export function periodRange(period: Period): [string, string] {
  const today = todayISO()
  if (period === 'all') return ['0000-01-01', today]
  return [shiftISO(today, -(Number(period) - 1)), today]
}

// 주간 비교: 최근 7일 vs 그 이전 7일 (부위별 볼륨 차이)
export interface WeekCompare {
  thisWeek: Record<MuscleGroup, number>
  lastWeek: Record<MuscleGroup, number>
  diff: Record<MuscleGroup, number>
}
export function weekCompare(sessions: StatSession[]): WeekCompare {
  const today = todayISO()
  const thisFrom = shiftISO(today, -6)
  const lastTo = shiftISO(today, -7)
  const lastFrom = shiftISO(today, -13)
  const thisWeek = volumeByGroup(sessions, thisFrom, today)
  const lastWeek = volumeByGroup(sessions, lastFrom, lastTo)
  const diff = emptyGroups()
  for (const g of MUSCLE_GROUPS) diff[g] = thisWeek[g] - lastWeek[g]
  return { thisWeek, lastWeek, diff }
}

// 일별 총 볼륨 (캘린더 히트맵용)
export function volumeByDate(sessions: StatSession[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const ses of sessions) {
    let v = 0
    for (const e of ses.entries)
      for (const st of e.sets) if (isLogged(st)) v += setVolume(st)
    map.set(ses.date, (map.get(ses.date) ?? 0) + v)
  }
  return map
}

// 운동별 최고기록 (최대 무게, 동무게면 최다 횟수)
export interface PR {
  exerciseName: string
  weight: number
  reps: number
  date: string
}
export function personalRecords(sessions: StatSession[]): PR[] {
  const best = new Map<string, PR>()
  for (const ses of sessions) {
    for (const e of ses.entries) {
      if (!e.exerciseName) continue
      for (const st of e.sets) {
        if (!isLogged(st) || st.weight_kg == null) continue
        const cur = best.get(e.exerciseName)
        const better =
          !cur ||
          st.weight_kg > cur.weight ||
          (st.weight_kg === cur.weight && st.reps > cur.reps)
        if (better)
          best.set(e.exerciseName, {
            exerciseName: e.exerciseName,
            weight: st.weight_kg,
            reps: st.reps,
            date: ses.date,
          })
      }
    }
  }
  return [...best.values()].sort((a, b) => b.weight - a.weight)
}

// Epley 공식 기반 1RM 추정 (세트 상세 카드용)
export function epley1RM(weightKg: number, reps: number): number {
  return Math.round(weightKg * (1 + reps / 30))
}

// WorkoutSession(상세 조회 모델) → StatSession(통계 계산 모델) 변환
export function toStatSession(session: WorkoutSession): StatSession {
  return {
    date: session.date,
    entries: session.entries.map((e) => ({
      muscle: e.exercise?.primary_muscle_group ?? null,
      exerciseName: e.exercise?.name ?? '',
      sets: e.sets.map((s) => ({
        weight_kg: s.weight_kg,
        reps: s.reps,
        is_completed: s.is_completed,
      })),
    })),
  }
}

// 단일 세션의 부위별 볼륨 — BodyHeatmap 재사용용 (기간 통계와 동일 계산기 사용)
export function volumeByGroupForSession(
  session: StatSession,
): Record<MuscleGroup, number> {
  return volumeByGroup([session], session.date, session.date)
}

// 연속 기록(스트릭) — 오늘 기록이 아직 없으면 어제부터 거꾸로 세어
// "오늘 아직 운동 전이라 스트릭이 끊긴 것처럼 보이는" 문제를 피한다.
export function computeStreak(dates: string[], today: string): number {
  const set = new Set(dates)
  let cursor = set.has(today) ? today : shiftISO(today, -1)
  let count = 0
  while (set.has(cursor)) {
    count += 1
    cursor = shiftISO(cursor, -1)
  }
  return count
}

// 운동한 날 수 (기간 내)
export function workoutDayCount(
  sessions: StatSession[],
  fromISO: string,
  toISO: string,
): number {
  let n = 0
  for (const ses of sessions) {
    if (!inRange(ses.date, fromISO, toISO)) continue
    const hasLogged = ses.entries.some((e) => e.sets.some(isLogged))
    if (hasLogged) n += 1
  }
  return n
}
