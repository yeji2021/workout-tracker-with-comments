import { supabase } from './supabase'
import type { MuscleGroup } from './types'

// 피드에서 사용할 이모지 (setlog 스타일)
export const FEED_EMOJIS = ['👍', '🔥', '💪', '👏', '🎯'] as const

export interface FeedReaction {
  id: string
  emoji: string
  user_id: string
  nickname: string
}
export interface FeedComment {
  id: string
  text: string
  user_id: string
  nickname: string
  created_at: string
}
export interface FeedExercise {
  name: string
  muscle: MuscleGroup | null
  setCount: number
}
export interface FeedItem {
  session_id: string
  date: string
  user_id: string
  nickname: string
  is_mine: boolean
  exercises: FeedExercise[]
  volume: number
  reactions: FeedReaction[]
  comments: FeedComment[]
}

const num = (v: number | null | undefined) => (Number.isFinite(v) ? (v as number) : 0)

function nick(p: unknown): string {
  const obj = p as { nickname?: string } | null
  return obj?.nickname ?? '알 수 없음'
}

// ── 피드 조회 (그룹의 공유 세션 + 내 공유 세션) ─────────────────────
export async function fetchFeed(profileId: string): Promise<FeedItem[]> {
  const { data, error } = await supabase
    .from('workout_sessions')
    .select(
      'id,date,user_id,profiles(nickname),' +
        'workout_entries(exercises(name,primary_muscle_group), sets(weight_kg,reps)),' +
        'reactions(id,emoji,user_id,profiles(nickname)),' +
        'comments(id,text,user_id,created_at,profiles(nickname))',
    )
    .eq('is_shared', true)
    .order('date', { ascending: false })
    .limit(50)
  if (error) throw error

  const rows = (data ?? []) as unknown as Record<string, unknown>[]
  return rows.map((s) => {
    const entriesRaw = (s.workout_entries as Record<string, unknown>[]) ?? []
    const exercises: FeedExercise[] = entriesRaw.map((e) => {
      const ex = e.exercises as
        | { name: string; primary_muscle_group: MuscleGroup }
        | null
      const sets = (e.sets as { weight_kg: number | null; reps: number }[]) ?? []
      return {
        name: ex?.name ?? '운동',
        muscle: ex?.primary_muscle_group ?? null,
        setCount: sets.filter((st) => num(st.reps) > 0).length,
      }
    })
    let volume = 0
    for (const e of entriesRaw) {
      const sets = (e.sets as { weight_kg: number | null; reps: number }[]) ?? []
      for (const st of sets) volume += num(st.weight_kg) * num(st.reps)
    }
    const reactions: FeedReaction[] = (
      (s.reactions as Record<string, unknown>[]) ?? []
    ).map((r) => ({
      id: r.id as string,
      emoji: r.emoji as string,
      user_id: r.user_id as string,
      nickname: nick(r.profiles),
    }))
    const comments: FeedComment[] = (
      (s.comments as Record<string, unknown>[]) ?? []
    )
      .map((c) => ({
        id: c.id as string,
        text: c.text as string,
        user_id: c.user_id as string,
        nickname: nick(c.profiles),
        created_at: c.created_at as string,
      }))
      .sort((a, b) => (a.created_at < b.created_at ? -1 : 1))

    return {
      session_id: s.id as string,
      date: s.date as string,
      user_id: s.user_id as string,
      nickname: nick(s.profiles),
      is_mine: s.user_id === profileId,
      exercises,
      volume,
      reactions,
      comments,
    }
  })
}

// ── 이모지 리액션 ───────────────────────────────────────────────────
export async function addReaction(
  sessionId: string,
  profileId: string,
  emoji: string,
): Promise<void> {
  const { error } = await supabase
    .from('reactions')
    .insert({ session_id: sessionId, user_id: profileId, emoji })
  if (error) throw error
}

export async function removeReaction(
  sessionId: string,
  profileId: string,
  emoji: string,
): Promise<void> {
  const { error } = await supabase
    .from('reactions')
    .delete()
    .eq('session_id', sessionId)
    .eq('user_id', profileId)
    .eq('emoji', emoji)
  if (error) throw error
}

// ── 댓글 ────────────────────────────────────────────────────────────
export async function addComment(
  sessionId: string,
  profileId: string,
  text: string,
): Promise<void> {
  const { error } = await supabase
    .from('comments')
    .insert({ session_id: sessionId, user_id: profileId, text: text.trim() })
  if (error) throw error
}

export async function deleteComment(commentId: string): Promise<void> {
  const { error } = await supabase.from('comments').delete().eq('id', commentId)
  if (error) throw error
}

// ── Realtime 구독 (리액션/댓글 변경 시 콜백) ────────────────────────
// channelName은 구독마다 고유해야 한다 (피드 화면 / 탭 뱃지가 각각 구독).
export function subscribeFeed(
  onChange: () => void,
  channelName = 'feed-activity',
): () => void {
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'reactions' },
      onChange,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'comments' },
      onChange,
    )
    .subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}
