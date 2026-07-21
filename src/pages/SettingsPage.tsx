import { useRef, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProfile } from '../context/ProfileContext'
import { useTheme } from '../context/ThemeContext'
import { THEMES, type CustomPalette, type ThemeVar } from '../lib/theme'
import {
  buildCustomPalette,
  extractColors,
  paletteContrast,
} from '../lib/palette'
import { MuscleBars } from '../components/MuscleBars'
import type { MuscleGroup } from '../lib/types'

const PREVIEW_DATA: Record<MuscleGroup, number> = {
  가슴: 8,
  등: 6,
  어깨: 4,
  하체: 7,
  팔: 5,
  코어: 3,
}

// 편집 UI 에 노출할 색 슬롯
const PRIMARY_FIELDS: { key: ThemeVar; label: string }[] = [
  { key: '--color-bg', label: '배경' },
  { key: '--color-surface', label: '카드' },
  { key: '--color-accent', label: '강조' },
  { key: '--color-text', label: '글자' },
]
const DETAIL_FIELDS: { key: ThemeVar; label: string }[] = [
  { key: '--color-surface-2', label: '카드(진한)' },
  { key: '--color-border', label: '테두리' },
  { key: '--color-accent-soft', label: '강조 배경' },
  { key: '--color-text-dim', label: '흐린 글자' },
  { key: '--color-danger', label: '위험' },
  { key: '--color-success', label: '성공' },
]
const MUSCLE_FIELDS: { key: ThemeVar; label: string }[] = [1, 2, 3, 4, 5, 6].map(
  (n) => ({ key: `--color-muscle-${n}` as ThemeVar, label: `근육${n}` }),
)

function paletteStyle(p: CustomPalette): CSSProperties {
  return { ...p } as CSSProperties
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="flex flex-col items-center gap-1">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-9 cursor-pointer rounded-lg border border-[var(--color-border)] bg-transparent p-0"
        aria-label={label}
      />
      <span className="text-[10px] text-[var(--color-text-dim)]">{label}</span>
    </label>
  )
}

// 커스텀 팔레트를 실제 앱 UI 조각으로 미리보기 (변수 스코프를 이 박스에 한정)
function ThemePreview({ palette }: { palette: CustomPalette }) {
  return (
    <div
      style={paletteStyle(palette)}
      className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3"
    >
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <div className="mb-0.5 text-sm font-bold text-[var(--color-text)]">
          오늘의 운동 💪
        </div>
        <div className="mb-2 text-xs text-[var(--color-text-dim)]">
          미리보기 — 이렇게 보여요
        </div>
        <button className="mb-3 w-full rounded-lg bg-[var(--color-accent)] py-1.5 text-xs font-semibold text-white">
          운동 시작
        </button>
        <MuscleBars data={PREVIEW_DATA} format={(n) => `${n}세트`} />
      </div>
    </div>
  )
}

