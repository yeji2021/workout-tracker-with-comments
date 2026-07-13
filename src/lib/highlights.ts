import type { WorkoutSession } from './types'
import type { StatSession } from './stats'
import type { ShareHighlights } from './share'

const num = (v: number | null | undefined) => (Number.isFinite(v) ? (v as number) : 0)

function sessionVolume(entries: StatSession['entries']): number {
  let v = 0
  for (const e of entries) {
    for (const st of e.sets) {
      if (num(st.reps) > 0) v += num(st.weight_kg) * num(st.reps)
    }
  }
  return v
}

function bestWeightsBefore(
  sessions: StatSession[],
  beforeDate: string,
): Map<string, number> {
  const best = new Map<string, number>()
  for (const ses of sessions) {
    if (ses.date >= beforeDate) continue
    for (const e of ses.entries) {
      if (!e.exerciseName) continue
      for (const st of e.sets) {
        if (num(st.reps) <= 0 || st.weight_kg == null) continue
        const cur = best.get(e.exerciseName) ?? 0
        if (st.weight_kg > cur) best.set(e.exerciseName, st.weight_kg)
      }
    }
  }
  return best
}

function exerciseNamesBefore(
  sessions: StatSession[],
  beforeDate: string,
): Set<string> {
  const names = new Set<string>()
  for (const ses of sessions) {
    if (ses.date >= beforeDate) continue
    for (const e of ses.entries) if (e.exerciseName) names.add(e.exerciseName)
  }
  return names
}

// 공유 시점 자동 하이라이트 판정 — 본인 과거 기록만으로 계산 (타인 기록 조회 불필요).
// 우선순위: pr > new_exercise > tired > null. tired는 사용자가 끌 수 있어야 한다 (ShareSheet에서).
export function detectHighlights(
  session: WorkoutSession,
  pastSessions: StatSession[], // fetchAllSessions 결과 (오늘 세션 포함 여부 무관 — 날짜로 필터링함)
): ShareHighlights | null {
  const before = pastSessions.filter((s) => s.date < session.date)

  // 1) PR — 이 세션에서 어떤 운동이든 과거 최고 무게를 넘겼는지
  const bestBefore = bestWeightsBefore(pastSessions, session.date)
  const prs: { name: string; weight_kg: number }[] = []
  for (const e of session.entries) {
    const name = e.exercise?.name
    if (!name) continue
    let maxInSession = 0
    for (const st of e.sets) {
      if (st.reps > 0 && st.weight_kg != null && st.weight_kg > maxInSession) {
        maxInSession = st.weight_kg
      }
    }
    if (maxInSession <= 0) continue
    if (maxInSession > (bestBefore.get(name) ?? 0)) {
      prs.push({ name, weight_kg: maxInSession })
    }
  }
  if (prs.length > 0) {
    const top = prs.reduce((a, b) => (b.weight_kg > a.weight_kg ? b : a))
    const title =
      prs.length === 1
        ? `🏆 ${top.name} ${top.weight_kg}kg 신기록!`
        : `🏆 ${top.name} 외 ${prs.length - 1}개 신기록!`
    return { kind: 'pr', title, prs }
  }

  // 2) 새로운 운동 — 과거 기록이 있는 상태에서만 "새롭다"는 의미가 있음
  if (before.length > 0) {
    const known = exerciseNamesBefore(pastSessions, session.date)
    const newExercises = [
      ...new Set(
        session.entries
          .map((e) => e.exercise?.name)
          .filter((n): n is string => !!n && !known.has(n)),
      ),
    ]
    if (newExercises.length > 0) {
      const title =
        newExercises.length === 1
          ? `🌱 새로운 운동에 도전했어요 — ${newExercises[0]}`
          : `🌱 새로운 운동 ${newExercises.length}개에 도전했어요`
      return { kind: 'new_exercise', title, new_exercises: newExercises }
    }
  }

  // 3) 컨디션 저하 — 최근 5개 세션 평균 볼륨의 70% 미만 (세션 3개 미만이면 판정 안 함)
  if (before.length >= 3) {
    const recent = before.slice(-5)
    const avgVolume =
      recent.reduce((sum, s) => sum + sessionVolume(s.entries), 0) / recent.length
    const thisVolume = sessionVolume(
      session.entries.map((e) => ({
        muscle: null,
        exerciseName: e.exercise?.name ?? '',
        sets: e.sets,
      })),
    )
    if (avgVolume > 0 && thisVolume < avgVolume * 0.7) {
      return { kind: 'tired', title: '😮‍💨 오늘은 좀 피곤한가봐요 ㅜ' }
    }
  }

  return null
}
