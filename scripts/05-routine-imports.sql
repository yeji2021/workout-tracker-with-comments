-- ────────────────────────────────────────────────────────────────────────
-- 릴스 투 루틴: routine_imports (큐 테이블) — REEL-TO-ROUTINE.md 4절
--
-- 실행: Supabase 대시보드 → SQL Editor → 이 내용 전체 복사-붙여넣기 → Run
-- (01 ~ 04 스크립트를 모두 실행한 뒤에 실행할 것 — profiles / current_profile_id()
--  에 의존한다. 파괴적 변경은 없고 추가만 한다.)
--
-- 구조 요약
--   - 앱(anon 키 + 익명 auth)은 "큐에 쌓고 읽는" 것만 한다.
--   - 실제 처리(status 전이, result 채우기)는 관리자 맥의 Claude 세션이
--     service_role 키로 한다. service_role 은 RLS 를 우회하므로 아래 정책은
--     전부 "일반 사용자에게 무엇을 허용할지"만 규정한다.
--   - service_role 키는 맥 로컬 환경변수에만 둔다. repo/프론트에 절대 넣지 않는다.
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.routine_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  url TEXT NOT NULL CHECK (char_length(trim(url)) BETWEEN 1 AND 2000),
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'youtube', 'other')),
  user_note TEXT CHECK (user_note IS NULL OR char_length(user_note) <= 300),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'done', 'failed')),
  source_text TEXT,                    -- 처리 시 읽은 캡션/설명란 (디버깅·재처리용)
  used_video BOOLEAN NOT NULL DEFAULT false, -- 영상 캡처 폴백까지 갔는지
  result JSONB,                        -- 추출된 루틴 (ExtractedRoutine — types.ts)
  error TEXT,                          -- 실패 사유 (사용자에게 그대로 노출)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

-- 내 목록(최신순) 조회용
CREATE INDEX IF NOT EXISTS idx_routine_imports_profile
  ON public.routine_imports (profile_id, created_at DESC);
-- 관리자 세션의 큐 조회용 (queued 를 오래된 순으로)
CREATE INDEX IF NOT EXISTS idx_routine_imports_queue
  ON public.routine_imports (status, created_at);

-- ────────────────────────────────────────────────────────────────────────
-- RLS
-- ────────────────────────────────────────────────────────────────────────
ALTER TABLE public.routine_imports ENABLE ROW LEVEL SECURITY;

-- 재실행 가능하도록 먼저 떨어뜨린다 (03-multi-group.sql 과 같은 방식).
DROP POLICY IF EXISTS "routine_imports_select_own" ON public.routine_imports;
DROP POLICY IF EXISTS "routine_imports_insert_own" ON public.routine_imports;
DROP POLICY IF EXISTS "routine_imports_delete_own" ON public.routine_imports;

-- 조회: 본인 행만
CREATE POLICY "routine_imports_select_own" ON public.routine_imports
  FOR SELECT USING (profile_id = public.current_profile_id());

-- 등록: 본인 명의로만, 그리고 반드시 "미처리 상태"로만 들어와야 한다.
-- (처리 결과 컬럼을 클라이언트가 미리 채워 넣고 완료인 척하는 것을 차단)
CREATE POLICY "routine_imports_insert_own" ON public.routine_imports
  FOR INSERT WITH CHECK (
    profile_id = public.current_profile_id()
    AND status = 'queued'
    AND result IS NULL
    AND error IS NULL
    AND source_text IS NULL
    AND processed_at IS NULL
  );

-- 삭제: 본인 행 중 processing 이 아닌 것.
--   - queued  : 등록 취소.
--   - done    : "내 루틴으로 저장"을 끝낸 항목을 사용자가 목록에서 치울 수 있어야
--               한다. 저장된 routines 는 별개 테이블이라 같이 지워지지 않는다.
--   - failed  : 실패 사유를 확인한 뒤 치우는 것 말고 할 수 있는 게 없다.
--   - processing 만 막는 이유: 관리자 세션이 지금 이 행을 읽고 쓰는 중이다.
--               중간에 사라지면 세션의 update 가 0건이 되어 캡처/분석 결과가
--               조용히 버려진다. 처리 중에는 잠깐 기다리게 하는 편이 낫다.
CREATE POLICY "routine_imports_delete_own" ON public.routine_imports
  FOR DELETE USING (
    profile_id = public.current_profile_id()
    AND status <> 'processing'
  );

-- 수정 정책은 의도적으로 없다. status/result/error 를 바꾸는 것은 처리 주체
-- (service_role) 의 몫이고, 사용자가 편집한 루틴은 이 행이 아니라 routines /
-- routine_entries 로 저장된다. 정책이 없으면 UPDATE 는 전부 거부된다.

-- ────────────────────────────────────────────────────────────────────────
-- 권한 (컬럼 GRANT — 01/04 스크립트의 profiles 패턴과 동일한 취지)
-- 사용자가 손댈 수 있는 컬럼을 등록 시점 입력값 4개로 못박는다.
-- ────────────────────────────────────────────────────────────────────────
REVOKE ALL ON public.routine_imports FROM anon, authenticated;
GRANT SELECT, DELETE ON public.routine_imports TO authenticated;
GRANT INSERT (profile_id, url, platform, user_note) ON public.routine_imports TO authenticated;

-- ── Realtime: 관리자가 처리를 끝내면 앱의 가져오기 목록이 바로 갱신되도록
-- (이미 들어 있으면 ADD TABLE 이 에러를 내므로 존재 여부를 보고 건너뛴다)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'routine_imports'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.routine_imports;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────
-- 검증
-- ────────────────────────────────────────────────────────────────────────
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'routine_imports' ORDER BY ordinal_position;
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'routine_imports';
-- SELECT grantee, privilege_type, column_name FROM information_schema.column_privileges
--   WHERE table_name = 'routine_imports' AND grantee IN ('anon', 'authenticated');
-- SELECT * FROM public.routine_imports ORDER BY created_at DESC LIMIT 5;
