// 휴식 종료 팝업 알림. 서버/서비스워커 없이 순수 클라이언트 로컬 예약(setTimeout)만
// 사용한다 — 앱(탭)이 살아있는 동안(다른 앱을 보는 중 포함) 발화하며,
// 앱이 완전히 종료되면 발화하지 않는다(그 케이스는 서버 Web Push가 필요해 2차 범위).
const NOTIFY_KEY = 'wt_rest_notify_enabled'

export function isRestNotifyEnabled(): boolean {
  return localStorage.getItem(NOTIFY_KEY) !== '0'
}

export function setRestNotifyEnabled(enabled: boolean): void {
  localStorage.setItem(NOTIFY_KEY, enabled ? '1' : '0')
}

export function canNotify(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function notifyPermission(): NotificationPermission | null {
  return canNotify() ? Notification.permission : null
}

// 사용자 제스처(세트 완료 탭) 안에서 호출해야 권한 프롬프트가 뜬다.
export async function ensureNotifyPermission(): Promise<void> {
  if (!canNotify() || Notification.permission !== 'default') return
  try {
    await Notification.requestPermission()
  } catch {
    // 무시 — 권한 거부/에러 시 팝업 없이 소리/진동만으로 폴백
  }
}

let timerId: ReturnType<typeof setTimeout> | null = null
let activeNotification: Notification | null = null

export function scheduleRestNotification(endsAt: number, exerciseName?: string): void {
  cancelRestNotification()
  if (!isRestNotifyEnabled() || !canNotify() || Notification.permission !== 'granted') return
  const delay = Math.max(0, endsAt - Date.now())
  timerId = setTimeout(() => {
    activeNotification = new Notification('휴식 끝! 💪', {
      body: exerciseName ? `${exerciseName} 다음 세트 시작해요` : '다음 세트 시작해요',
      tag: 'rest-done',
    })
    activeNotification.onclick = () => {
      window.focus()
      activeNotification?.close()
    }
  }, delay)
}

export function cancelRestNotification(): void {
  if (timerId != null) {
    clearTimeout(timerId)
    timerId = null
  }
  if (activeNotification) {
    activeNotification.close()
    activeNotification = null
  }
}
