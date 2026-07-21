// 휴식 타이머 종료 알림음. iOS Safari는 사용자 제스처 안에서 최초 재생해야
// 이후 프로그래매틱 재생이 풀리므로, 세트 완료 탭(제스처) 시점에 unlockAudio()로
// AudioContext를 미리 만들어둔다.
let ctx: AudioContext | null = null

const MUTE_KEY = 'wt_rest_sound_muted'

export function isRestSoundMuted(): boolean {
  return localStorage.getItem(MUTE_KEY) === '1'
}

export function setRestSoundMuted(muted: boolean): void {
  localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
}

export function unlockAudio(): void {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    return
  }
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext
  if (!Ctor) return
  try {
    ctx = new Ctor()
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  } catch {
    ctx = null
  }
}

// 탭이 백그라운드에 있는 동안 브라우저가 AudioContext를 suspend시키는 경우가 있어,
// 다시 보이게 되는 시점에 즉시 resume해둔다(휴식 종료 비프가 그 사이 울려야 할 때 대비).
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && ctx?.state === 'suspended') {
      ctx.resume().catch(() => {})
    }
  })
}

// 3연타 비프음. 재생 직전 컨텍스트가 suspended면(백그라운드 절전 등) 먼저 resume한 뒤 재생해
// "소리가 아예 안 들리는" 실패를 막는다.
export function playRestDoneBeep(): void {
  if (isRestSoundMuted() || !ctx) return
  const activeCtx = ctx
  const fire = () => {
    const now = activeCtx.currentTime
    for (const offset of [0, 0.2, 0.4]) {
      const osc = activeCtx.createOscillator()
      const gain = activeCtx.createGain()
      osc.type = 'sine'
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0, now + offset)
      gain.gain.linearRampToValueAtTime(0.6, now + offset + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.22)
      osc.connect(gain)
      gain.connect(activeCtx.destination)
      osc.start(now + offset)
      osc.stop(now + offset + 0.24)
    }
  }
  if (activeCtx.state === 'suspended') {
    activeCtx.resume().then(fire).catch(() => {})
  } else {
    fire()
  }
}

export function vibrateRestDone(): void {
  if ('vibrate' in navigator) navigator.vibrate([200, 100, 200])
}
