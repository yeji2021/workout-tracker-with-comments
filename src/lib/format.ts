// ── 표시 포맷 유틸 ───────────────────────────────────────────────────

// 볼륨(무게×횟수, kg)을 화면 표기용 문자열로.
// 한국 리프터는 kg 단위로 사고하므로 톤(t) 대신 kg + 천단위 콤마로 통일한다.
// (캘린더 히트맵·AI 프롬프트도 kg 표기라 앱 전체가 일관됨)
export function fmtVolume(n: number): string {
  return `${Math.round(n).toLocaleString()}kg`
}

// 큰 볼륨을 체감 가능한 사물 무게로 환산 (주간 리캡용 재미 요소)
const VOLUME_COMPARISONS: { kg: number; label: string; emoji: string; counter: string }[] = [
  { kg: 40000, label: '흰수염고래', emoji: '🐋', counter: '마리' },
  { kg: 11000, label: '2층 버스', emoji: '🚌', counter: '대' },
  { kg: 4000, label: '아프리카 코끼리', emoji: '🐘', counter: '마리' },
  { kg: 1500, label: '경차', emoji: '🚗', counter: '대' },
  { kg: 90, label: '성인', emoji: '🧍', counter: '명' },
]
export function volumeComparison(kg: number): string | null {
  for (const c of VOLUME_COMPARISONS) {
    if (kg >= c.kg) {
      const count = Math.max(1, Math.round(kg / c.kg))
      return `${c.emoji} ${c.label} ${count}${c.counter}`
    }
  }
  return null
}
