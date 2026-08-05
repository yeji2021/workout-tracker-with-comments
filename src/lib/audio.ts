// 휴식 타이머 종료 알림음. iOS Safari는 사용자 제스처 안에서 최초 재생해야
// 이후 프로그래매틱 재생이 풀리므로, 세트 완료 탭(제스처) 시점에 unlockAudio()로
// AudioContext를 미리 만들어둔다. 또한 같은 제스처 안에서 scheduleRestBeep()으로
// 종료 비프를 오디오 클럭에 미리 예약해, 탭이 백그라운드로 가서 setInterval이
// throttle돼도 정확한 시각에 소리가 나도록 한다.
let ctx: AudioContext | null = null

const MUTE_KEY = 'wt_rest_sound_muted'

// 현재 예약된 휴식 종료 비프. endsAt은 실제 시각(ms), at은 오디오 클럭 상 예정 시각(초).
let scheduled: {
  endsAt: number
  at: number
  ctx: AudioContext
  nodes: OscillatorNode[]
  fired: boolean
} | null = null

export function isRestSoundMuted(): boolean {
  return localStorage.getItem(MUTE_KEY) === '1'
}

export function setRestSoundMuted(muted: boolean): void {
  localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
}

// ── AudioContext 관리 ────────────────────────────────────────────
function createCtx(): AudioContext | null {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext
  if (!Ctor) return null
  try {
    return new Ctor()
  } catch {
    return null
  }
}

// iOS는 전화 수신 등으로 컨텍스트가 'interrupted'(webkit 전용 상태)가 되면
// resume으로 살아나지 않는 경우가 있다. 그럴 땐 컨텍스트를 새로 만들어 갈아끼우고,
// 걸려 있던 예약 비프를 새 컨텍스트에 다시 건다.
let lastRecoverAt = 0
function recoverCtx(): void {
  // 실패가 반복될 때 컨텍스트를 무한 재생성하지 않도록 최소 간격을 둔다
  if (Date.now() - lastRecoverAt < 1000) return
  lastRecoverAt = Date.now()
  const dead = ctx
  const pendingEndsAt = scheduled?.endsAt ?? null
  scheduled = null
  ctx = createCtx()
  if (dead) {
    try {
      dead.close()
    } catch {
      // 이미 닫혔거나 닫을 수 없는 상태 — 무시
    }
  }
  if (pendingEndsAt != null && pendingEndsAt > Date.now()) {
    scheduleRestBeep(pendingEndsAt)
  }
}

// 컨텍스트를 "재생 가능한" 상태로 만들어 돌려준다. 사용자 제스처 안에서 부를수록 성공률이 높다.
function ensureCtx(): AudioContext | null {
  if (!ctx) ctx = createCtx()
  if (!ctx) return null
  // 'interrupted'는 표준 타입에 없는 webkit 상태라 문자열로 비교한다
  const state = ctx.state as string
  if (state === 'closed' || state === 'interrupted') {
    recoverCtx()
    return ctx
  }
  if (state === 'suspended') {
    ctx.resume().catch(() => recoverCtx())
  }
  return ctx
}

export function unlockAudio(): void {
  ensureCtx()
}

// 탭이 백그라운드에 있는 동안 브라우저가 AudioContext를 suspend시키는 경우가 있어,
// 다시 보이게 되는 시점에 즉시 resume해둔다(휴식 종료 비프가 그 사이 울려야 할 때 대비).
// 추가로 모든 사용자 제스처에서도 되살린다 — 제스처 밖 resume()은 iOS에서 거부될 수 있다.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && ctx) ensureCtx()
  })
  // 아직 컨텍스트를 만들지 않았다면(운동 시작 전) 여기서 새로 만들지는 않는다
  const onGesture = () => {
    if (ctx) ensureCtx()
  }
  document.addEventListener('pointerdown', onGesture, { capture: true, passive: true })
  document.addEventListener('touchend', onGesture, { capture: true, passive: true })
  document.addEventListener('keydown', onGesture, { capture: true })
}

// ── 비프음 ───────────────────────────────────────────────────────
// 3연타 비프. at(오디오 클럭 시각)에 맞춰 노드를 걸어두고 만들어진 오실레이터를 돌려준다.
function armBeep(target: AudioContext, at: number): OscillatorNode[] {
  const oscs: OscillatorNode[] = []
  for (const offset of [0, 0.2, 0.4]) {
    const osc = target.createOscillator()
    const gain = target.createGain()
    osc.type = 'sine'
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0, at + offset)
    gain.gain.linearRampToValueAtTime(0.6, at + offset + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.001, at + offset + 0.22)
    osc.connect(gain)
    gain.connect(target.destination)
    osc.start(at + offset)
    osc.stop(at + offset + 0.24)
    oscs.push(osc)
  }
  return oscs
}

// 휴식 시작/조정 시점(=사용자 제스처 안)에 종료 비프를 미리 예약한다.
// 오디오 클럭은 타이머와 달리 백그라운드에서도 흐르므로 예정 시각에 정확히 울린다.
export function scheduleRestBeep(endsAtMs: number): void {
  cancelScheduledRestBeep()
  if (isRestSoundMuted()) return
  const target = ensureCtx()
  if (!target) return
  const at = target.currentTime + Math.max(0, (endsAtMs - Date.now()) / 1000)
  try {
    const nodes = armBeep(target, at)
    const entry = { endsAt: endsAtMs, at, ctx: target, nodes, fired: false }
    // 마지막 비프가 끝나면 "실제로 울렸음"으로 표시 → done 시점 폴백의 중복 재생 방지
    nodes[nodes.length - 1].onended = () => {
      if (scheduled === entry) entry.fired = true
    }
    scheduled = entry
  } catch {
    // 예약 실패 — done 시점의 즉시 재생 폴백에 맡긴다
    scheduled = null
  }
}

// 휴식 시간 조정/건너뛰기/음소거 시 기존 예약을 취소한다.
export function cancelScheduledRestBeep(): void {
  if (!scheduled) return
  for (const osc of scheduled.nodes) {
    osc.onended = null
    try {
      // 시작 전 노드를 stop()하면 아예 소리가 나지 않는다
      osc.stop()
    } catch {
      // 이미 끝난 노드 — 무시
    }
    try {
      osc.disconnect()
    } catch {
      // 무시
    }
  }
  scheduled = null
}

// done 시점의 즉시 재생 폴백(예약이 실패했거나 컨텍스트 suspend로 밀린 경우).
// endsAtMs를 넘기면 같은 휴식의 예약 비프와 중복해서 울리지 않도록 확인한다.
export function playRestDoneBeep(endsAtMs?: number): void {
  if (isRestSoundMuted()) return
  if (endsAtMs != null && scheduled && scheduled.endsAt === endsAtMs) {
    // 오디오 클럭이 예정 시각을 지났다 = 예약분이 이미 울렸거나 지금 울리는 중.
    // (여기서 취소하면 3연타가 중간에 끊기므로 그대로 두고 빠진다)
    if (scheduled.fired || scheduled.ctx.currentTime >= scheduled.at) return
    // 아직 안 울렸다면 컨텍스트 suspend 등으로 예약이 밀린 것 — 예약을 버리고 지금 재생한다
    cancelScheduledRestBeep()
  }
  const target = ensureCtx()
  if (!target) return
  const fire = () => armBeep(target, target.currentTime)
  if ((target.state as string) === 'running') {
    fire()
  } else {
    target.resume().then(fire).catch(() => {})
  }
}

export function vibrateRestDone(): void {
  if ('vibrate' in navigator) navigator.vibrate([200, 100, 200])
}
