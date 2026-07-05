-- ────────────────────────────────────────────────────────────────────────
-- Phase 1: Supabase 스키마 & RLS (행 수준 보안)  — v2 (검토 반영)
--
-- 실행: Supabase 대시보드 → SQL Editor → 이 내용 전체 복사-붙여넣기 → Run
--
-- 사전 조건: Authentication → Sign In / Providers → "Anonymous sign-ins" ON
--   (완전한 로그인 없이 닉네임+초대코드로 쓰기 위해 익명 세션을 사용)
--
-- 설계 요약
--   - 사용자 식별: Supabase 익명 auth 세션(auth.uid()) ↔ profiles.auth_user_id 로 연결
--   - 온보딩/복구는 아래 RPC 3종만 사용 (테이블 직접 INSERT는 RLS가 차단):
--       create_group_and_join(nickname)  새 그룹 만들고 참여
--       join_group(invite_code, nickname) 초대코드로 기존 그룹 참여
--       recover_profile(recovery_code)    폰 변경 시 기존 프로필 재연결
--   - 개인 기록은 본인만, 공유(is_shared) 세션만 같은 그룹이 읽기 가능
--   - recovery_code 는 컬럼 단위 GRANT 로 어떤 SELECT 에서도 노출되지 않음
-- ────────────────────────────────────────────────────────────────────────

-- ── 초기화 (신규 프로젝트 기준 — 기존 데이터가 있다면 모두 삭제됨에 주의)
DROP TABLE IF EXISTS public.comments CASCADE;
DROP TABLE IF EXISTS public.reactions CASCADE;
DROP TABLE IF EXISTS public.routine_entries CASCADE;
DROP TABLE IF EXISTS public.routines CASCADE;
DROP TABLE IF EXISTS public.sets CASCADE;
DROP TABLE IF EXISTS public.workout_entries CASCADE;
DROP TABLE IF EXISTS public.workout_sessions CASCADE;
DROP TABLE IF EXISTS public.exercises CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.groups CASCADE;
DROP FUNCTION IF EXISTS public.current_profile_id();
DROP FUNCTION IF EXISTS public.current_group_id();
DROP FUNCTION IF EXISTS public.create_group_and_join(text);
DROP FUNCTION IF EXISTS public.join_group(text, text);
DROP FUNCTION IF EXISTS public.recover_profile(text);
DROP FUNCTION IF EXISTS public.set_updated_at();

-- ────────────────────────────────────────────────────────────────────────
-- 테이블
-- ────────────────────────────────────────────────────────────────────────

-- ── Groups (친구 그룹) — 초대코드 하나로 묶이는 단위
CREATE TABLE public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_code TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Profiles (사용자)
-- auth_user_id: 현재 연결된 익명 auth 세션. 폰 변경(복구) 시 이 값만 교체된다.
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL CHECK (char_length(trim(nickname)) BETWEEN 1 AND 20),
  recovery_code TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (group_id, nickname) -- 같은 그룹 안에서 닉네임 중복 방지
);

-- ── Exercises (운동 정의)
-- is_default=true 는 기본 제공(시드). created_by 가 있으면 그 사용자의 커스텀 운동.
CREATE TABLE public.exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  primary_muscle_group TEXT NOT NULL, -- '가슴' | '등' | '어깨' | '하체' | '팔' | '코어'
  secondary_muscle_group TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  CHECK (is_default = true OR created_by IS NOT NULL) -- 시드가 아니면 소유자 필수
);

-- ── Workout Sessions (하루 운동 세션) — 하루 1개 (데일리 운동 개념)
CREATE TABLE public.workout_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  is_shared BOOLEAN NOT NULL DEFAULT false, -- true 인 세션만 그룹 피드에 노출
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, date)
);

