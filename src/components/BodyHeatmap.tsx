import { MUSCLE_GROUPS, type MuscleGroup } from '../lib/types'
import { MUSCLE_COLORS } from './MuscleBars'

const BASE = 'var(--color-surface-2)'

// 두 실루엣이 공유하는 회색 베이스 라인 (머리/몸통/팔/다리 윤곽)
function TorsoBase() {
  return (
    <>
      <circle cx="50" cy="14" r="9" fill={BASE} />
      <rect x="30" y="30" width="40" height="52" rx="8" fill={BASE} />
      <rect x="16" y="34" width="10" height="42" rx="5" fill={BASE} />
      <rect x="74" y="34" width="10" height="42" rx="5" fill={BASE} />
      <rect x="34" y="82" width="13" height="66" rx="6" fill={BASE} />
      <rect x="53" y="82" width="13" height="66" rx="6" fill={BASE} />
    </>
  )
}

// 부위별 사용량을 사람 실루엣(앞/뒤)에 색 농도로 표시.
// variant='mini' → 카드에 작게 들어가는 단일 실루엣 (등이 최대 부위면 뒷모습, 아니면 앞모습).
export function BodyHeatmap({
  data,
  variant = 'full',
}: {
  data: Record<MuscleGroup, number>
  variant?: 'full' | 'mini'
}) {
  const max = Math.max(1, ...MUSCLE_GROUPS.map((g) => data[g]))
  // 사용량 → 채도(0.12~1). 0이면 회색 실루엣만.
  const op = (g: MuscleGroup) =>
    data[g] > 0 ? 0.15 + 0.85 * (data[g] / max) : 0
  const fill = (g: MuscleGroup) => MUSCLE_COLORS[g]

  if (variant === 'mini') {
    const dominant = MUSCLE_GROUPS.reduce((a, b) => (data[b] > data[a] ? b : a))
    const showBack = dominant === '등'
    return (
      <svg
        viewBox="0 0 100 190"
        className="h-24 w-auto shrink-0"
        aria-label={showBack ? '뒷모습' : '앞모습'}
      >
        <TorsoBase />
        {showBack ? (
          <g>
            <rect x="32" y="34" width="36" height="34" rx="6" fill={fill('등')} opacity={op('등')} />
            <rect x="34" y="82" width="13" height="64" rx="6" fill={fill('하체')} opacity={op('하체') * 0.5} />
            <rect x="53" y="82" width="13" height="64" rx="6" fill={fill('하체')} opacity={op('하체') * 0.5} />
          </g>
        ) : (
          <g>
            <ellipse cx="30" cy="34" rx="9" ry="6" fill={fill('어깨')} opacity={op('어깨')} />
            <ellipse cx="70" cy="34" rx="9" ry="6" fill={fill('어깨')} opacity={op('어깨')} />
            <rect x="32" y="32" width="36" height="20" rx="6" fill={fill('가슴')} opacity={op('가슴')} />
            <rect x="16" y="38" width="10" height="38" rx="5" fill={fill('팔')} opacity={op('팔')} />
            <rect x="74" y="38" width="10" height="38" rx="5" fill={fill('팔')} opacity={op('팔')} />
            <rect x="35" y="53" width="30" height="27" rx="5" fill={fill('코어')} opacity={op('코어')} />
            <rect x="34" y="82" width="13" height="64" rx="6" fill={fill('하체')} opacity={op('하체')} />
            <rect x="53" y="82" width="13" height="64" rx="6" fill={fill('하체')} opacity={op('하체')} />
          </g>
        )}
      </svg>
    )
  }

  return (
    <div className="flex items-end justify-center gap-6 py-2">
      {/* 앞모습: 가슴/어깨/팔/코어/하체 */}
      <svg viewBox="0 0 100 190" className="h-44 w-auto" aria-label="앞모습">
        <TorsoBase />
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
        <TorsoBase />
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
