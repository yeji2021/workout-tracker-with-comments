import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLive } from '../context/LiveContext'
import { useProfile } from '../context/ProfileContext'

// 그룹 멤버가 방금 운동을 시작하면 어느 화면에서든 상단에 뜨는 팝업 알림.
// 탭하면 피드로 이동해 라이브 바에서 바로 응원할 수 있다.
export function WorkoutStartToast() {
  const { startAlert, dismissStartAlert } = useLive()
  const { profile } = useProfile()
  const navigate = useNavigate()

  useEffect(() => {
    if (!startAlert) return
    const t = setTimeout(dismissStartAlert, 5000)
    return () => clearTimeout(t)
  }, [startAlert, dismissStartAlert])

  if (!startAlert) return null

  const groups = profile?.groups ?? []
  const groupName =
    groups.length > 1
      ? groups.find((g) => g.group_id === startAlert.groupId)?.name
      : undefined

  return (
    <div className="fixed left-1/2 top-16 z-50 flex w-full max-w-md -translate-x-1/2 justify-center px-4">
      <button
        onClick={() => {
          dismissStartAlert()
          navigate('/feed')
        }}
        className="animate-bounce rounded-full border border-[var(--color-accent)] bg-[var(--color-surface)] px-4 py-2 text-sm font-semibold shadow-lg"
      >
        <span className="mr-1.5 text-lg">💪</span>
        {startAlert.member.nickname}님이 운동을 시작했어요!
        {groupName && (
          <span className="ml-1.5 text-xs font-normal text-[var(--color-text-dim)]">
            {groupName}
          </span>
        )}
      </button>
    </div>
  )
}
