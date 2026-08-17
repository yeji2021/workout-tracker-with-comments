import { useEffect, useState } from 'react'

// 탭바 아래 여백 띠 원인 추적용 진단 패널.
// 데스크톱 시뮬레이션(safe-area 주입)에서는 정상인데 실제 아이폰 홈 화면
// 앱에서만 재현되는 상태라, 기기에서 직접 값을 읽어야 원인을 좁힐 수 있다.

// env(safe-area-inset-*) 는 getComputedStyle 로 읽으면 env(...) 토큰 그대로
// 나온다. 실제 픽셀값은 프로브 엘리먼트의 높이를 재는 수밖에 없다.
function readEnvInsets() {
  const probe = document.createElement('div')
  probe.style.cssText =
    'position:fixed;left:-9999px;top:0;visibility:hidden;' +
    'padding-top:env(safe-area-inset-top,0px);' +
    'padding-bottom:env(safe-area-inset-bottom,0px);' +
    'padding-left:env(safe-area-inset-left,0px);' +
    'padding-right:env(safe-area-inset-right,0px);'
  document.body.appendChild(probe)
  const cs = getComputedStyle(probe)
  const v = {
    top: cs.paddingTop,
    bottom: cs.paddingBottom,
    left: cs.paddingLeft,
    right: cs.paddingRight,
  }
  probe.remove()
  return v
}

// 화면 맨 아래 픽셀들의 "주인"을 직접 캐묻는다. 이게 이 진단의 핵심 —
// 색 해석에 의존하지 않고 어느 엘리먼트가 그 자리를 차지하는지 확정한다.
//  · 맨 아래(1px)의 주인이 NAV  → 탭바가 화면 바닥까지 닿아 있다는 뜻이고,
//    그래도 띠가 보인다면 그건 웹뷰 바깥(iOS 시스템 영역)이라 CSS 로는 못 고친다
//  · BODY/HTML/#root → 셸이나 탭바가 짧다는 뜻 (레이아웃 문제)
function probeBottom() {
  const x = Math.round(window.innerWidth / 2)
  return [1, 3, 6, 12, 20, 34, 50, 90].map((k) => {
    const y = window.innerHeight - k
    const el = document.elementFromPoint(x, y)
    let id = '(없음)'
    if (el) {
      const cls =
        typeof el.className === 'string' && el.className
          ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
          : ''
      id = `${el.tagName}${el.id ? '#' + el.id : ''}${cls}`
    }
    return {
      // 화면 바닥에서 위로 k 픽셀
      up: k,
      el: id.slice(0, 48),
      bg: el ? getComputedStyle(el).backgroundColor : null,
    }
  })
}

function collect() {
  const env = readEnvInsets()
  const nav = document.querySelector('nav')
  const shell = document.querySelector('.app-shell')
  const navR = nav?.getBoundingClientRect()
  const navCS = nav ? getComputedStyle(nav) : null
  const shellR = shell?.getBoundingClientRect()
  const rootCS = getComputedStyle(document.documentElement)
  const css = [...document.styleSheets]
    .map((s) => s.href)
    .filter((h): h is string => !!h && h.includes('assets/'))
    .map((h) => h.split('/').pop())

  return {
    // 0) 화면 최하단 픽셀의 주인 — 가장 중요한 값
    bottomPixels: probeBottom(),
    // 1) 웹뷰가 화면 전체를 쓰고 있는가 (viewport-fit=cover 가 먹었는가)
    env,
    innerHeight: window.innerHeight,
    screenHeight: window.screen.height,
    visualViewport: window.visualViewport?.height ?? null,
    devicePixelRatio: window.devicePixelRatio,
    // 2) 홈 화면 앱으로 실행 중인가
    standalone: (navigator as { standalone?: boolean }).standalone ?? null,
    displayMode: ['standalone', 'fullscreen', 'minimal-ui', 'browser'].find(
      (m) => matchMedia(`(display-mode: ${m})`).matches,
    ),
    // 3) 셸과 탭바가 실제로 화면 바닥까지 닿아 있는가
    shellHeight: shellR?.height,
    shellBottom: shellR?.bottom,
    gapBelowShell: shellR ? window.innerHeight - shellR.bottom : null,
    navPosition: navCS?.position,
    navTop: navR?.top,
    navBottom: navR?.bottom,
    navHeight: navR?.height,
    navPadBottom: navCS?.paddingBottom,
    gapBelowNav: navR ? window.innerHeight - navR.bottom : null,
    // 4) 각 레이어 색 — 띠 색과 대조하면 누가 칠했는지 나온다
    colorHtml: rootCS.backgroundColor,
    colorBody: getComputedStyle(document.body).backgroundColor,
    colorShell: shell ? getComputedStyle(shell).backgroundColor : null,
    colorNav: navCS?.backgroundColor,
    themeColorMeta: document
      .querySelector('meta[name="theme-color"]')
      ?.getAttribute('content'),
    theme: document.documentElement.dataset.theme,
    tabbarContentH: rootCS.getPropertyValue('--tabbar-content-h').trim(),
    // 5) 지금 폰이 실행 중인 빌드 (구버전 캐시 여부 확인)
    css,
    ua: navigator.userAgent,
  }
}

