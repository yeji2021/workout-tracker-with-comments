-- ────────────────────────────────────────────────────────────────────────
-- Phase 7: 배포 후 개선 마이그레이션
--
-- 실행: Supabase 대시보드 → SQL Editor → 이 내용 전체 복사-붙여넣기 → Run
-- 01-schema-and-rls.sql 과 달리 DROP 없이 기존 데이터 위에 추가만 한다. (안전)
--
-- 포함 내용
--   1) workout_sessions.started_at / ended_at  (운동 시작/완료 + 경과·소요시간)
--   2) profiles.weight_kg                       (칼로리 추정용, 선택 입력)
--   3) exercise_rest_prefs 테이블 + RLS          (운동별 휴식시간 저장)
-- ────────────────────────────────────────────────────────────────────────

-- ── 1) 세션 시작/종료 시각 ──────────────────────────────────────────
ALTER TABLE public.workout_sessions
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;

-- ── 2) 프로필 체중 (칼로리 추정용, 선택) ────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS weight_kg DECIMAL(5, 2)
    CHECK (weight_kg IS NULL OR (weight_kg > 0 AND weight_kg < 500));

-- profiles는 컬럼 GRANT로 select('*')가 차단돼 있으므로(01-schema-and-rls.sql 참고),
-- weight_kg도 명시적으로 조회/수정 권한을 추가해야 프론트에서 쓸 수 있다.
GRANT SELECT (id, group_id, nickname, created_at, weight_kg) ON public.profiles TO authenticated;
GRANT UPDATE (nickname, weight_kg) ON public.profiles TO authenticated;

-- ── 3) 운동별 휴식시간 설정 ──────────────────────────────────────────
-- 프로필×운동 단위로 휴식 기본값을 저장. 없으면 프론트에서 전역 기본값(60초) 사용.
CREATE TABLE IF NOT EXISTS public.exercise_rest_prefs (
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  rest_seconds INT NOT NULL CHECK (rest_seconds BETWEEN 10 AND 600),
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (profile_id, exercise_id)
);

ALTER TABLE public.exercise_rest_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rest_prefs_all_own" ON public.exercise_rest_prefs
  FOR ALL USING (profile_id = public.current_profile_id())
  WITH CHECK (profile_id = public.current_profile_id());

-- updated_at 자동 갱신 (01-schema-and-rls.sql의 set_updated_at() 재사용)
CREATE TRIGGER rest_prefs_set_updated_at
  BEFORE UPDATE ON public.exercise_rest_prefs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 4) 세션 복구용 RPC: 로컬 프로필 캐시가 지워졌어도 익명 세션이
--    살아있으면 조용히 내 프로필을 재조회 (재온보딩 방지, 복구코드 불필요)
CREATE FUNCTION public.get_my_profile()
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_profile profiles%ROWTYPE;
  v_invite text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  SELECT * INTO v_profile FROM profiles WHERE auth_user_id = auth.uid();
  IF v_profile.id IS NULL THEN
    RETURN NULL; -- 이 익명 세션에 연결된 프로필 없음 → 프론트가 온보딩으로 분기
  END IF;

  SELECT invite_code INTO v_invite FROM groups WHERE id = v_profile.group_id;

  RETURN json_build_object(
    'profile_id', v_profile.id,
    'group_id', v_profile.group_id,
    'nickname', v_profile.nickname,
    'invite_code', v_invite
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.get_my_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;

-- ── 검증 ─────────────────────────────────────────────────────────────
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'workout_sessions' AND column_name IN ('started_at','ended_at');
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'profiles' AND column_name = 'weight_kg';
-- SELECT * FROM public.exercise_rest_prefs LIMIT 1;
