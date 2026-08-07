// 홈 화면 PWA(standalone)는 화면이 잠기는 순간 JS 실행 자체가 통째로 멈춘다.
// 휴식 타이머가 오디오 클럭에 비프를 미리 예약해둬도, 그 시각이 되기 전에
// 화면이 자동으로 꺼지면 재생 자체가 일어나지 않는다(휴식 시간 30~90초는
// iOS 기본 자동 잠금 시간보다 짧은 경우가 흔해 실제로 자주 발생한다).
// 휴식 중에는 화면 잠금을 막아 이 문제를 원천 차단한다.
let sentinel: WakeLockSentinel | null = null

export async function acquireWakeLock(): Promise<void> {
  if (!('wakeLock' in navigator)) return
  try {
    sentinel = await navigator.wakeLock.request('screen')
  } catch {
    // 배터리 절약 모드 등으로 거부될 수 있음 — 화면 잠금 방지만 못할 뿐이라 무시
    sentinel = null
  }
}

export function releaseWakeLock(): void {
  const s = sentinel
  sentinel = null
  s?.release().catch(() => {})
}