export function SettingsPage() {
  const navigate = useNavigate()
  const { profile } = useProfile()
  const { theme, setTheme, customPalette, saveCustomPalette, clearCustomPalette } =
    useTheme()

  const fileRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState<CustomPalette | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDetails, setShowDetails] = useState(false)

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // 같은 파일 재선택 허용
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('이미지 파일을 골라주세요')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const colors = await extractColors(file, 6)
      setDraft(buildCustomPalette(colors))
      setShowDetails(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : '색 추출에 실패했어요')
    } finally {
      setBusy(false)
    }
  }

  function editDraft(key: ThemeVar, value: string) {
    setDraft((d) => (d ? { ...d, [key]: value } : d))
  }

  const lowContrast = draft !== null && paletteContrast(draft) < 4.5

  return (
    <div className="px-4 py-5">
      {/* 헤더 */}
      <div className="mb-5 flex items-center gap-2">
        <button
          onClick={() => navigate(-1)}
          aria-label="뒤로"
          className="-ml-1 flex h-9 w-9 items-center justify-center rounded-full text-lg text-[var(--color-text-dim)] transition-colors hover:bg-[var(--color-surface)]"
        >
          ←
        </button>
        <h1 className="text-2xl font-bold">설정</h1>
      </div>

      {/* 테마 섹션 */}
      <section>
        <h2 className="mb-1 text-sm font-semibold text-[var(--color-text)]">
          테마
        </h2>
        <p className="mb-3 text-xs text-[var(--color-text-dim)]">
          앱 전체 색을 바꿔요. 선택하면 바로 적용됩니다.
        </p>

        <div className="grid grid-cols-2 gap-3">
          {THEMES.map((t) => {
            const active = t.id === theme
            return (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                aria-pressed={active}
                className={[
                  'flex flex-col gap-2 rounded-2xl border p-3 text-left transition-colors',
                  active
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]/30'
                    : 'border-[var(--color-border)] bg-[var(--color-surface)]',
                ].join(' ')}
              >
                <div
                  className="flex h-14 items-end gap-1.5 rounded-xl p-2"
                  style={{ background: t.swatch.bg }}
                >
                  <span
                    className="h-6 w-6 rounded-full border"
                    style={{
                      background: t.swatch.surface,
                      borderColor: t.swatch.text + '22',
                    }}
                  />
                  <span
                    className="h-6 w-6 rounded-full"
                    style={{ background: t.swatch.accent }}
                  />
                  <span
                    className="mb-0.5 h-3 w-8 rounded-full"
                    style={{ background: t.swatch.text }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">
                    {t.emoji} {t.label}
                  </span>
                  {active && (
                    <span className="text-xs font-bold text-[var(--color-accent)]">
                      ✓
                    </span>
                  )}
                </div>
              </button>
            )
          })}

          {/* 저장된 커스텀 테마 카드 */}
          {customPalette && (
            <button
              onClick={() => setTheme('custom')}
              aria-pressed={theme === 'custom'}
              className={[
                'flex flex-col gap-2 rounded-2xl border p-3 text-left transition-colors',
                theme === 'custom'
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]/30'
                  : 'border-[var(--color-border)] bg-[var(--color-surface)]',
              ].join(' ')}
            >
              <div
                className="flex h-14 items-end gap-1.5 rounded-xl p-2"
                style={{ background: customPalette['--color-bg'] }}
              >
                <span
                  className="h-6 w-6 rounded-full border"
                  style={{
                    background: customPalette['--color-surface'],
                    borderColor: customPalette['--color-text'] + '22',
                  }}
                />
                <span
                  className="h-6 w-6 rounded-full"
                  style={{ background: customPalette['--color-accent'] }}
                />
                <span
                  className="mb-0.5 h-3 w-8 rounded-full"
                  style={{ background: customPalette['--color-text'] }}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">🎨 내 테마</span>
                {theme === 'custom' && (
                  <span className="text-xs font-bold text-[var(--color-accent)]">
                    ✓
                  </span>
                )}
              </div>
            </button>
          )}
        </div>
      </section>

      {/* 커스텀 테마 만들기 */}
      <section className="mt-8">
        <h2 className="mb-1 text-sm font-semibold text-[var(--color-text)]">
          사진으로 내 테마 만들기 🎨
        </h2>
        <p className="mb-3 text-xs text-[var(--color-text-dim)]">
          좋아하는 캐릭터·사진을 올리면 그 색으로 테마를 만들어요.
        </p>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={onPickFile}
          className="hidden"
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] py-3 text-sm font-semibold transition-colors hover:bg-[var(--color-surface-2)] disabled:opacity-60"
        >
          {busy ? '색 뽑는 중…' : draft ? '다른 사진으로 다시' : '사진 올리기'}
        </button>

        {error && (
          <p className="mt-2 text-xs text-[var(--color-danger)]">{error}</p>
        )}

        {/* 추출 결과 편집 */}
        {draft && (
          <div className="mt-4 flex flex-col gap-4">
            <ThemePreview palette={draft} />

            {lowContrast && (
              <p className="text-xs text-[var(--color-danger)]">
                ⚠️ 글자와 배경 대비가 낮아요. 글자색을 더 진하거나 밝게
                조정해보세요.
              </p>
            )}

            {/* 주요 색 */}
            <div className="flex justify-around">
              {PRIMARY_FIELDS.map((f) => (
                <ColorField
                  key={f.key}
                  label={f.label}
                  value={draft[f.key]}
                  onChange={(v) => editDraft(f.key, v)}
                />
              ))}
            </div>

            {/* 근육 색 */}
            <div>
              <div className="mb-2 text-xs text-[var(--color-text-dim)]">
                부위별 색
              </div>
              <div className="flex justify-around">
                {MUSCLE_FIELDS.map((f) => (
                  <ColorField
                    key={f.key}
                    label={f.label}
                    value={draft[f.key]}
                    onChange={(v) => editDraft(f.key, v)}
                  />
                ))}
              </div>
            </div>

            {/* 세부 색 (접이식) */}
            <button
              onClick={() => setShowDetails((s) => !s)}
              className="text-left text-xs font-medium text-[var(--color-accent)]"
            >
              {showDetails ? '세부 조정 접기' : '세부 조정 펼치기'}
            </button>
            {showDetails && (
              <div className="flex flex-wrap justify-around gap-y-3">
                {DETAIL_FIELDS.map((f) => (
                  <ColorField
                    key={f.key}
                    label={f.label}
                    value={draft[f.key]}
                    onChange={(v) => editDraft(f.key, v)}
                  />
                ))}
              </div>
            )}

            {/* 저장 / 취소 */}
            <div className="flex gap-2">
              <button
                onClick={() => setDraft(null)}
                className="flex-1 rounded-xl border border-[var(--color-border)] py-2.5 text-sm font-semibold"
              >
                취소
              </button>
              <button
                onClick={() => {
                  saveCustomPalette(draft)
                  setDraft(null)
                }}
                className="flex-1 rounded-xl bg-[var(--color-accent)] py-2.5 text-sm font-semibold text-white"
              >
                저장하고 적용
              </button>
            </div>
          </div>
        )}

        {/* 저장된 커스텀 삭제 */}
        {!draft && customPalette && (
          <button
            onClick={clearCustomPalette}
            className="mt-3 text-xs text-[var(--color-text-dim)] underline"
          >
            내 테마 삭제
          </button>
        )}
      </section>

      {/* 프로필 정보 */}
      {profile && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">
            내 정보
          </h2>
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-[var(--color-text-dim)]">닉네임</span>
              <span className="font-medium">{profile.nickname}</span>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
