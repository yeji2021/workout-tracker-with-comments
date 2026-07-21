import { MUSCLE_GROUPS, type MuscleGroup } from '../lib/types'

// 부위별 색상 (바 차트 + 바디 히트맵 공용).
// 값은 테마 토큰 — index.css 의 --color-muscle-N 이 테마마다 달라진다.
export const MUSCLE_COLORS: Record<MuscleGroup, string> = {
  가슴: 'var(--color-muscle-1)',
  등: 'var(--color-muscle-2)',
  어깨: 'var(--color-muscle-3)',
  하체: 'var(--color-muscle-4)',
  팔: 'var(--color-muscle-5)',
  코어: 'var(--color-muscle-6)',
}

export function MuscleBars({
  data,
  format,
}: {
  data: Record<MuscleGroup, number>
  format?: (n: number) => string
}) {
  const max = Math.max(1, ...MUSCLE_GROUPS.map((g) => data[g]))
  return (
    <div className="flex flex-col gap-2.5">
      {MUSCLE_GROUPS.map((g) => (
        <div key={g} className="flex items-center gap-2">
          <span className="w-8 shrink-0 text-xs text-[var(--color-text-dim)]">
            {g}
          </span>
          <div className="h-5 flex-1 overflow-hidden rounded bg-[var(--color-surface-2)]">
            <div
              className="h-full rounded"
              style={{
                width: `${(data[g] / max) * 100}%`,
                background: MUSCLE_COLORS[g],
                minWidth: data[g] > 0 ? '2px' : '0',
              }}
            />
          </div>
          <span className="w-16 shrink-0 text-right text-xs tabular-nums text-[var(--color-text-dim)]">
            {format ? format(data[g]) : data[g]}
          </span>
        </div>
      ))}
    </div>
  )
}
