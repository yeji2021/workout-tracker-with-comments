// ── 표시 포맷 유틸 ───────────────────────────────────────────────────

// 볼륨(무게×횟수, kg)을 화면 표기용 문자열로.
// 한국 리프터는 kg 단위로 사고하므로 톤(t) 대신 kg + 천단위 콤마로 통일한다.
// (캘린더 히트맵·AI 프롬프트도 kg 표기라 앱 전체가 일관됨)
export function fmtVolume(n: number): string {
  return `${Math.round(n).toLocaleString()}kg`
}
