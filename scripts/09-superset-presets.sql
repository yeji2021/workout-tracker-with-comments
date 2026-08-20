-- ────────────────────────────────────────────────────────────────────────
-- 묶음 운동(슈퍼세트) 프리셋 — 무게/횟수까지 지정해서 저장해두고, 운동
-- 고르기 화면에서 "폼롤러 복근" 처럼 하나의 운동인 것마냥 골라서 바로
-- 오늘 기록에 추가하는 기능.
--
-- 실행: Supabase 대시보드 → SQL Editor → 이 내용 전체 복사-붙여넣기 → Run
-- (01 ~ 08 을 모두 실행한 뒤에 실행할 것. 새 테이블만 추가하므로 기존
--  데이터는 안전하고, 여러 번 실행해도 같은 결과가 된다.)
--
-- 기존 "루틴"(routines/routine_entries)과 다른 점: 루틴은 하루치 세션
-- 전체(여러 운동/묶음)를 담는 틀이고 적용 시 "지난 기록"에서 세트값을
-- 복사해온다. 이 프리셋은 묶음 하나만 담고, 저장한 무게/횟수를 그대로
-- 다시 넣는다 — 매번 같은 조합·같은 무게로 하는 보조 운동(폼롤러, 스트레칭
-- 묶음 등)을 위한 것.
--
-- scripts/08 에서 겪은 "unqualified id가 서브쿼리 안의 다른 테이블 컬럼으로
-- 섀도잉되는" 실수를 반복하지 않도록, 아래 모든 정책은 FROM 절에 등장하는
-- 테이블들이 같은 이름의 컬럼(id 등)을 갖지 않는지 직접 확인하고 작성함.
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.superset_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 30),
  rest_seconds INT NOT NULL DEFAULT 90,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_superset_presets_user ON public.superset_presets (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.superset_preset_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  preset_id UUID NOT NULL REFERENCES public.superset_presets(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES public.exercises(id),
  order_index INT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_spe_preset ON public.superset_preset_exercises (preset_id, order_index);

CREATE TABLE IF NOT EXISTS public.superset_preset_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  preset_exercise_id UUID NOT NULL REFERENCES public.superset_preset_exercises(id) ON DELETE CASCADE,
  weight_kg NUMERIC,
  reps INT NOT NULL DEFAULT 0,
  duration_seconds INT,
  order_index INT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sps_preset_exercise ON public.superset_preset_sets (preset_exercise_id, order_index);

ALTER TABLE public.superset_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.superset_preset_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.superset_preset_sets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "superset_presets_all_own" ON public.superset_presets;
DROP POLICY IF EXISTS "superset_preset_exercises_all_own" ON public.superset_preset_exercises;
DROP POLICY IF EXISTS "superset_preset_sets_all_own" ON public.superset_preset_sets;

-- 전부 본인 전용 (routines_all_own과 동일한 패턴)
CREATE POLICY "superset_presets_all_own" ON public.superset_presets
  FOR ALL USING (user_id = public.current_profile_id())
  WITH CHECK (user_id = public.current_profile_id());

-- preset_id 는 superset_presets(별칭 p)에 없는 컬럼명이라 unqualified로 써도
-- 바깥(superset_preset_exercises)의 preset_id로 안전하게 resolve됨.
CREATE POLICY "superset_preset_exercises_all_own" ON public.superset_preset_exercises
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.superset_presets p WHERE p.id = preset_id AND p.user_id = public.current_profile_id())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.superset_presets p WHERE p.id = preset_id AND p.user_id = public.current_profile_id())
  );

-- preset_exercise_id 도 superset_preset_exercises(pe)/superset_presets(p) 어느 쪽에도
-- 없는 컬럼명이라 unqualified로 써도 바깥(superset_preset_sets)으로 안전하게 resolve됨.
CREATE POLICY "superset_preset_sets_all_own" ON public.superset_preset_sets
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.superset_preset_exercises pe
      JOIN public.superset_presets p ON p.id = pe.preset_id
      WHERE pe.id = preset_exercise_id AND p.user_id = public.current_profile_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.superset_preset_exercises pe
      JOIN public.superset_presets p ON p.id = pe.preset_id
      WHERE pe.id = preset_exercise_id AND p.user_id = public.current_profile_id()
    )
  );
