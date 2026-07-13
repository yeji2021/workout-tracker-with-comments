-- ────────────────────────────────────────────────────────────────────────
-- Phase 8-D: 연속 기록(스트릭) — profiles에 스냅샷 저장
--
-- 실행: Supabase 대시보드 → SQL Editor → 이 내용 전체 복사-붙여넣기 → Run
-- (03-multi-group.sql 이후에 실행할 것 — 컬럼 GRANT를 그 스크립트 기준으로 재설정함)
--
-- 스트릭은 본인 클라이언트가 계산해서 여기 저장한다 (다른 그룹원의 세션 날짜는
-- RLS상 조회 불가하므로, 그룹 피드 아바타에 표시하려면 profiles 컬럼에 스냅샷을
-- 남기고 그룹 멤버들이 읽을 수 있게 컬럼 GRANT로 노출하는 방식이 필요).
-- ────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS streak_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS streak_date DATE;

REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (id, nickname, created_at, weight_kg, streak_count, streak_date) ON public.profiles TO authenticated;
REVOKE UPDATE ON public.profiles FROM anon, authenticated;
GRANT UPDATE (nickname, weight_kg, streak_count, streak_date) ON public.profiles TO authenticated;

-- ── 검증
-- SELECT column_name FROM information_schema.columns WHERE table_name='profiles';
