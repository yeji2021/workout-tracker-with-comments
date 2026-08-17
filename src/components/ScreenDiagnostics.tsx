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

function collect() {
  const env = readEnvInsets()
  const nav = document.querySelector('nav.tabbar')
  const navR = nav?.getBoundingClientRect()
  const navCS = nav ? getComputedStyle(nav) : null
  const afterCS = nav ? getComputedStyle(nav, '::after') : null
  const rootCS = getComputedStyle(document.documentElement)
  const css = [...document.styleSheets]
    .map((s) => s.href)
    .filter((h): h is string => !!h && h.includes('assets/'))
    .map((h) => h.split('/').pop())

  return {
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
    // 3) 탭바가 실제로 화면 바닥까지 닿아 있는가
    navTop: navR?.top,
    navBottom: navR?.bottom,
    navHeight: navR?.height,
    navPadBottom: navCS?.paddingBottom,
    gapBelowNav: navR ? window.innerHeight - navR.bottom : null,
    // 4) 각 레이어 색 — 띠 색과 대조하면 누가 칠했는지 나온다
    colorHtml: rootCS.backgroundColor,
    colorBody: getComputedStyle(document.body).backgroundColor,
    colorNav: navCS?.backgroundColor,
    colorNavAfter: afterCS?.backgroundColor,
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
          <li>🟩 초록 — 탭바 배경 연장(::after)</li>
          <li>🟦 파랑 — body</li>
          <li>🟪 보라 — html</li>
          <li>🟨 노랑 — 앱 래퍼 / 🩵 하늘 — 콘텐츠 영역</li>
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
          <pre className="mt-2 overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-[10px] leading-relaxed">
            {text}
          </pre>
        </>
      )}
    </section>
  )
}
