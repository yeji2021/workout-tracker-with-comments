// 색 변환 · 대비 계산 유틸 (외부 의존성 없음).

export interface RGB {
  r: number
  g: number
  b: number
}
export interface HSL {
  h: number // 0–360
  s: number // 0–100
  l: number // 0–100
}

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '')
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h
  const n = parseInt(full, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

export function rgbToHex({ r, g, b }: RGB): string {
  const to = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, '0')
  return '#' + to(r) + to(g) + to(b)
}

export function rgbToHsl({ r, g, b }: RGB): HSL {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        h = (b - r) / d + 2
        break
      default:
        h = (r - g) / d + 4
    }
    h /= 6
  }
  return { h: h * 360, s: s * 100, l: l * 100 }
}

export function hslToRgb({ h, s, l }: HSL): RGB {
  h /= 360
  s /= 100
  l /= 100
  if (s === 0) {
    const v = l * 255
    return { r: v, g: v, b: v }
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return {
    r: hue2rgb(p, q, h + 1 / 3) * 255,
    g: hue2rgb(p, q, h) * 255,
    b: hue2rgb(p, q, h - 1 / 3) * 255,
  }
}

// WCAG 상대 휘도
export function relativeLuminance({ r, g, b }: RGB): number {
  const f = (c: number) => {
    c /= 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

// WCAG 대비비 (1–21)
export function contrastRatio(a: RGB, b: RGB): number {
  const l1 = relativeLuminance(a)
  const l2 = relativeLuminance(b)
  const hi = Math.max(l1, l2)
  const lo = Math.min(l1, l2)
  return (hi + 0.05) / (lo + 0.05)
}

// fg 의 밝기를 조금씩 밀어 bg 와의 대비가 target 이상이 되게 한다.
export function ensureContrast(
  fg: RGB,
  bg: RGB,
  target: number,
  dir: 'lighter' | 'darker',
): RGB {
  const hsl = rgbToHsl(fg)
  let cur = fg
  let guard = 0
  while (contrastRatio(cur, bg) < target && guard++ < 40) {
    hsl.l += dir === 'lighter' ? 3 : -3
    if (hsl.l <= 0 || hsl.l >= 100) {
      hsl.l = Math.max(0, Math.min(100, hsl.l))
      cur = hslToRgb(hsl)
      break
    }
    cur = hslToRgb(hsl)
  }
  return cur
}
