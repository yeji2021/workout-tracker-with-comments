import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import {
  CUSTOM_PALETTE_KEY,
  DEFAULT_THEME,
  THEMES,
  THEME_STORAGE_KEY,
  THEME_VARS,
  isCustomPalette,
  isThemeId,
  type CustomPalette,
  type ThemeId,
} from '../lib/theme'

interface ThemeContextValue {
  theme: ThemeId
  setTheme: (id: ThemeId) => void
  customPalette: CustomPalette | null
  // 커스텀 팔레트를 저장하고 즉시 적용(theme='custom')
  saveCustomPalette: (p: CustomPalette) => void
  clearCustomPalette: () => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

function readStoredTheme(): ThemeId {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY)
    if (isThemeId(saved)) return saved
  } catch {
    // localStorage 접근 불가 — 기본값
  }
  return DEFAULT_THEME
}

function readStoredPalette(): CustomPalette | null {
  try {
    const raw = localStorage.getItem(CUSTOM_PALETTE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (isCustomPalette(parsed)) return parsed
  } catch {
    // 파싱 실패 — 커스텀 없음 처리
  }
  return null
}

function setThemeColorMeta(color: string | undefined) {
  if (!color) return
  const tag = document.querySelector('meta[name="theme-color"]')
  if (tag) tag.setAttribute('content', color)
}

// <html> 에 테마를 실제 적용한다. 프리셋은 data-theme 로,
// 커스텀은 인라인 CSS 변수로 (인라인이 스타일시트를 이긴다).
function applyTheme(id: ThemeId, palette: CustomPalette | null) {
  const root = document.documentElement
  // 이전 커스텀 인라인 변수 제거
  THEME_VARS.forEach((v) => root.style.removeProperty(v))

  if (id === 'custom' && palette) {
    root.dataset.theme = 'custom'
    THEME_VARS.forEach((v) => root.style.setProperty(v, palette[v]))
    setThemeColorMeta(palette['--color-bg'])
  } else {
    const resolved: ThemeId = id === 'custom' ? DEFAULT_THEME : id
    root.dataset.theme = resolved
    setThemeColorMeta(THEMES.find((t) => t.id === resolved)?.themeColor)
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [customPalette, setCustomPalette] = useState<CustomPalette | null>(
    readStoredPalette,
  )
  const [theme, setThemeState] = useState<ThemeId>(() => {
    const t = readStoredTheme()
    // 저장된 팔레트가 없는데 custom 이면 기본으로 폴백
    if (t === 'custom' && !readStoredPalette()) return DEFAULT_THEME
    return t
  })

  useEffect(() => {
    applyTheme(theme, customPalette)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      // 저장 실패 무시
    }
  }, [theme, customPalette])

  function saveCustomPalette(p: CustomPalette) {
    try {
      localStorage.setItem(CUSTOM_PALETTE_KEY, JSON.stringify(p))
    } catch {
      // 저장 실패해도 세션 내 적용은 진행
    }
    setCustomPalette(p)
    setThemeState('custom')
  }

  function clearCustomPalette() {
    try {
      localStorage.removeItem(CUSTOM_PALETTE_KEY)
    } catch {
      // 무시
    }
    setCustomPalette(null)
    setThemeState((cur) => (cur === 'custom' ? DEFAULT_THEME : cur))
  }

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme: setThemeState,
        customPalette,
        saveCustomPalette,
        clearCustomPalette,
      }}
    >
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
