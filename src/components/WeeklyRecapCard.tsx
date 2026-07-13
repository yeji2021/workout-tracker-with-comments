import { useEffect, useState } from 'react'
import { fetchWeeklyRecap, type WeeklyRecap } from '../lib/feed'
import { fmtVolume, volumeComparison } from '../lib/format'
import { shiftISO } from '../lib/stats'
import { todayISO } from '../lib/workouts'

// 지난주(월~일) 그룹이 함께 든 볼륨 + 멤버별 기여 + 신기록 수.
// 공유된 운동만 집계 대상이라, 비공유 세션은 반영되지 않는다.
export function WeeklyRecapCard({ groupId }: { groupId: string }) {
  const [recap, setRecap] = useState<WeeklyRecap | null>(null)
  const [collapsed, setCollapsed] = useState(false)

  const { fromISO, toISO } = lastWeekRange()

  useEffect(() => {
    let cancelled = false
    fetchWeeklyRecap(groupId, fromISO, toISO)
      .then((r) => !cancelled && setRecap(r))
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId])

  if (!recap || recap.totalVolume === 0) return null

  const comparison = volumeComparison(recap.totalVolume)

  return (
    <div className="mb-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center justify-between"
      >
        <span className="text-sm font-semibold text-[var(--color-text-dim)]">
          📅 지난주 리캡
        </span>
        <span className="text-xs text-[var(--color-text-dim)]">
          {collapsed ? '펼치기 ▾' : '접기 ▴'}
        </span>
      </button>

      {!collapsed && (
        <>
          <div className="mt-2 text-xl font-bold">
            {fmtVolume(recap.totalVolume)}
            {comparison && (
              <span className="ml-1.5 text-sm font-normal text-[var(--color-text-dim)]">
                ({comparison})
              </span>
            )}
          </div>
          <p className="mb-3 mt-0.5 text-xs text-[var(--color-text-dim)]">
            우리 그룹이 함께 든 무게 · 신기록 {recap.prCount}개
            {recap.prCount > 0 && ' 🏆'}
          </p>

          <div className="flex flex-col gap-1.5">
            {recap.byNickname.map((m, i) => (
              <div key={m.nickname} className="flex items-center gap-2 text-sm">
                <span className="w-5 shrink-0 text-center text-xs text-[var(--color-text-dim)]">
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate">{m.nickname}</span>
                <span className="shrink-0 text-xs text-[var(--color-text-dim)]">
                  {m.days}일
                </span>
                <span className="shrink-0 font-semibold">
                  {fmtVolume(m.volume)}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-[var(--color-text-dim)]">
            피드에 공유된 운동만 집계돼요.
          </p>
        </>
      )}
    </div>
  )
}

function lastWeekRange(): { fromISO: string; toISO: string } {
  const today = todayISO()
  const dow = new Date(today + 'T00:00:00Z').getUTCDay() // 0=일 ... 1=월
  const daysSinceMonday = dow === 0 ? 6 : dow - 1
  const thisMonday = shiftISO(today, -daysSinceMonday)
  const lastMonday = shiftISO(thisMonday, -7)
  const lastSunday = shiftISO(thisMonday, -1)
  return { fromISO: lastMonday, toISO: lastSunday }
}
