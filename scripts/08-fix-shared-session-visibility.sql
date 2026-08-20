-- ────────────────────────────────────────────────────────────────────────
-- 공유했는데 상대방 피드에 안 뜨는 문제 — 정책 재적용
--
-- 실행: Supabase 대시보드 → SQL Editor → 이 내용 전체 복사-붙여넣기 → Run
--
-- 배경 (2026-08-19 디버그 계정 2개로 재현):
--   A가 세션을 그룹에 공유하면 session_shares 행은 정상 생성되고, B는 그 행
--   자체는 읽을 수 있다(session_shares_select 통과). 그런데 B가 workout_sessions
--   /workout_entries/sets 를 읽으면 에러 없이 0건이 나온다. feed.ts는 이때
--   세션이 null이면 "삭제된 세션" 취급으로 조용히 걸러버려서, 공유는 됐는데
--   피드엔 안 뜨는 것처럼 보인다.
--
--   sessions_select/entries_select/sets_select 세 정책 모두
--   "EXISTS (SELECT 1 FROM session_shares ss WHERE ... AND is_group_member(ss.group_id))"
--   패턴인데 셋 다 막혀 있었다.
--
--   진짜 원인 (2026-08-19, 이 파일 최초 버전을 실행해도 안 고쳐져서 재조사 —
--   03-multi-group.sql 원문을 그대로 베꼈다가 그 안의 버그까지 옮겨왔었다):
--   sessions_select 의 EXISTS 절 "WHERE ss.session_id = id AND ..." 에서 unqualified
--   id 가 바깥 workout_sessions.id 가 아니라 **같은 서브쿼리 안의 session_shares.id**
--   (session_shares 도 PK 컬럼명이 id)로 해석된다. SQL 이름 해석은 안쪽 스코프
--   우선이라, 사실상 "ss.session_id = ss.id" 를 비교하는 꼴이 되어 항상 거짓.
--   entries_select/sets_select 는 자체 로직은 멀쩡하지만 내부에서 다시
--   `FROM public.workout_sessions` 를 참조하는데, 그 참조가 (SECURITY DEFINER
--   함수를 안 거치는 일반 테이블 참조라) sessions_select 의 RLS 를 그대로
--   상속받아서 같이 막힌 것 — 셋 다 막힌 게 사실은 원인 하나였다.
--
-- 아래는 문제의 세 정책 + 연쇄된 reactions/comments 정책까지 전부 DROP 후
-- id 를 명시적으로 workout_sessions.id 로 한정해서 재생성한다.
-- DROP POLICY IF EXISTS 라 몇 번을 다시 실행해도 안전하다.
-- ────────────────────────────────────────────────────────────────────────

-- ── 0) 진단: 지금 배포되어 있는 정책 원문을 먼저 확인 (읽기 전용, 안전)
SELECT
  pol.polname AS policy_name,
  cls.relname AS table_name,
  pol.polpermissive AS is_permissive,
  pg_get_expr(pol.polqual, pol.polrelid) AS using_expr,
  pg_get_expr(pol.polwithcheck, pol.polrelid) AS with_check_expr
FROM pg_policy pol
JOIN pg_class cls ON cls.oid = pol.polrelid
WHERE cls.relname IN ('workout_sessions', 'workout_entries', 'sets', 'session_shares', 'reactions', 'comments')
ORDER BY cls.relname, pol.polname;

-- 위 결과를 보고 sessions_select/entries_select/sets_select 의 using_expr 이
-- 아래 재생성 내용과 다르다면(특히 session_shares EXISTS 절이 없거나 다른
-- 조건이면) 그게 원인이 맞다. 다르든 같든 아래는 그대로 실행해서 강제로
-- 맞춰 넣는다.

-- ── 1) 옛 정책 제거 ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "sessions_select" ON public.workout_sessions;
DROP POLICY IF EXISTS "entries_select" ON public.workout_entries;
DROP POLICY IF EXISTS "sets_select" ON public.sets;
DROP POLICY IF EXISTS "reactions_select" ON public.reactions;
DROP POLICY IF EXISTS "comments_select" ON public.comments;

-- ── 2) 재생성 (03-multi-group.sql 의 의도된 정의와 동일) ─────────────────
CREATE POLICY "sessions_select" ON public.workout_sessions
  FOR SELECT USING (
    user_id = public.current_profile_id()
    OR EXISTS (
      SELECT 1 FROM public.session_shares ss
      WHERE ss.session_id = workout_sessions.id AND public.is_group_member(ss.group_id)
    )
  );

CREATE POLICY "entries_select" ON public.workout_entries
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.workout_sessions s
      WHERE s.id = session_id
        AND (s.user_id = public.current_profile_id()
          OR EXISTS (
            SELECT 1 FROM public.session_shares ss
            WHERE ss.session_id = s.id AND public.is_group_member(ss.group_id)
          ))
    )
  );

CREATE POLICY "sets_select" ON public.sets
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.workout_entries e
      JOIN public.workout_sessions s ON s.id = e.session_id
      WHERE e.id = entry_id
        AND (s.user_id = public.current_profile_id()
          OR EXISTS (
            SELECT 1 FROM public.session_shares ss
            WHERE ss.session_id = s.id AND public.is_group_member(ss.group_id)
          ))
    )
  );

CREATE POLICY "reactions_select" ON public.reactions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.session_shares ss WHERE ss.id = share_id AND public.is_group_member(ss.group_id))
  );

CREATE POLICY "comments_select" ON public.comments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.session_shares ss WHERE ss.id = share_id AND public.is_group_member(ss.group_id))
  );

-- ── 3) 검증: 아래 재진단 쿼리를 다시 돌려 using_expr 이 위 정의와 일치하는지 확인
-- SELECT pol.polname, pg_get_expr(pol.polqual, pol.polrelid) AS using_expr
-- FROM pg_policy pol JOIN pg_class cls ON cls.oid = pol.polrelid
-- WHERE cls.relname IN ('workout_sessions','workout_entries','sets') ORDER BY 1;
