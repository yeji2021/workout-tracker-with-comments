-- ────────────────────────────────────────────────────────────────────────
-- Phase 8-A: 멀티 그룹 + 공유 단위 분리 (SOCIAL-V2.md 참고)
--
-- 실행: Supabase 대시보드 → SQL Editor → 이 내용 전체 복사-붙여넣기 → Run
-- 01/02 스크립트와 달리 이번엔 파괴적 변경 포함 (컬럼 drop). 백필 후 drop이라
-- 순서를 반드시 지켜야 함 — 전체를 한 번에 실행할 것.
--
-- 핵심 변경
--   1) profiles.group_id(1인1그룹) → group_members(다대다)
--   2) workout_sessions.is_shared(불리언) → session_shares(세션×그룹, 멘트+하이라이트)
--   3) reactions/comments: session_id → share_id (그룹별 스레드 분리)
--   4) groups.name 추가 (그룹 탭 표시용)
--   5) RPC: create_group / join_group_existing / leave_group 신설
-- ────────────────────────────────────────────────────────────────────────

-- ────────────────────────────────────────────────────────────────────────
-- 1) group_members — profiles.group_id에서 백필
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.group_members (
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (group_id, profile_id)
);
CREATE INDEX IF NOT EXISTS idx_group_members_profile ON public.group_members (profile_id);

INSERT INTO public.group_members (group_id, profile_id, joined_at)
  SELECT group_id, id, created_at FROM public.profiles
  ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────
-- 2) session_shares — 세션×그룹 관계. is_shared=true 세션 + 이미 반응/댓글이
--    달린 세션(과거에 공유했다 해제한 경우 고아 방지)까지 포함해 백필.
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.session_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.workout_sessions(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  message TEXT CHECK (message IS NULL OR char_length(message) <= 120),
  highlights JSONB, -- {kind:'pr'|'new_exercise'|'tired', title, prs:[...], new_exercises:[...]}
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (session_id, group_id)
);
CREATE INDEX IF NOT EXISTS idx_session_shares_group ON public.session_shares (group_id, created_at DESC);

INSERT INTO public.session_shares (session_id, group_id, created_at)
  SELECT DISTINCT s.id, s.group_id, s.created_at
  FROM public.workout_sessions s
  WHERE s.is_shared = true
     OR EXISTS (SELECT 1 FROM public.reactions r WHERE r.session_id = s.id)
     OR EXISTS (SELECT 1 FROM public.comments c WHERE c.session_id = s.id)
  ON CONFLICT (session_id, group_id) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────
-- 3) 옛 정책 먼저 제거 (session_id/group_id/is_shared 컬럼에 의존하는 정책들 —
--    아래 4)에서 컬럼을 drop하기 전에 반드시 먼저 없애야 한다)
-- ────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "groups_select_mine" ON public.groups;
DROP POLICY IF EXISTS "profiles_select_group" ON public.profiles;
DROP POLICY IF EXISTS "sessions_select" ON public.workout_sessions;
DROP POLICY IF EXISTS "sessions_insert_own" ON public.workout_sessions;
DROP POLICY IF EXISTS "entries_select" ON public.workout_entries;
DROP POLICY IF EXISTS "sets_select" ON public.sets;
DROP POLICY IF EXISTS "reactions_select" ON public.reactions;
DROP POLICY IF EXISTS "reactions_insert_own" ON public.reactions;
DROP POLICY IF EXISTS "comments_select" ON public.comments;
DROP POLICY IF EXISTS "comments_insert_own" ON public.comments;

-- ────────────────────────────────────────────────────────────────────────
-- 4) reactions/comments: session_id → share_id (그룹별 스레드 분리)
-- ────────────────────────────────────────────────────────────────────────
ALTER TABLE public.reactions ADD COLUMN IF NOT EXISTS share_id UUID REFERENCES public.session_shares(id) ON DELETE CASCADE;
UPDATE public.reactions r SET share_id = ss.id
  FROM public.session_shares ss WHERE ss.session_id = r.session_id AND r.share_id IS NULL;
ALTER TABLE public.reactions ALTER COLUMN share_id SET NOT NULL;
ALTER TABLE public.reactions DROP CONSTRAINT IF EXISTS reactions_session_id_user_id_emoji_key;
ALTER TABLE public.reactions ADD CONSTRAINT reactions_share_user_emoji_key UNIQUE (share_id, user_id, emoji);
DROP INDEX IF EXISTS idx_reactions_session;
ALTER TABLE public.reactions DROP COLUMN session_id;
CREATE INDEX IF NOT EXISTS idx_reactions_share ON public.reactions (share_id);

ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS share_id UUID REFERENCES public.session_shares(id) ON DELETE CASCADE;
UPDATE public.comments c SET share_id = ss.id
  FROM public.session_shares ss WHERE ss.session_id = c.session_id AND c.share_id IS NULL;
