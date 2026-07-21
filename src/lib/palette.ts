import {
  contrastRatio,
  ensureContrast,
  hexToRgb,
  hslToRgb,
  relativeLuminance,
  rgbToHex,
  rgbToHsl,
  type RGB,
} from './color'
import type { CustomPalette } from './theme'

// ── 이미지 → 대표 색 추출 (median cut) ──────────────────────────

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('이미지를 불러오지 못했어요'))
    }
    img.src = url
  })
}

// 이미지를 작게 줄여 픽셀(RGB) 배열로. 투명 픽셀은 제외.
function getPixels(img: HTMLImageElement, maxSize = 120): RGB[] {
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('캔버스를 만들 수 없어요')
  ctx.drawImage(img, 0, 0, w, h)
  const { data } = ctx.getImageData(0, 0, w, h)
  const pixels: RGB[] = []
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue // 반투명/투명 제외
    pixels.push({ r: data[i], g: data[i + 1], b: data[i + 2] })
  }
  return pixels
}

type Channel = 'r' | 'g' | 'b'

function channelRange(bucket: RGB[], ch: Channel): number {
  let min = 255
  let max = 0
  for (const p of bucket) {
    if (p[ch] < min) min = p[ch]
    if (p[ch] > max) max = p[ch]
  }
  return max - min
}

function averageColor(bucket: RGB[]): RGB {
  let r = 0
  let g = 0
  let b = 0
  for (const p of bucket) {
    r += p.r
    g += p.g
    b += p.b
  }
  const n = bucket.length || 1
  return { r: r / n, g: g / n, b: b / n }
}

function medianCut(pixels: RGB[], count: number): RGB[] {
  if (pixels.length === 0) return []
  let buckets: RGB[][] = [pixels]
  while (buckets.length < count) {
    // 채널 범위가 가장 큰 버킷을 찾아 그 채널 중앙값에서 쪼갠다.
    let bestIdx = -1
    let bestRange = 0
    let bestCh: Channel = 'r'
    buckets.forEach((bk, i) => {
      if (bk.length < 2) return
      for (const ch of ['r', 'g', 'b'] as Channel[]) {
        const range = channelRange(bk, ch)
        if (range > bestRange) {
          bestRange = range
          bestIdx = i
          bestCh = ch
        }
      }
    })
    if (bestIdx < 0) break
    const bk = buckets[bestIdx]
    bk.sort((a, b) => a[bestCh] - b[bestCh])
    const mid = Math.floor(bk.length / 2)
    buckets.splice(bestIdx, 1, bk.slice(0, mid), bk.slice(mid))
  }
  // 큰 버킷(이미지에서 넓은 면적) 우선 정렬
  return buckets
    .filter((b) => b.length > 0)
    .sort((a, b) => b.length - a.length)
    .map(averageColor)
}

export async function extractColors(file: File, count = 6): Promise<string[]> {
  const img = await loadImage(file)
  const pixels = getPixels(img)
  return medianCut(pixels, count).map(rgbToHex)
}

// ── 추출 색 → 시맨틱 팔레트 매핑 ────────────────────────────────

export function buildCustomPalette(colors: string[]): CustomPalette {
  const src = colors.map(hexToRgb)
  const hsls = src.map(rgbToHsl)

  // 라이트/다크 결정 — 면적이 가장 넓은 지배색(colors[0], 보통 배경) 기준.
  // 평균을 쓰면 어두운 소수 색이 결과를 다크로 끌어내려 배경 넓은 밝은 이미지가 오판된다.
  const isDark = relativeLuminance(src[0]) < 0.5

  // accent = 가장 채도 높은 색, seed hue 도 여기서
  let accentIdx = 0
  let bestS = -1
  hsls.forEach((h, i) => {
    if (h.s > bestS) {
      bestS = h.s
      accentIdx = i
    }
  })
  const seedHue = hsls[accentIdx].h
  const nSat = Math.min(28, Math.max(8, hsls[accentIdx].s * 0.35))
  const neutral = (l: number, s = nSat) => hslToRgb({ h: seedHue, s, l })

  // 중립 램프 (배경/카드/테두리) — seed hue 를 살짝 머금음
  const bg = isDark ? neutral(7) : neutral(93, nSat * 0.7)
  const surface = isDark ? neutral(11) : neutral(98, nSat * 0.5)
  const surface2 = isDark ? neutral(15) : neutral(88)
  const border = isDark ? neutral(22) : neutral(80)

  // 텍스트 — 대비 보정
  let text = hslToRgb({ h: seedHue, s: Math.min(nSat, 25), l: isDark ? 92 : 20 })
  text = ensureContrast(text, bg, 6, isDark ? 'lighter' : 'darker')
  let textDim = hslToRgb({ h: seedHue, s: Math.min(nSat, 18), l: isDark ? 62 : 46 })
  textDim = ensureContrast(textDim, bg, 2.8, isDark ? 'lighter' : 'darker')

  // accent — 채도 확보 + 대비 보정
  const ah = hsls[accentIdx]
  let accent = hslToRgb({
    h: ah.h,
    s: Math.max(ah.s, 45),
    l: isDark ? Math.max(ah.l, 55) : Math.min(ah.l, 52),
  })
  accent = ensureContrast(accent, bg, 3, isDark ? 'lighter' : 'darker')

  const accentSoft = isDark
    ? hslToRgb({ h: seedHue, s: 40, l: 26 })
    : hslToRgb({ h: seedHue, s: 55, l: 82 })

  // 근육 6색 — 추출 색 기반, 트랙(surface2) 대비 확보, 색이 모자라면 hue 회전
  const muscles: string[] = []
  for (let i = 0; i < 6; i++) {
    const base = hsls[i % hsls.length]
    const hue = i < hsls.length ? base.h : (base.h + i * 47) % 360
    let m = hslToRgb({ h: hue, s: Math.max(base.s, 45), l: isDark ? 62 : 48 })
    m = ensureContrast(m, surface2, 1.6, isDark ? 'lighter' : 'darker')
    muscles.push(rgbToHex(m))
  }

  return {
    '--color-bg': rgbToHex(bg),
    '--color-surface': rgbToHex(surface),
    '--color-surface-2': rgbToHex(surface2),
    '--color-border': rgbToHex(border),
    '--color-accent': rgbToHex(accent),
    '--color-accent-soft': rgbToHex(accentSoft),
    '--color-text': rgbToHex(text),
    '--color-text-dim': rgbToHex(textDim),
    '--color-danger': isDark ? '#ff5a5a' : '#e5484d',
    '--color-success': isDark ? '#35c07a' : '#2f9e63',
    '--color-muscle-1': muscles[0],
    '--color-muscle-2': muscles[1],
    '--color-muscle-3': muscles[2],
    '--color-muscle-4': muscles[3],
    '--color-muscle-5': muscles[4],
    '--color-muscle-6': muscles[5],
  }
}

// 미리보기 배지용 — 팔레트가 어두운지
export function isPaletteDark(p: CustomPalette): boolean {
  return relativeLuminance(hexToRgb(p['--color-bg'])) < 0.45
}

// bg 대비 text 대비비 (편집 UI 경고용)
export function paletteContrast(p: CustomPalette): number {
  return contrastRatio(hexToRgb(p['--color-text']), hexToRgb(p['--color-bg']))
}