-- ── Workout Entries (세션 내 운동 항목, 순서 있음)
CREATE TABLE public.workout_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.workout_sessions(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES public.exercises(id),
  order_index INT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Sets (세트: 무게/횟수/완료)
CREATE TABLE public.sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES public.workout_entries(id) ON DELETE CASCADE,
  weight_kg DECIMAL(10, 2),
  reps INT NOT NULL CHECK (reps >= 0),
  is_completed BOOLEAN NOT NULL DEFAULT false,
  order_index INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Routines (루틴)
CREATE TABLE public.routines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.routine_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_id UUID NOT NULL REFERENCES public.routines(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES public.exercises(id),
  order_index INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Reactions (공유 세션에 대한 이모지)
CREATE TABLE public.reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.workout_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (session_id, user_id, emoji)
);

-- ── Comments (공유 세션에 대한 댓글)
CREATE TABLE public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.workout_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  text TEXT NOT NULL CHECK (char_length(text) BETWEEN 1 AND 1000),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── 인덱스 (RLS 서브쿼리/조회 성능)
CREATE INDEX idx_profiles_auth_user ON public.profiles (auth_user_id);
CREATE INDEX idx_profiles_group ON public.profiles (group_id);
CREATE INDEX idx_sessions_user_date ON public.workout_sessions (user_id, date DESC);
CREATE INDEX idx_sessions_group_shared ON public.workout_sessions (group_id, is_shared, date DESC);
CREATE INDEX idx_entries_session ON public.workout_entries (session_id, order_index);
CREATE INDEX idx_sets_entry ON public.sets (entry_id, order_index);
CREATE INDEX idx_routine_entries_routine ON public.routine_entries (routine_id, order_index);
CREATE INDEX idx_reactions_session ON public.reactions (session_id);
CREATE INDEX idx_comments_session ON public.comments (session_id, created_at);

-- ── comments.updated_at 자동 갱신
CREATE FUNCTION public.set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

CREATE TRIGGER comments_set_updated_at
  BEFORE UPDATE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ────────────────────────────────────────────────────────────────────────
-- 헬퍼 함수 (SECURITY DEFINER → RLS 재귀 없이 내 프로필/그룹 조회)
-- ────────────────────────────────────────────────────────────────────────

CREATE FUNCTION public.current_profile_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT id FROM public.profiles WHERE auth_user_id = auth.uid() $$;

CREATE FUNCTION public.current_group_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT group_id FROM public.profiles WHERE auth_user_id = auth.uid() $$;

-- ────────────────────────────────────────────────────────────────────────
-- RLS 정책
-- ────────────────────────────────────────────────────────────────────────

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routine_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- Groups: 내 그룹만 읽기 (초대코드를 친구에게 보여주기 위해 필요)
-- 생성은 RPC(create_group_and_join)에서만 하므로 INSERT 정책 없음
CREATE POLICY "groups_select_mine" ON public.groups
  FOR SELECT USING (id = public.current_group_id());

-- Profiles: 같은 그룹 멤버 읽기(닉네임 표시용), 본인만 수정
-- 생성/복구는 RPC 전용. recovery_code 는 아래 컬럼 GRANT 로 아예 노출 차단.
CREATE POLICY "profiles_select_group" ON public.profiles
  FOR SELECT USING (group_id = public.current_group_id());

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- recovery_code 컬럼 노출 차단 (컬럼 단위 SELECT 권한)
REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (id, group_id, nickname, created_at) ON public.profiles TO authenticated;
-- UPDATE 도 닉네임만 허용
REVOKE UPDATE ON public.profiles FROM anon, authenticated;
GRANT UPDATE (nickname) ON public.profiles TO authenticated;

-- Exercises: 기본 운동 + 내 커스텀 운동만 보임, 커스텀 추가는 본인 소유로만
CREATE POLICY "exercises_select" ON public.exercises
  FOR SELECT USING (is_default = true OR created_by = public.current_profile_id());

CREATE POLICY "exercises_insert_custom" ON public.exercises
  FOR INSERT WITH CHECK (is_default = false AND created_by = public.current_profile_id());

CREATE POLICY "exercises_update_own_custom" ON public.exercises
  FOR UPDATE USING (created_by = public.current_profile_id())
  WITH CHECK (is_default = false AND created_by = public.current_profile_id());

CREATE POLICY "exercises_delete_own_custom" ON public.exercises
  FOR DELETE USING (created_by = public.current_profile_id());

-- Workout Sessions: 본인 전체 권한, 같은 그룹은 공유된 것만 읽기
CREATE POLICY "sessions_select" ON public.workout_sessions
  FOR SELECT USING (
    user_id = public.current_profile_id()
    OR (is_shared = true AND group_id = public.current_group_id())
  );

CREATE POLICY "sessions_insert_own" ON public.workout_sessions
  FOR INSERT WITH CHECK (
    user_id = public.current_profile_id()
    AND group_id = public.current_group_id()
  );

CREATE POLICY "sessions_update_own" ON public.workout_sessions
  FOR UPDATE USING (user_id = public.current_profile_id())
  WITH CHECK (user_id = public.current_profile_id());

CREATE POLICY "sessions_delete_own" ON public.workout_sessions
  FOR DELETE USING (user_id = public.current_profile_id());

-- Workout Entries: 세션 접근 규칙을 그대로 상속
CREATE POLICY "entries_select" ON public.workout_entries
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.workout_sessions s
      WHERE s.id = session_id
        AND (s.user_id = public.current_profile_id()
          OR (s.is_shared = true AND s.group_id = public.current_group_id()))
    )
  );

