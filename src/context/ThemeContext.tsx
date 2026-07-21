import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import {
  DEFAULT_THEME,
  THEMES,
  THEME_STORAGE_KEY,
  isThemeId,
  type ThemeId,
} from '../lib/theme'

interface ThemeContextValue {
  theme: ThemeId
  setTheme: (id: ThemeId) => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

// 저장된 테마를 즉시 읽는다. index.html 의 FOUC 방지 스크립트가 이미
// <html data-theme> 를 세팅해 뒀으므로 그 값과 동기화된다.
function readStoredTheme(): ThemeId {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY)
    if (isThemeId(saved)) return saved
  } catch {
    // localStorage 접근 불가(프라이빗 모드 등) — 기본값 사용
  }
  return DEFAULT_THEME
}

// <html data-theme> + PWA theme-color 메타를 실제로 적용한다.
function applyTheme(id: ThemeId) {
  document.documentElement.dataset.theme = id
  const meta = THEMES.find((t) => t.id === id)
  if (meta) {
    const tag = document.querySelector('meta[name="theme-color"]')
    if (tag) tag.setAttribute('content', meta.themeColor)
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(readStoredTheme)

  // 마운트 시 및 테마 변경 시 DOM/저장소 동기화
  useEffect(() => {
    applyTheme(theme)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      // 저장 실패는 무시 — 세션 내에서는 계속 동작
    }
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme: setThemeState }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