ALTER TABLE public.comments ALTER COLUMN share_id SET NOT NULL;
DROP INDEX IF EXISTS idx_comments_session;
ALTER TABLE public.comments DROP COLUMN session_id;
CREATE INDEX IF NOT EXISTS idx_comments_share ON public.comments (share_id, created_at);

-- ────────────────────────────────────────────────────────────────────────
-- 5) 헬퍼 함수 (SECURITY DEFINER → RLS 재귀 없이 멤버십 확인)
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_group_member(p_group_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT EXISTS (
     SELECT 1 FROM public.group_members gm
     JOIN public.profiles p ON p.id = gm.profile_id
     WHERE gm.group_id = p_group_id AND p.auth_user_id = auth.uid()
   ) $$;

CREATE OR REPLACE FUNCTION public.shares_group_with(p_profile_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT EXISTS (
     SELECT 1 FROM public.group_members mine
     JOIN public.group_members theirs ON theirs.group_id = mine.group_id
     WHERE mine.profile_id = public.current_profile_id()
       AND theirs.profile_id = p_profile_id
   ) $$;

-- ────────────────────────────────────────────────────────────────────────
-- 6) 새 정책
-- ────────────────────────────────────────────────────────────────────────
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "group_members_select" ON public.group_members
  FOR SELECT USING (public.is_group_member(group_id));

CREATE POLICY "groups_select_member" ON public.groups
  FOR SELECT USING (public.is_group_member(id));

CREATE POLICY "groups_update_member" ON public.groups
  FOR UPDATE USING (public.is_group_member(id)) WITH CHECK (public.is_group_member(id));

CREATE POLICY "profiles_select_shared_group" ON public.profiles
  FOR SELECT USING (id = public.current_profile_id() OR public.shares_group_with(id));

CREATE POLICY "sessions_select" ON public.workout_sessions
  FOR SELECT USING (
    user_id = public.current_profile_id()
    OR EXISTS (
      SELECT 1 FROM public.session_shares ss
      WHERE ss.session_id = id AND public.is_group_member(ss.group_id)
    )
  );

CREATE POLICY "sessions_insert_own" ON public.workout_sessions
  FOR INSERT WITH CHECK (user_id = public.current_profile_id());

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

CREATE POLICY "session_shares_select" ON public.session_shares
  FOR SELECT USING (public.is_group_member(group_id));

CREATE POLICY "session_shares_insert_own" ON public.session_shares
  FOR INSERT WITH CHECK (
    public.is_group_member(group_id)
    AND EXISTS (
      SELECT 1 FROM public.workout_sessions s
      WHERE s.id = session_id AND s.user_id = public.current_profile_id()
    )
  );

CREATE POLICY "session_shares_update_own" ON public.session_shares
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.workout_sessions s WHERE s.id = session_id AND s.user_id = public.current_profile_id())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.workout_sessions s WHERE s.id = session_id AND s.user_id = public.current_profile_id())
  );

CREATE POLICY "session_shares_delete_own" ON public.session_shares
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.workout_sessions s WHERE s.id = session_id AND s.user_id = public.current_profile_id())
  );

CREATE POLICY "reactions_select" ON public.reactions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.session_shares ss WHERE ss.id = share_id AND public.is_group_member(ss.group_id))
  );

CREATE POLICY "reactions_insert_own" ON public.reactions
  FOR INSERT WITH CHECK (
    user_id = public.current_profile_id()
    AND EXISTS (SELECT 1 FROM public.session_shares ss WHERE ss.id = share_id AND public.is_group_member(ss.group_id))
  );

CREATE POLICY "comments_select" ON public.comments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.session_shares ss WHERE ss.id = share_id AND public.is_group_member(ss.group_id))
  );

CREATE POLICY "comments_insert_own" ON public.comments
  FOR INSERT WITH CHECK (
    user_id = public.current_profile_id()
    AND EXISTS (SELECT 1 FROM public.session_shares ss WHERE ss.id = share_id AND public.is_group_member(ss.group_id))
  );

-- ────────────────────────────────────────────────────────────────────────
-- 7) 옛 함수/컬럼 제거 (더 이상 참조하는 정책 없음)
-- ────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.current_group_id();