CREATE POLICY "entries_write_own" ON public.workout_entries
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.workout_sessions s
            WHERE s.id = session_id AND s.user_id = public.current_profile_id())
  );

CREATE POLICY "entries_update_own" ON public.workout_entries
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.workout_sessions s
            WHERE s.id = session_id AND s.user_id = public.current_profile_id())
  );

CREATE POLICY "entries_delete_own" ON public.workout_entries
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.workout_sessions s
            WHERE s.id = session_id AND s.user_id = public.current_profile_id())
  );

-- Sets: 상위 entry → session 규칙 상속
CREATE POLICY "sets_select" ON public.sets
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.workout_entries e
      JOIN public.workout_sessions s ON s.id = e.session_id
      WHERE e.id = entry_id
        AND (s.user_id = public.current_profile_id()
          OR (s.is_shared = true AND s.group_id = public.current_group_id()))
    )
  );

CREATE POLICY "sets_insert_own" ON public.sets
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workout_entries e
      JOIN public.workout_sessions s ON s.id = e.session_id
      WHERE e.id = entry_id AND s.user_id = public.current_profile_id()
    )
  );

CREATE POLICY "sets_update_own" ON public.sets
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.workout_entries e
      JOIN public.workout_sessions s ON s.id = e.session_id
      WHERE e.id = entry_id AND s.user_id = public.current_profile_id()
    )
  );

CREATE POLICY "sets_delete_own" ON public.sets
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.workout_entries e
      JOIN public.workout_sessions s ON s.id = e.session_id
      WHERE e.id = entry_id AND s.user_id = public.current_profile_id()
    )
  );

-- Routines: 전부 본인 전용
CREATE POLICY "routines_all_own" ON public.routines
  FOR ALL USING (user_id = public.current_profile_id())
  WITH CHECK (user_id = public.current_profile_id());

CREATE POLICY "routine_entries_all_own" ON public.routine_entries
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.routines r
            WHERE r.id = routine_id AND r.user_id = public.current_profile_id())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.routines r
            WHERE r.id = routine_id AND r.user_id = public.current_profile_id())
  );

-- Reactions: 같은 그룹의 공유 세션에만, 반드시 본인 명의로만 (사칭 차단)
CREATE POLICY "reactions_select" ON public.reactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.workout_sessions s
      WHERE s.id = session_id
        AND s.is_shared = true AND s.group_id = public.current_group_id()
    )
  );

CREATE POLICY "reactions_insert_own" ON public.reactions
  FOR INSERT WITH CHECK (
    user_id = public.current_profile_id()
    AND EXISTS (
      SELECT 1 FROM public.workout_sessions s
      WHERE s.id = session_id
        AND s.is_shared = true AND s.group_id = public.current_group_id()
    )
  );

CREATE POLICY "reactions_delete_own" ON public.reactions
  FOR DELETE USING (user_id = public.current_profile_id());

-- Comments: 같은 그룹의 공유 세션에만, 반드시 본인 명의로만 (사칭 차단)
CREATE POLICY "comments_select" ON public.comments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.workout_sessions s
      WHERE s.id = session_id
        AND s.is_shared = true AND s.group_id = public.current_group_id()
    )
  );

CREATE POLICY "comments_insert_own" ON public.comments
  FOR INSERT WITH CHECK (
    user_id = public.current_profile_id()
    AND EXISTS (
      SELECT 1 FROM public.workout_sessions s
      WHERE s.id = session_id
        AND s.is_shared = true AND s.group_id = public.current_group_id()
    )
  );

CREATE POLICY "comments_update_own" ON public.comments
  FOR UPDATE USING (user_id = public.current_profile_id())
  WITH CHECK (user_id = public.current_profile_id());

CREATE POLICY "comments_delete_own" ON public.comments
  FOR DELETE USING (user_id = public.current_profile_id());

-- ────────────────────────────────────────────────────────────────────────
-- 온보딩/복구 RPC (SECURITY DEFINER — 프론트엔드가 호출하는 유일한 쓰기 경로)
-- ────────────────────────────────────────────────────────────────────────

