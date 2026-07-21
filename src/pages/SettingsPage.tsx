import { useNavigate } from 'react-router-dom'
import { useProfile } from '../context/ProfileContext'
import { useTheme } from '../context/ThemeContext'
import { THEMES } from '../lib/theme'

export function SettingsPage() {
  const navigate = useNavigate()
  const { profile } = useProfile()
  const { theme, setTheme } = useTheme()

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
                {/* 미리보기 스와치 */}
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
        </div>
      </section>

      {/* 프로필 정보 (읽기 전용) */}
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
