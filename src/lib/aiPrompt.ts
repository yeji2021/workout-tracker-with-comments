import { MUSCLE_GROUPS, type MuscleGroup } from './types'
import type { PR, WeekCompare } from './stats'

// 통계치를 채운 AI 상담 프롬프트 텍스트를 만든다 (복사해서 챗봇에 붙여넣기용).
export function buildAiPrompt(params: {
  periodLabel: string
  dayCount: number
  volume: Record<MuscleGroup, number>
  week: WeekCompare
  prs: PR[]
}): string {
  const { periodLabel, dayCount, volume, week, prs } = params
  const fmt = (n: number) => Math.round(n).toLocaleString()

  const volLines = MUSCLE_GROUPS.map(
    (g) => `- ${g}: ${fmt(volume[g])} kg`,
  ).join('\n')

  const diffLines = MUSCLE_GROUPS.filter((g) => Math.abs(week.diff[g]) >= 1)
    .sort((a, b) => Math.abs(week.diff[b]) - Math.abs(week.diff[a]))
    .map((g) => {
      const d = week.diff[g]
      return `- ${g}: ${d > 0 ? '+' : ''}${fmt(d)} kg (${d > 0 ? '증가' : '감소'})`
    })
    .join('\n')

  const prLines = prs
    .slice(0, 10)
    .map((p) => `- ${p.exerciseName}: ${p.weight}kg × ${p.reps}회`)
    .join('\n')

  return `너는 나의 개인 웨이트 트레이닝 코치야. 아래는 내 최근 운동 통계 데이터야. 이 데이터를 분석해서 (1) 잘하고 있는 점, (2) 부위별 불균형이나 부족한 점, (3) 다음 주에 집중하면 좋을 부위와 구체적인 운동/세트 제안을 알려줘. 부상 예방 관점도 포함해줘.

[집계 기간] ${periodLabel}
[운동한 날] ${dayCount}일

[부위별 총 볼륨(무게×횟수)]
${volLines}

[최근 7일 vs 이전 7일 변화]
${diffLines || '- 비교할 데이터가 충분하지 않음'}

[개인 최고기록(무게 기준 상위)]
${prLines || '- 기록 없음'}

한국어로, 실천 가능한 구체적인 조언 위주로 답해줘.`
}
