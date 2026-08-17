-- ────────────────────────────────────────────────────────────────────────
-- 설정 화면에서 복구 키 조회 — 01 의 "1회만 노출" 정책을 완화한다.
--
-- 실행: Supabase 대시보드 → SQL Editor → 이 내용 전체 복사-붙여넣기 → Run
-- (01 을 먼저 실행한 뒤에 실행할 것. 새 함수만 추가하므로 기존 데이터는 안전하고,
--  여러 번 실행해도 같은 결과가 된다.)
--
-- 배경: recovery_code 컬럼은 01 에서 REVOKE SELECT 로 막혀 있어 REST로 직접
--   조회가 불가능하고, 발급 RPC(create_group_and_join/join_group)가 응답에
--   실어줄 때 딱 한 번만 프론트에 노출됐다. 사용자가 그 순간 저장을 놓치면
--   되찾을 방법이 없었다 → 설정 화면에서 언제든 다시 볼 수 있게 SECURITY
--   DEFINER RPC를 추가한다. current_profile_id() 로 호출자 자신의 코드만
--   반환하므로 다른 사람 코드는 여전히 볼 수 없다.
-- ────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_my_recovery_code() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT recovery_code FROM public.profiles WHERE id = public.current_profile_id() $$;

REVOKE EXECUTE ON FUNCTION public.get_my_recovery_code() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_recovery_code() TO authenticated;

-- ── 검증 ─────────────────────────────────────────────────────────────
-- SELECT public.get_my_recovery_code(); -- 로그인한 세션에서 내 코드가 나오는지
