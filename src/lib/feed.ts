import { supabase } from './supabase'
import { MUSCLE_GROUPS, type MuscleGroup } from './types'
import type { ShareHighlights } from './share'

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
  share_id: string
  session_id: string
  group_id: string
  group_name: string
  message: string | null
  highlights: ShareHighlights | null
  date: string
  user_id: string
  nickname: string
  streak: number
  is_mine: boolean
  exercises: FeedExercise[]
  volume: number
  muscleVolume: Record<MuscleGroup, number> // 미니 바디 히트맵용
  reactions: FeedReaction[]
  comments: FeedComment[]
}

function emptyMuscleVolume(): Record<MuscleGroup, number> {
  return Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, 0])) as Record<
    MuscleGroup,
    number
  >
}

const num = (v: number | null | undefined) => (Number.isFinite(v) ? (v as number) : 0)

function nick(p: unknown): string {
  const obj = p as { nickname?: string } | null
  return obj?.nickname ?? '알 수 없음'
}

// 주의: fetchFeed의 select가 profiles.streak_count를 명시하므로 04-streak.sql
// 마이그레이션이 적용돼 있어야 한다 (미적용 시 쿼리 자체가 실패). 03과 04는 세트.
function streakOf(p: unknown): number {
  const obj = p as { streak_count?: number } | null
  return obj?.streak_count ?? 0
}

// ── 피드 조회 (내 그룹들의 공유 세션. groupId='all'이면 전체 병합) ──────
export async function fetchFeed(
  profileId: string,
  groupId: string | 'all',
): Promise<FeedItem[]> {
  let query = supabase
    .from('session_shares')
    .select(
      'id,group_id,message,highlights,created_at,' +
        'groups(name),' +
        'workout_sessions(id,date,user_id,profiles(nickname,streak_count),' +
        'workout_entries(exercises(name,primary_muscle_group), sets(weight_kg,reps))),' +
        'reactions(id,emoji,user_id,profiles(nickname)),' +
        'comments(id,text,user_id,created_at,profiles(nickname))',
    )
    .order('created_at', { ascending: false })
    .limit(50)
  if (groupId !== 'all') query = query.eq('group_id', groupId)

  const { data, error } = await query
  if (error) throw error

  const rows = (data ?? []) as unknown as Record<string, unknown>[]
  return rows
    .map((row) => {
      const session = row.workout_sessions as Record<string, unknown> | null
      if (!session) return null // 세션이 삭제됐지만 share가 남아있는 경우 방어

      const entriesRaw = (session.workout_entries as Record<string, unknown>[]) ?? []
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
      const muscleVolume = emptyMuscleVolume()
      for (const e of entriesRaw) {
        const ex = e.exercises as { primary_muscle_group: MuscleGroup } | null
        const sets = (e.sets as { weight_kg: number | null; reps: number }[]) ?? []
        for (const st of sets) {
          const v = num(st.weight_kg) * num(st.reps)
          volume += v
          if (ex?.primary_muscle_group) muscleVolume[ex.primary_muscle_group] += v
        }
      }
      const reactions: FeedReaction[] = (
        (row.reactions as Record<string, unknown>[]) ?? []
      ).map((r) => ({
        id: r.id as string,
        emoji: r.emoji as string,
        user_id: r.user_id as string,
        nickname: nick(r.profiles),
      }))
      const comments: FeedComment[] = (
        (row.comments as Record<string, unknown>[]) ?? []
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
        share_id: row.id as string,
        session_id: session.id as string,
        group_id: row.group_id as string,
        group_name: (row.groups as { name?: string } | null)?.name ?? '그룹',
        message: (row.message as string | null) ?? null,
        highlights: (row.highlights as ShareHighlights | null) ?? null,
        date: session.date as string,
        user_id: session.user_id as string,
        nickname: nick(session.profiles),
        streak: streakOf(session.profiles),
        is_mine: session.user_id === profileId,
        exercises,
        volume,
        muscleVolume,
        reactions,
        comments,
      } satisfies FeedItem
    })
    .filter((item): item is FeedItem => item !== null)
}

// ── 주간 그룹 리캡 (공유된 운동 기준 — 비공유 세션은 집계에서 빠짐) ──────
export interface WeeklyRecapEntry {
  nickname: string
  volume: number
  days: number
}
export interface WeeklyRecap {
  totalVolume: number
  byNickname: WeeklyRecapEntry[]
  prCount: number
}

export async function fetchWeeklyRecap(
  groupId: string,
  fromISO: string,
  toISO: string,
): Promise<WeeklyRecap> {
  const { data, error } = await supabase
    .from('session_shares')
    .select(
      'highlights,' +
        'workout_sessions(date,profiles(nickname),' +
        'workout_entries(sets(weight_kg,reps)))',
    )
    .eq('group_id', groupId)
  if (error) throw error

  const rows = (data ?? []) as unknown as Record<string, unknown>[]
  const byNickname = new Map<string, { volume: number; days: Set<string> }>()
  let totalVolume = 0
  let prCount = 0

  for (const row of rows) {
    const session = row.workout_sessions as Record<string, unknown> | null
    if (!session) continue
    const date = session.date as string
    if (date < fromISO || date > toISO) continue

    const nickname = nick(session.profiles)
    const entriesRaw = (session.workout_entries as Record<string, unknown>[]) ?? []
    let volume = 0
    for (const e of entriesRaw) {
      const sets = (e.sets as { weight_kg: number | null; reps: number }[]) ?? []
      for (const st of sets) volume += num(st.weight_kg) * num(st.reps)
    }
    totalVolume += volume

    const entry = byNickname.get(nickname) ?? { volume: 0, days: new Set<string>() }
    entry.volume += volume
    entry.days.add(date)
    byNickname.set(nickname, entry)

    const highlights = row.highlights as { kind?: string } | null
    if (highlights?.kind === 'pr') prCount += 1
  }

  return {
    totalVolume,
    prCount,
    byNickname: [...byNickname.entries()]
      .map(([nickname, v]) => ({ nickname, volume: v.volume, days: v.days.size }))
      .sort((a, b) => b.volume - a.volume),
  }
}

// ── 이모지 리액션 (share 단위 — 그룹별 스레드 분리) ─────────────────────
export async function addReaction(
  shareId: string,
  profileId: string,
  emoji: string,
): Promise<void> {
  const { error } = await supabase
    .from('reactions')
    .insert({ share_id: shareId, user_id: profileId, emoji })
  if (error) throw error
}

export async function removeReaction(
  shareId: string,
  profileId: string,
  emoji: string,
): Promise<void> {
  const { error } = await supabase
    .from('reactions')
    .delete()
    .eq('share_id', shareId)
    .eq('user_id', profileId)
    .eq('emoji', emoji)
  if (error) throw error
}

// ── 댓글 ────────────────────────────────────────────────────────────
export async function addComment(
  shareId: string,
  profileId: string,
  text: string,
): Promise<void> {
  const { error } = await supabase
    .from('comments')
    .insert({ share_id: shareId, user_id: profileId, text: text.trim() })
  if (error) throw error
}

export async function deleteComment(commentId: string): Promise<void> {
  const { error } = await supabase.from('comments').delete().eq('id', commentId)
  if (error) throw error
}

// ── Realtime 구독 (리액션/댓글/새 공유 변경 시 콜백) ────────────────────
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
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'session_shares' },
      onChange,
    )
    .subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}
