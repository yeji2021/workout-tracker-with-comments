import { shiftISO } from '../lib/stats'
import { todayISO } from '../lib/workouts'

const WEEKS = 16 // 최근 16주

// 운동한 날을 잔디처럼 표시. 볼륨 크기에 따라 색 농도 4단계.
export function CalendarHeatmap({
  volumeByDate,
}: {
  volumeByDate: Map<string, number>
}) {
  const today = todayISO()
  // 오늘이 포함된 주의 토요일까지 맞춰 격자 끝을 정렬 (일요일 시작)
  const [ty, tm, td] = today.split('-').map(Number)
  const dow = new Date(Date.UTC(ty, tm - 1, td)).getUTCDay() // 0=일
  const endISO = shiftISO(today, 6 - dow) // 이번 주 토요일
  const startISO = shiftISO(endISO, -(WEEKS * 7 - 1)) // 시작(일요일)

  const maxVol = Math.max(1, ...volumeByDate.values())
  const tier = (v: number) => {
    if (!v) return 0
    const t = v / maxVol
    if (t > 0.66) return 4
    if (t > 0.33) return 3
    return 2
  }
  const tierColor = [
    'var(--color-surface-2)',
    'var(--color-surface-2)',
    'rgba(53,192,122,0.35)',
    'rgba(53,192,122,0.65)',
    'rgba(53,192,122,1)',
  ]

  const cols: { iso: string; future: boolean; vol: number }[][] = []
  for (let w = 0; w < WEEKS; w++) {
    const col: { iso: string; future: boolean; vol: number }[] = []
    for (let d = 0; d < 7; d++) {
      const iso = shiftISO(startISO, w * 7 + d)
      col.push({
        iso,
        future: iso > today,
        vol: volumeByDate.get(iso) ?? 0,
      })
    }
    cols.push(col)
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-[3px]">
        {cols.map((col, i) => (
          <div key={i} className="flex flex-col gap-[3px]">
            {col.map((cell) => (
              <div
                key={cell.iso}
                title={`${cell.iso}${cell.vol ? ` · ${Math.round(cell.vol).toLocaleString()}kg` : ''}`}
                className="h-3 w-3 rounded-[3px]"
                style={{
                  background: cell.future
                    ? 'transparent'
                    : tierColor[tier(cell.vol)],
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