DROP INDEX IF EXISTS idx_sessions_group_shared;
ALTER TABLE public.workout_sessions DROP COLUMN IF EXISTS group_id;
ALTER TABLE public.workout_sessions DROP COLUMN IF EXISTS is_shared;

ALTER TABLE public.profiles DROP COLUMN IF EXISTS group_id;

-- profiles 컬럼 GRANT 재설정 (group_id 제거)
REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (id, nickname, created_at, weight_kg) ON public.profiles TO authenticated;
REVOKE UPDATE ON public.profiles FROM anon, authenticated;
GRANT UPDATE (nickname, weight_kg) ON public.profiles TO authenticated;

-- ────────────────────────────────────────────────────────────────────────
-- 8) groups.name (그룹 탭/관리 화면 표시용)
-- ────────────────────────────────────────────────────────────────────────
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '내 그룹';

-- ────────────────────────────────────────────────────────────────────────
-- 9) RPC 교체/신설
-- ────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.create_group_and_join(text);
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

  LOOP
    v_invite := upper(substr(md5(gen_random_uuid()::text), 1, 6));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM groups WHERE invite_code = v_invite);
  END LOOP;
  v_recovery := substr(md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text), 1, 20);

  INSERT INTO groups (invite_code, name) VALUES (v_invite, '내 그룹') RETURNING id INTO v_group_id;
  INSERT INTO profiles (auth_user_id, nickname, recovery_code)
    VALUES (auth.uid(), trim(p_nickname), v_recovery)
    RETURNING id INTO v_profile_id;
  INSERT INTO group_members (group_id, profile_id) VALUES (v_group_id, v_profile_id);

  RETURN json_build_object(
    'profile_id', v_profile_id,
    'nickname', trim(p_nickname),
    'recovery_code', v_recovery,
    'groups', json_build_array(
      json_build_object('group_id', v_group_id, 'invite_code', v_invite, 'name', '내 그룹')
    )
  );
END $$;

DROP FUNCTION IF EXISTS public.join_group(text, text);
CREATE FUNCTION public.join_group(p_invite_code text, p_nickname text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_group_id uuid;
  v_group_name text;
  v_recovery text;
  v_profile_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;
  IF EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'PROFILE_EXISTS';
  END IF;

  SELECT id, name INTO v_group_id, v_group_name FROM groups WHERE invite_code = upper(trim(p_invite_code));
  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INVITE_CODE';
  END IF;
  IF EXISTS (
    SELECT 1 FROM group_members gm JOIN profiles p ON p.id = gm.profile_id
    WHERE gm.group_id = v_group_id AND p.nickname = trim(p_nickname)
  ) THEN
    RAISE EXCEPTION 'NICKNAME_TAKEN';
  END IF;

  v_recovery := substr(md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text), 1, 20);

  INSERT INTO profiles (auth_user_id, nickname, recovery_code)
    VALUES (auth.uid(), trim(p_nickname), v_recovery)
    RETURNING id INTO v_profile_id;
  INSERT INTO group_members (group_id, profile_id) VALUES (v_group_id, v_profile_id);

  RETURN json_build_object(
    'profile_id', v_profile_id,
    'nickname', trim(p_nickname),
    'recovery_code', v_recovery,
    'groups', json_build_array(
      json_build_object('group_id', v_group_id, 'invite_code', upper(trim(p_invite_code)), 'name', v_group_name)
    )
  );
END $$;

DROP FUNCTION IF EXISTS public.recover_profile(text);
CREATE FUNCTION public.recover_profile(p_recovery_code text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_profile profiles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  SELECT * INTO v_profile FROM profiles WHERE recovery_code = trim(p_recovery_code);
  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION 'INVALID_RECOVERY_CODE';
  END IF;

  IF EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND id <> v_profile.id) THEN
    RAISE EXCEPTION 'ALREADY_LINKED';
  END IF;

  UPDATE profiles SET auth_user_id = auth.uid() WHERE id = v_profile.id;

  RETURN json_build_object(
    'profile_id', v_profile.id,
    'nickname', v_profile.nickname,
    'groups', (
      SELECT COALESCE(json_agg(json_build_object('group_id', g.id, 'invite_code', g.invite_code, 'name', g.name)), '[]'::json)
      FROM group_members gm JOIN groups g ON g.id = gm.group_id
      WHERE gm.profile_id = v_profile.id
    )
  );
END $$;

