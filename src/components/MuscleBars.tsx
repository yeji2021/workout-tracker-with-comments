import { MUSCLE_GROUPS, type MuscleGroup } from '../lib/types'

// 부위별 색상 (바 차트 + 바디 히트맵 공용)
export const MUSCLE_COLORS: Record<MuscleGroup, string> = {
  가슴: '#4f7cff',
  등: '#35c07a',
  어깨: '#f0a63a',
  하체: '#e0574f',
  팔: '#9b6cff',
  코어: '#3ac0c0',
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
