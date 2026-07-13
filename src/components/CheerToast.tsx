import { useEffect } from 'react'

// 운동 중 친구가 보낸 응원이 도착했을 때 잠깐 떠 있다 사라지는 토스트.
export function CheerToast({
  emoji,
  fromNickname,
  onDone,
}: {
  emoji: string
  fromNickname: string
  onDone: () => void
}) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <div className="pointer-events-none fixed left-1/2 top-16 z-50 flex w-full max-w-md -translate-x-1/2 justify-center px-4">
      <div className="animate-bounce rounded-full border border-[var(--color-accent)] bg-[var(--color-surface)] px-4 py-2 text-sm font-semibold shadow-lg">
        <span className="mr-1.5 text-lg">{emoji}</span>
        {fromNickname}님의 응원이 도착했어요!
      </div>
    </div>
  )
}