DROP FUNCTION IF EXISTS public.get_my_profile();
CREATE FUNCTION public.get_my_profile()
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_profile profiles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  SELECT * INTO v_profile FROM profiles WHERE auth_user_id = auth.uid();
  IF v_profile.id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN json_build_object(
    'profile_id', v_profile.id,
    'nickname', v_profile.nickname,
    'groups', (
      SELECT COALESCE(json_agg(json_build_object('group_id', g.id, 'invite_code', g.invite_code, 'name', g.name)), '[]'::json)
      FROM group_members gm JOIN groups g ON g.id = gm.group_id
      WHERE gm.profile_id = v_profile.id
    )
  );
END $$;

-- 새 그룹 만들기 (이미 프로필이 있는 사용자가 그룹을 추가할 때)
CREATE FUNCTION public.create_group(p_name text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_group_id uuid;
  v_invite text;
  v_profile_id uuid;
  v_name text;
BEGIN
  v_profile_id := public.current_profile_id();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;
  v_name := NULLIF(trim(p_name), '');
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'INVALID_NAME';
  END IF;

  LOOP
    v_invite := upper(substr(md5(gen_random_uuid()::text), 1, 6));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM groups WHERE invite_code = v_invite);
  END LOOP;

  INSERT INTO groups (invite_code, name) VALUES (v_invite, v_name) RETURNING id INTO v_group_id;
  INSERT INTO group_members (group_id, profile_id) VALUES (v_group_id, v_profile_id);

  RETURN json_build_object('group_id', v_group_id, 'invite_code', v_invite, 'name', v_name);
END $$;

-- 기존 프로필이 초대코드로 추가 그룹에 참여
CREATE FUNCTION public.join_group_existing(p_invite_code text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_group_id uuid;
  v_group_name text;
  v_profile_id uuid;
  v_nickname text;
BEGIN
  v_profile_id := public.current_profile_id();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  SELECT id, name INTO v_group_id, v_group_name FROM groups WHERE invite_code = upper(trim(p_invite_code));
  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INVITE_CODE';
  END IF;

  IF EXISTS (SELECT 1 FROM group_members WHERE group_id = v_group_id AND profile_id = v_profile_id) THEN
    RAISE EXCEPTION 'ALREADY_MEMBER';
  END IF;

  SELECT nickname INTO v_nickname FROM profiles WHERE id = v_profile_id;
  IF EXISTS (
    SELECT 1 FROM group_members gm JOIN profiles p ON p.id = gm.profile_id
    WHERE gm.group_id = v_group_id AND p.nickname = v_nickname
  ) THEN
    RAISE EXCEPTION 'NICKNAME_TAKEN';
  END IF;

  INSERT INTO group_members (group_id, profile_id) VALUES (v_group_id, v_profile_id);

  RETURN json_build_object('group_id', v_group_id, 'invite_code', upper(trim(p_invite_code)), 'name', v_group_name);
END $$;

-- 그룹 탈퇴 (마지막 남은 그룹은 탈퇴 불가 — 항상 최소 1개 그룹 유지)
CREATE FUNCTION public.leave_group(p_group_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_profile_id uuid;
  v_count int;
BEGIN
  v_profile_id := public.current_profile_id();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  SELECT count(*) INTO v_count FROM group_members WHERE profile_id = v_profile_id;
  IF v_count <= 1 THEN
    RAISE EXCEPTION 'LAST_GROUP';
  END IF;

  DELETE FROM group_members WHERE group_id = p_group_id AND profile_id = v_profile_id;

  IF NOT EXISTS (SELECT 1 FROM group_members WHERE group_id = p_group_id) THEN
    DELETE FROM groups WHERE id = p_group_id;
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.create_group_and_join(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.join_group(text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.recover_profile(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_profile() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_group(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.join_group_existing(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.leave_group(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_group_and_join(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_group(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recover_profile(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_group(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_group_existing(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_group(uuid) TO authenticated;

-- ── Realtime: 새 공유가 피드에 실시간으로 뜨도록
ALTER PUBLICATION supabase_realtime ADD TABLE public.session_shares;

-- ────────────────────────────────────────────────────────────────────────
-- 검증
-- ────────────────────────────────────────────────────────────────────────
-- SELECT * FROM public.group_members LIMIT 5;
-- SELECT * FROM public.session_shares LIMIT 5;
-- SELECT column_name FROM information_schema.columns WHERE table_name='profiles';
-- SELECT column_name FROM information_schema.columns WHERE table_name='workout_sessions';