export function ScreenDiagnostics() {
  const [data, setData] = useState<ReturnType<typeof collect> | null>(null)
  const [painted, setPainted] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    document.documentElement.classList.toggle('debug-layers', painted)
    return () => document.documentElement.classList.remove('debug-layers')
  }, [painted])

  const text = data ? JSON.stringify(data, null, 2) : ''

  return (
    <section className="mt-8">
      <h2 className="mb-1 text-sm font-semibold text-[var(--color-text)]">
        화면 진단
      </h2>
      <p className="mb-3 text-xs text-[var(--color-text-dim)]">
        탭바 아래 여백 띠 원인 추적용이에요. 레이어 색칠을 켜고 홈 화면으로
        간 뒤 스크린샷을 찍으면, 띠가 무슨 색인지로 범인이 바로 나와요.
      </p>

      <button
        onClick={() => setPainted((v) => !v)}
        className="mb-2 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] py-3 text-sm font-semibold transition-colors hover:bg-[var(--color-surface-2)]"
      >
        {painted ? '레이어 색칠 끄기' : '레이어 색칠 켜기'}
      </button>

      {painted && (
        <ul className="mb-2 space-y-1 rounded-xl border border-[var(--color-border)] p-3 text-xs">
          <li>🟥 빨강 — 탭바 본체</li>
          <li>🟦 파랑 — body</li>
          <li>🟪 보라 — html</li>
          <li>🟨 노랑 — 앱 셸 / 🩵 하늘 — 콘텐츠 영역</li>
          <li className="pt-1 font-semibold">
            띠가 이 중 아무 색도 아니면(검정·회색 등) 웹 화면 바깥, 즉 iOS가
            직접 칠하는 영역이에요.
          </li>
        </ul>
      )}

      <button
        onClick={() => setData(collect())}
        className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] py-3 text-sm font-semibold transition-colors hover:bg-[var(--color-surface-2)]"
      >
        측정값 읽기
      </button>

      {data && (
        <>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(text)
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              } catch {
                setCopied(false)
              }
            }}
            className="mt-2 w-full rounded-xl border border-[var(--color-accent)] py-2 text-sm font-semibold text-[var(--color-accent)]"
          >
            {copied ? '복사됨 ✓' : '결과 복사하기'}
          </button>
          {/* 스크린샷만 보내도 읽히도록 이 표는 크게 렌더한다 */}
          <div className="mt-3 rounded-xl border-2 border-[var(--color-accent)] p-3">
            <div className="mb-2 text-sm font-bold">
              화면 바닥 픽셀의 주인
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[var(--color-text-dim)]">
                  <th className="pb-1 text-left font-semibold">바닥에서</th>
                  <th className="pb-1 text-left font-semibold">엘리먼트</th>
                </tr>
              </thead>
              <tbody>
                {data.bottomPixels.map((p) => (
                  <tr key={p.up} className="border-t border-[var(--color-border)]">
                    <td className="py-1 pr-2 whitespace-nowrap tabular-nums">
                      {p.up}px 위
                    </td>
                    <td className="py-1 font-mono text-[10px] break-all">
                      {p.el}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-[var(--color-text-dim)]">
              맨 윗줄(1px 위)이 <b>NAV</b> 면 탭바가 화면 바닥까지 닿은
              것이고, 그래도 띠가 보이면 웹 화면 바깥이라는 뜻이에요.
            </p>
          </div>
          <pre className="mt-2 overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-[10px] leading-relaxed">
            {text}
          </pre>
        </>
      )}
    </section>
  )
}
