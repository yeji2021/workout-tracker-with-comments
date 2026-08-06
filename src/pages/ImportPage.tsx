import { useCallback, useEffect, useRef, useState } from 'react'
import { useProfile } from '../context/ProfileContext'
import {
  createImport,
  deleteImport,
  listImports,
  subscribeImports,
} from '../lib/routineImports'
import { IMPORT_STATUS_LABEL } from '../lib/types'
import type { ImportPlatform, ImportStatus, RoutineImport } from '../lib/types'
import { ImportReviewSheet } from '../components/ImportReviewSheet'

// 플랫폼별 표시용 아이콘/라벨 (색은 상태 뱃지 쪽에서만 쓴다)
const PLATFORM_META: Record<ImportPlatform, { icon: string; label: string }> = {
  instagram: { icon: '📸', label: '인스타그램' },
  youtube: { icon: '▶️', label: '유튜브' },
  other: { icon: '🔗', label: '링크' },
}

// 상태 뱃지 색. 문구는 반드시 IMPORT_STATUS_LABEL 을 쓴다.
const STATUS_STYLE: Record<ImportStatus, string> = {
  queued: 'bg-[var(--color-surface-2)] text-[var(--color-text-dim)]',
  processing: 'bg-[var(--color-accent)] text-white',
  done: 'bg-[var(--color-surface-2)] text-[var(--color-accent)]',
  failed: 'bg-[var(--color-surface-2)] text-[var(--color-danger)]',
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

// 등록 시각: 오늘이면 시:분, 아니면 월/일 시:분
function fmtCreatedAt(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (sameDay) return `오늘 ${time}`
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${time}`
}

export function ImportPage() {
  const { profile } = useProfile()

  const [imports, setImports] = useState<RoutineImport[]>([])
  const [loading, setLoading] = useState(true)
  const [url, setUrl] = useState('')
  const [note, setNote] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [reviewing, setReviewing] = useState<RoutineImport | null>(null)

  const refresh = useCallback(async () => {
    if (!profile) return
    const list = await listImports(profile.profile_id)
    setImports(list)
  }, [profile])

  // Realtime 구독 안에서 항상 최신 refresh 를 부르기 위한 ref (FeedPage 와 같은 방식)
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const list = await listImports(profile.profile_id)
        if (!cancelled) setImports(list)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [profile])

  // 관리자가 처리를 끝내면(상태 변경) 목록을 자동 갱신한다
  useEffect(() => {
    if (!profile) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const unsub = subscribeImports(
      profile.profile_id,
      () => {
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => refreshRef.current(), 300)
      },
      'routine-imports-page',
    )
    return () => {
      if (timer) clearTimeout(timer)
      unsub()
    }
  }, [profile])

  async function submit() {
    if (!profile || submitting) return
    const trimmed = url.trim()
    if (!trimmed) {
      setFormError('링크를 붙여넣어 주세요.')
      return
    }
    setFormError(null)
    setSubmitting(true)
    try {
      // createImport 가 URL 검증(detectPlatform)까지 하고 삽입된 행을 돌려준다.
      // 돌려받은 행을 바로 목록 맨 위에 꽂아 '대기중'이 즉시 보이게 한다.
      const created = await createImport(profile.profile_id, trimmed, note)
      setImports((prev) => [created, ...prev])
      setUrl('')
      setNote('')
    } catch (e) {
      // PostgrestError 도 Error 를 상속하므로 instanceof 만으로는 DB 원문 영어
      // 메시지가 그대로 새어 나온다. detectPlatform 처럼 우리가 던진 Error(=code 없음)만
      // 그대로 보여주고 나머지는 한국어 문구로 덮는다.
      setFormError(
        e instanceof Error && !('code' in e)
          ? e.message
          : '등록에 실패했어요. 잠시 후 다시 시도해 주세요.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(imp: RoutineImport) {
    if (!confirm('이 가져오기를 목록에서 지울까요?')) return
    setDeleting(imp.id)
    try {
      await deleteImport(imp.id)
    } finally {
      setDeleting(null)
    }
    // 처리중 행은 RLS 가 막아 에러 없이 0건 삭제로 끝나므로 목록을 다시 읽어 확인한다
    await refresh()
  }

  return (
    <div className="px-4 py-5">
      <h1 className="mb-1 text-2xl font-bold">루틴 가져오기</h1>
      <p className="mb-4 text-sm text-[var(--color-text-dim)]">
        인스타 릴스나 유튜브 운동 영상 링크를 붙여넣으면
        <br />
        루틴으로 정리해 드려요.
      </p>

      {/* 등록 폼 */}
      <section className="mb-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <input
          value={url}
          onChange={(e) => {
            setUrl(e.target.value)
            if (formError) setFormError(null)
          }}
          inputMode="url"
          placeholder="https://www.instagram.com/reel/..."
          className="mb-2 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3.5 py-3 text-sm outline-none focus:border-[var(--color-accent)]"
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={60}
          placeholder="메모 (선택) — 예: 어깨 위주로만"
          className="mb-2 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3.5 py-3 text-sm outline-none focus:border-[var(--color-accent)]"
        />

        {formError && (
          <p className="mb-2 text-xs text-[var(--color-danger)]">{formError}</p>
        )}

        <button
          onClick={submit}
          disabled={submitting || !url.trim()}
          className="w-full rounded-xl bg-[var(--color-accent)] py-3 text-sm font-semibold text-white disabled:opacity-40"
        >
          {submitting ? '등록 중…' : '등록'}
        </button>
      </section>

      {/* 내 가져오기 목록 */}
      <h2 className="mb-2 text-sm font-semibold text-[var(--color-text-dim)]">
        내 가져오기
      </h2>

      {loading ? (
        <div className="py-10 text-center text-sm text-[var(--color-text-dim)]">
          불러오는 중…
        </div>
      ) : imports.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-3 text-center">
          <div className="text-4xl">🎬</div>
          <p className="text-sm text-[var(--color-text-dim)]">
            아직 가져온 영상이 없어요.
            <br />
            마음에 든 루틴 영상 링크를 붙여넣어 보세요.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {imports.map((imp) => {
            const meta = PLATFORM_META[imp.platform]
            const isDone = imp.status === 'done' && imp.result !== null
            return (
              <div
                key={imp.id}
                className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5"
              >
                <button
                  onClick={() => isDone && setReviewing(imp)}
                  disabled={!isDone}
                  className="flex w-full items-center gap-3 text-left"
                >
                  <span className="text-xl">{meta.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">
                      {/* result 는 앱 밖에서 써 넣는 jsonb 라 형태를 믿지 않는다.
                          이름이 문자열이 아니면 메모/URL 폴백으로 떨어뜨린다. */}
                      {(isDone && typeof imp.result?.routine_name === 'string'
                        ? imp.result.routine_name.trim()
                        : '') ||
                        imp.user_note ||
                        imp.url}
                    </div>
                    <div className="truncate text-xs text-[var(--color-text-dim)]">
                      {meta.label} · {fmtCreatedAt(imp.created_at)}
                    </div>
                  </div>
                  <span
                    className={
                      'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ' +
                      STATUS_STYLE[imp.status]
                    }
                  >
                    {IMPORT_STATUS_LABEL[imp.status]}
                  </span>
                  {isDone && (
                    <span className="text-[var(--color-text-dim)]">›</span>
                  )}
                </button>

                {/* 실패 사유는 처리 세션이 한국어 문장으로 넣어 주므로 그대로 노출한다 */}
                {imp.status === 'failed' && imp.error && (
                  <p className="mt-2 text-xs text-[var(--color-danger)]">
                    {imp.error}
                  </p>
                )}

                {/* 처리중 행은 RLS 상 삭제할 수 없어 버튼을 감춘다 */}
                {imp.status !== 'processing' && (
                  <div className="mt-2 flex justify-end">
                    <button
                      onClick={() => handleDelete(imp)}
                      disabled={deleting === imp.id}
                      className="text-xs text-[var(--color-text-dim)] disabled:opacity-40"
                    >
                      {deleting === imp.id ? '삭제 중…' : '삭제'}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <p className="mt-6 text-center text-xs leading-relaxed text-[var(--color-text-dim)]">
        관리자가 주기적으로 처리해요.
        <br />
        등록 후 완료까지 시간이 걸릴 수 있어요.
      </p>

      {reviewing && (
        <ImportReviewSheet
          imp={reviewing}
          onClose={() => setReviewing(null)}
          onSaved={() => {
            setReviewing(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}
