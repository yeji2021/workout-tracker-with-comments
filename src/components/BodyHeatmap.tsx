import { MUSCLE_GROUPS, type MuscleGroup } from '../lib/types'
import { MUSCLE_COLORS } from './MuscleBars'

// 부위별 사용량을 사람 실루엣(앞/뒤)에 색 농도로 표시.
export function BodyHeatmap({
  data,
}: {
  data: Record<MuscleGroup, number>
}) {
  const max = Math.max(1, ...MUSCLE_GROUPS.map((g) => data[g]))
  // 사용량 → 채도(0.12~1). 0이면 회색 실루엣만.
  const op = (g: MuscleGroup) =>
    data[g] > 0 ? 0.15 + 0.85 * (data[g] / max) : 0
  const fill = (g: MuscleGroup) => MUSCLE_COLORS[g]

  const base = 'var(--color-surface-2)'

  return (
    <div className="flex items-end justify-center gap-6 py-2">
      {/* 앞모습: 가슴/어깨/팔/코어/하체 */}
      <svg viewBox="0 0 100 190" className="h-44 w-auto" aria-label="앞모습">
        {/* 머리 */}
        <circle cx="50" cy="14" r="9" fill={base} />
        {/* 몸통 실루엣 베이스 */}
        <rect x="30" y="30" width="40" height="52" rx="8" fill={base} />
        <rect x="16" y="34" width="10" height="42" rx="5" fill={base} />
        <rect x="74" y="34" width="10" height="42" rx="5" fill={base} />
        <rect x="34" y="82" width="13" height="66" rx="6" fill={base} />
        <rect x="53" y="82" width="13" height="66" rx="6" fill={base} />
        {/* 색상 오버레이 */}
        <g>
          {/* 어깨 */}
          <ellipse cx="30" cy="34" rx="9" ry="6" fill={fill('어깨')} opacity={op('어깨')} />
          <ellipse cx="70" cy="34" rx="9" ry="6" fill={fill('어깨')} opacity={op('어깨')} />
          {/* 가슴 */}
          <rect x="32" y="32" width="36" height="20" rx="6" fill={fill('가슴')} opacity={op('가슴')} />
          {/* 팔 */}
          <rect x="16" y="38" width="10" height="38" rx="5" fill={fill('팔')} opacity={op('팔')} />
          <rect x="74" y="38" width="10" height="38" rx="5" fill={fill('팔')} opacity={op('팔')} />
          {/* 코어 */}
          <rect x="35" y="53" width="30" height="27" rx="5" fill={fill('코어')} opacity={op('코어')} />
          {/* 하체 */}
          <rect x="34" y="82" width="13" height="64" rx="6" fill={fill('하체')} opacity={op('하체')} />
          <rect x="53" y="82" width="13" height="64" rx="6" fill={fill('하체')} opacity={op('하체')} />
        </g>
      </svg>

      {/* 뒷모습: 등 */}
      <svg viewBox="0 0 100 190" className="h-44 w-auto" aria-label="뒷모습">
        <circle cx="50" cy="14" r="9" fill={base} />
        <rect x="30" y="30" width="40" height="52" rx="8" fill={base} />
        <rect x="16" y="34" width="10" height="42" rx="5" fill={base} />
        <rect x="74" y="34" width="10" height="42" rx="5" fill={base} />
        <rect x="34" y="82" width="13" height="66" rx="6" fill={base} />
        <rect x="53" y="82" width="13" height="66" rx="6" fill={base} />
        <g>
          {/* 등 (상·중배부) */}
          <rect x="32" y="34" width="36" height="34" rx="6" fill={fill('등')} opacity={op('등')} />
          {/* 하체(뒤)도 참고용으로 옅게 */}
          <rect x="34" y="82" width="13" height="64" rx="6" fill={fill('하체')} opacity={op('하체') * 0.5} />
          <rect x="53" y="82" width="13" height="64" rx="6" fill={fill('하체')} opacity={op('하체') * 0.5} />
        </g>
        <text x="50" y="186" textAnchor="middle" fontSize="9" fill="var(--color-text-dim)">
          등
        </text>
      </svg>
    </div>
  )
}