-- 새 그룹을 만들고 그 그룹의 첫 멤버로 참여
CREATE FUNCTION public.create_group_and_join(p_nickname text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_group_id uuid;
  v_invite text;
  v_recovery text;
  v_profile_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;
  IF EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'PROFILE_EXISTS';
  END IF;

  -- 초대코드: 6자리 대문자 hex (중복 시 재시도)
  LOOP
    v_invite := upper(substr(md5(gen_random_uuid()::text), 1, 6));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM groups WHERE invite_code = v_invite);
  END LOOP;
  v_recovery := substr(md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text), 1, 20);

  INSERT INTO groups (invite_code) VALUES (v_invite) RETURNING id INTO v_group_id;
  INSERT INTO profiles (auth_user_id, group_id, nickname, recovery_code)
    VALUES (auth.uid(), v_group_id, trim(p_nickname), v_recovery)
    RETURNING id INTO v_profile_id;

  RETURN json_build_object(
    'profile_id', v_profile_id,
    'group_id', v_group_id,
    'nickname', trim(p_nickname),
    'invite_code', v_invite,
    'recovery_code', v_recovery
  );
END $$;

-- 초대코드로 기존 그룹에 참여
CREATE FUNCTION public.join_group(p_invite_code text, p_nickname text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_group_id uuid;
  v_recovery text;
  v_profile_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;
  IF EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'PROFILE_EXISTS';
  END IF;

  SELECT id INTO v_group_id FROM groups WHERE invite_code = upper(trim(p_invite_code));
  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INVITE_CODE';
  END IF;
  IF EXISTS (SELECT 1 FROM profiles WHERE group_id = v_group_id AND nickname = trim(p_nickname)) THEN
    RAISE EXCEPTION 'NICKNAME_TAKEN';
  END IF;

  v_recovery := substr(md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text), 1, 20);

  INSERT INTO profiles (auth_user_id, group_id, nickname, recovery_code)
    VALUES (auth.uid(), v_group_id, trim(p_nickname), v_recovery)
    RETURNING id INTO v_profile_id;

  RETURN json_build_object(
    'profile_id', v_profile_id,
    'group_id', v_group_id,
    'nickname', trim(p_nickname),
    'invite_code', upper(trim(p_invite_code)),
    'recovery_code', v_recovery
  );
END $$;

-- 폰 변경 등으로 새 익명 세션이 됐을 때, 복구 코드로 기존 프로필 재연결
CREATE FUNCTION public.recover_profile(p_recovery_code text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_profile profiles%ROWTYPE;
  v_invite text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  SELECT * INTO v_profile FROM profiles WHERE recovery_code = trim(p_recovery_code);
  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION 'INVALID_RECOVERY_CODE';
  END IF;

  -- 현재 익명 세션이 이미 다른 프로필에 연결돼 있으면 그 연결을 해제하지 않고 거부
  IF EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND id <> v_profile.id) THEN
    RAISE EXCEPTION 'ALREADY_LINKED';
  END IF;

  UPDATE profiles SET auth_user_id = auth.uid() WHERE id = v_profile.id;
  SELECT invite_code INTO v_invite FROM groups WHERE id = v_profile.group_id;

  RETURN json_build_object(
    'profile_id', v_profile.id,
    'group_id', v_profile.group_id,
    'nickname', v_profile.nickname,
    'invite_code', v_invite
  );
END $$;

