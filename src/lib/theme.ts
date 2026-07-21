// 테마 메타데이터.
// 프리셋 색 값은 src/index.css 의 :root[data-theme='...'] 블록에 있고,
// 커스텀 테마는 CustomPalette(아래) 를 <html> 인라인 변수로 주입한다.

// 'custom' = 사진에서 만든 사용자 테마
export type ThemeId = 'dark' | 'light' | 'rilakkuma' | 'custom'

export interface ThemeMeta {
  id: Exclude<ThemeId, 'custom'>
  label: string
  emoji: string
  // 카드 미리보기용 스와치 (배경 / 카드 / 강조 / 글자)
  swatch: { bg: string; surface: string; accent: string; text: string }
  // 브라우저/PWA 상단바 색 (index.css bg 와 일치)
  themeColor: string
}

export const THEMES: ThemeMeta[] = [
  {
    id: 'dark',
    label: '다크',
    emoji: '🌙',
    swatch: { bg: '#0b0d10', surface: '#15181d', accent: '#4f7cff', text: '#e8eaed' },
    themeColor: '#0b0d10',
  },
  {
    id: 'light',
    label: '라이트',
    emoji: '☀️',
    swatch: { bg: '#f6f7f9', surface: '#ffffff', accent: '#3b6ef5', text: '#1a1d22' },
    themeColor: '#f6f7f9',
  },
  {
    id: 'rilakkuma',
    label: '리락쿠마',
    emoji: '🐻',
    swatch: { bg: '#f2e2c9', surface: '#fbf3e6', accent: '#a86a34', text: '#4a3524' },
    themeColor: '#f2e2c9',
  },
]

// 하나의 테마를 구성하는 모든 CSS 변수 (프리셋/커스텀 공통).
// 커스텀 팔레트는 이 키들을 그대로 <html> 인라인 스타일로 주입한다.
export const THEME_VARS = [
  '--color-bg',
  '--color-surface',
  '--color-surface-2',
  '--color-border',
  '--color-accent',
  '--color-accent-soft',
  '--color-text',
  '--color-text-dim',
  '--color-danger',
  '--color-success',
  '--color-muscle-1',
  '--color-muscle-2',
  '--color-muscle-3',
  '--color-muscle-4',
  '--color-muscle-5',
  '--color-muscle-6',
] as const

export type ThemeVar = (typeof THEME_VARS)[number]
export type CustomPalette = Record<ThemeVar, string>

export const DEFAULT_THEME: ThemeId = 'dark'
export const THEME_STORAGE_KEY = 'wt-theme'
export const CUSTOM_PALETTE_KEY = 'wt-custom-palette'

export function isThemeId(v: unknown): v is ThemeId {
  return v === 'dark' || v === 'light' || v === 'rilakkuma' || v === 'custom'
}

export function isCustomPalette(v: unknown): v is CustomPalette {
  if (!v || typeof v !== 'object') return false
  const obj = v as Record<string, unknown>
  return THEME_VARS.every((k) => typeof obj[k] === 'string')
}
