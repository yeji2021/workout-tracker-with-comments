// 아바타 + 연속 기록(스트릭) 표시. 스트릭 중이면 그라데이션 링,
// 3일 이상이면 우하단에 🔥N 뱃지.
export function StreakAvatar({
  nickname,
  streak,
}: {
  nickname: string
  streak: number
}) {
  return (
    <div className="relative h-8 w-8 shrink-0">
      <div
        className={
          'flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ' +
          (streak >= 1
            ? 'bg-gradient-to-br from-orange-400 to-red-500 text-white ring-2 ring-offset-1 ring-offset-[var(--color-surface)] ring-orange-400'
            : 'bg-[var(--color-accent-soft)]')
        }
      >
        {nickname.slice(0, 1)}
      </div>
      {streak >= 3 && (
        <span className="absolute -bottom-1 -right-1 rounded-full bg-[var(--color-surface)] px-1 text-[9px] font-bold leading-tight shadow">
          🔥{streak}
        </span>
      )}
    </div>
  )
}