-- RPC 실행 권한: 로그인(익명 포함)한 사용자만
REVOKE EXECUTE ON FUNCTION public.create_group_and_join(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.join_group(text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.recover_profile(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_group_and_join(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_group(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recover_profile(text) TO authenticated;

-- ── Realtime (Phase 5 피드에서 사용: 이모지/댓글 실시간 반영)
ALTER PUBLICATION supabase_realtime ADD TABLE public.reactions, public.comments;

-- ────────────────────────────────────────────────────────────────────────
-- 기본 운동 시드 (부위별 주요 운동 70개)
-- ────────────────────────────────────────────────────────────────────────

-- 가슴
INSERT INTO public.exercises (name, primary_muscle_group, secondary_muscle_group, is_default) VALUES
('벤치 프레스', '가슴', '팔', true),
('인클라인 벤치 프레스', '가슴', '어깨', true),
('디클라인 벤치 프레스', '가슴', null, true),
('덤벨 벤치 프레스', '가슴', '팔', true),
('인클라인 덤벨 프레스', '가슴', '어깨', true),
('덤벨 플라이', '가슴', null, true),
('케이블 플라이', '가슴', null, true),
('펙덱 플라이', '가슴', null, true),
('체스트 프레스 머신', '가슴', '팔', true),
('푸시업', '가슴', '코어', true),
('딥스 (가슴)', '가슴', '팔', true),
('스미스 머신 벤치 프레스', '가슴', '팔', true);

-- 등
INSERT INTO public.exercises (name, primary_muscle_group, secondary_muscle_group, is_default) VALUES
('풀업', '등', '팔', true),
('친업', '등', '팔', true),
('랫 풀다운', '등', '팔', true),
('바벨 로우', '등', null, true),
('덤벨 로우', '등', null, true),
('시티드 케이블 로우', '등', null, true),
('T-바 로우', '등', null, true),
('인버티드 로우', '등', null, true),
('스트레이트 암 풀다운', '등', null, true),
('데드리프트', '등', '하체', true),
('슈러그', '등', '어깨', true),
('백 익스텐션', '등', '코어', true);

-- 어깨
INSERT INTO public.exercises (name, primary_muscle_group, secondary_muscle_group, is_default) VALUES
('오버헤드 프레스', '어깨', '팔', true),
('덤벨 숄더 프레스', '어깨', '팔', true),
('아놀드 프레스', '어깨', null, true),
('머신 숄더 프레스', '어깨', null, true),
('스미스 머신 숄더 프레스', '어깨', null, true),
('사이드 레터럴 레이즈', '어깨', null, true),
('프론트 레이즈', '어깨', null, true),
('벤트오버 레터럴 레이즈', '어깨', '등', true),
('케이블 레터럴 레이즈', '어깨', null, true),
('페이스 풀', '어깨', '등', true),
('업라이트 로우', '어깨', '등', true),
('리버스 펙덱 플라이', '어깨', '등', true);

-- 하체
INSERT INTO public.exercises (name, primary_muscle_group, secondary_muscle_group, is_default) VALUES
('스쿼트', '하체', '코어', true),
('프론트 스쿼트', '하체', '코어', true),
('고블릿 스쿼트', '하체', null, true),
('핵 스쿼트', '하체', null, true),
('스미스 머신 스쿼트', '하체', null, true),
('레그 프레스', '하체', null, true),
('레그 익스텐션', '하체', null, true),
('불가리안 스플릿 스쿼트', '하체', null, true),
('런지', '하체', null, true),
('워킹 런지', '하체', null, true),
('루마니안 데드리프트', '하체', '등', true),
('레그 컬', '하체', null, true),
('라잉 레그 컬', '하체', null, true),
('힙 스러스트', '하체', null, true),
('글루트 킥백', '하체', null, true),
('힙 어브덕션', '하체', null, true),
('카프 레이즈', '하체', null, true),
('시티드 카프 레이즈', '하체', null, true);

-- 팔 (이두/삼두)
INSERT INTO public.exercises (name, primary_muscle_group, secondary_muscle_group, is_default) VALUES
('바벨 컬', '팔', null, true),
('덤벨 컬', '팔', null, true),
('해머 컬', '팔', null, true),
('인클라인 덤벨 컬', '팔', null, true),
('프리처 컬', '팔', null, true),
('케이블 컬', '팔', null, true),
('컨센트레이션 컬', '팔', null, true),
('클로즈 그립 벤치 프레스', '팔', '가슴', true),
('트라이셉스 푸시다운', '팔', null, true),
('로프 푸시다운', '팔', null, true),
('오버헤드 트라이셉스 익스텐션', '팔', null, true),
('스컬 크러셔', '팔', null, true),
('트라이셉스 킥백', '팔', null, true),
('벤치 딥스', '팔', null, true);

-- 코어
INSERT INTO public.exercises (name, primary_muscle_group, secondary_muscle_group, is_default) VALUES
('크런치', '코어', null, true),
('바이시클 크런치', '코어', null, true),
('케이블 크런치', '코어', null, true),
('행잉 레그 레이즈', '코어', null, true),
('레그 레이즈', '코어', null, true),
('플랭크', '코어', null, true),
('사이드 플랭크', '코어', null, true),
('러시안 트위스트', '코어', null, true),
('마운틴 클라이머', '코어', null, true),
('AB 롤아웃', '코어', null, true),
('우드 촙', '코어', null, true),
('데드버그', '코어', null, true);

-- ── 검증: 아래 쿼리로 시드 개수 확인 (70이 나와야 정상)
-- SELECT primary_muscle_group, count(*) FROM public.exercises GROUP BY 1 ORDER BY 1;
