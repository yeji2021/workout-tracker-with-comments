// 테마 메타데이터.
// 실제 색 값은 src/index.css 의 :root[data-theme='...'] 블록에 있고,
// 여기서는 설정 화면 카드 렌더링 + PWA theme-color 갱신에 쓰는 정보만 둔다.

export type ThemeId = 'dark' | 'light' | 'rilakkuma'

export interface ThemeMeta {
  id: ThemeId
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

export const DEFAULT_THEME: ThemeId = 'dark'
export const THEME_STORAGE_KEY = 'wt-theme'

export function isThemeId(v: unknown): v is ThemeId {
  return v === 'dark' || v === 'light' || v === 'rilakkuma'
}
