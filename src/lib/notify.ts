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
const NOTIFY_TAG = 'rest-done'

// iOS Safari(홈 화면 PWA 포함)는 페이지 컨텍스트의 `new Notification()` 생성자를
// 지원하지 않는다(호출 시 예외 발생) — 권한 확인용 Notification.permission/
// requestPermission만 페이지에서 쓸 수 있고, 실제 표시는 반드시
// ServiceWorkerRegistration.showNotification()을 거쳐야 한다. 이 앱은 이미 SW를
// 등록해두었으므로(UpdateToast) 그 경로를 우선 쓰고, 없으면(구형 브라우저) 기존
// 방식으로 폴백한다.
async function showNotification(title: string, options: NotificationOptions): Promise<void> {
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready
      await reg.showNotification(title, options)
      return
    } catch {
      // SW 경로 실패 — 아래 폴백 시도
    }
  }
  try {
    activeNotification = new Notification(title, options)
    activeNotification.onclick = () => {
      window.focus()
      activeNotification?.close()
    }
  } catch {
    // iOS 등 페이지 컨텍스트 Notification 생성자 미지원 — 조용히 무시
  }
}

// 타이머 종료 팝업 알림 일반화 버전 — 휴식/운동 타이머가 제목·본문만 다르게 넘겨 공유한다.
// 슬롯은 하나뿐이라(timerId/activeNotification) 동시에 하나만 예약 가능 — 휴식·운동
// 타이머가 동시에 뜨지 않는다는 앱 규칙과도 맞는다(SUPERSET-AND-TIME.md 3.1 동시성 참고).
export function scheduleTimerNotification(
  endsAt: number,
  opts: { title: string; body: string }
): void {
  cancelTimerNotification()
  if (!isRestNotifyEnabled() || !canNotify() || Notification.permission !== 'granted') return
  const delay = Math.max(0, endsAt - Date.now())
  timerId = setTimeout(() => {
    showNotification(opts.title, {
      body: opts.body,
      tag: NOTIFY_TAG,
    })
  }, delay)
}

export function cancelTimerNotification(): void {
  if (timerId != null) {
    clearTimeout(timerId)
    timerId = null
  }
  if (activeNotification) {
    activeNotification.close()
    activeNotification = null
  }
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((reg) => reg.getNotifications({ tag: NOTIFY_TAG }))
      .then((notifications) => notifications.forEach((n) => n.close()))
      .catch(() => {})
  }
}

export function scheduleRestNotification(endsAt: number, exerciseName?: string): void {
  scheduleTimerNotification(endsAt, {
    title: '휴식 끝! 💪',
    body: exerciseName ? `${exerciseName} 다음 세트 시작해요` : '다음 세트 시작해요',
  })
}

export function cancelRestNotification(): void {
  cancelTimerNotification()
}
