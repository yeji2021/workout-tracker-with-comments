import { supabase } from './supabase'

// 공유 시점 스냅샷 (본인 과거 기록으로 계산 — 타인 기록 조회 불필요)
export interface ShareHighlights {
  kind: 'pr' | 'new_exercise' | 'tired'
  title: string
  prs?: { name: string; weight_kg: number }[]
  new_exercises?: string[]
}

// 세션을 지정한 그룹들에 공유 (선택되지 않은, 이미 공유된 그룹은 그대로 둔다 —
// 해제는 unshareFromGroup을 별도 호출). 같은 그룹에 다시 공유하면 멘트/하이라이트 갱신.
export async function shareSessionToGroups(
  sessionId: string,
  groupIds: string[],
  message: string | null,
  highlights: ShareHighlights | null,
): Promise<void> {
  if (groupIds.length === 0) return
  const rows = groupIds.map((groupId) => ({
    session_id: sessionId,
    group_id: groupId,
    message: message?.trim() || null,
    highlights: (highlights as unknown as Record<string, unknown>) ?? null,
  }))
  const { error } = await supabase
    .from('session_shares')
    .upsert(rows, { onConflict: 'session_id,group_id' })
  if (error) throw error
}

export async function unshareFromGroup(
  sessionId: string,
  groupId: string,
): Promise<void> {
  const { error } = await supabase
    .from('session_shares')
    .delete()
    .eq('session_id', sessionId)
    .eq('group_id', groupId)
  if (error) throw error
}
