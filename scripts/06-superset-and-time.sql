-- ────────────────────────────────────────────────────────────────────────
-- 묶음 운동(슈퍼세트) & 시간 기반 운동 — 설계: SUPERSET-AND-TIME.md
--
-- 실행: Supabase 대시보드 → SQL Editor → 이 내용 전체 복사-붙여넣기 → Run
-- (01 ~ 05 를 모두 실행한 뒤에 실행할 것. 02/05 처럼 추가만 하고 DROP 하지 않으므로
--  기존 데이터는 안전하고, 여러 번 실행해도 같은 결과가 된다.)
--
-- 구조 요약
--   1) exercises.kind         'reps' | 'time'  — 시간 기반은 코어 부위만 허용
--   2) sets.duration_seconds  시간 세트의 실제 기록값 (횟수 세트는 NULL)
--   3) workout_entries/routine_entries 에 묶음 컬럼 3~4개
--      → 새 테이블을 안 만들어서 기존 RLS 정책이 그대로 상속된다
-- ────────────────────────────────────────────────────────────────────────

-- ── 1) 시간 기반 운동 ────────────────────────────────────────────────
ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'reps'
    CHECK (kind IN ('reps', 'time'));

-- 시간 세트는 reps=0 이라 볼륨(weight×reps)이 항상 0 이 된다. 코어는 원래 볼륨 축이
-- 큰 의미가 없는 부위라 괜찮지만, 하체(월 싯) 같은 데 허용하면 그날 볼륨이 실제보다
-- 낮게 찍혀 부위별 비교가 조용히 틀어진다. 그래서 코어로 가둔다.
-- 나중에 풀고 싶으면 이 제약만 DROP 하면 된다 (그래서 이름을 붙여 뒀다).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'exercises_time_is_core_only'
  ) THEN
    ALTER TABLE public.exercises
      ADD CONSTRAINT exercises_time_is_core_only
        CHECK (kind = 'reps' OR primary_muscle_group = '코어');
  END IF;
END $$;

-- 시간 세트의 기록값. weight_kg 는 시간 세트에서도 쓸 수 있다 (가중 플랭크 등).
ALTER TABLE public.sets
  ADD COLUMN IF NOT EXISTS duration_seconds INT
    CHECK (duration_seconds IS NULL OR duration_seconds BETWEEN 0 AND 7200);

-- 기본 제공 운동은 앱에서 수정할 수 없으므로 kind 를 여기서 확정한다.
-- (마운틴 클라이머처럼 사람마다 갈리는 것은 reps 로 두고, 시간으로 재고 싶으면
--  사용자가 커스텀 운동을 만들면 된다)
UPDATE public.exercises SET kind = 'time'
 WHERE is_default = true AND name IN ('플랭크', '사이드 플랭크');

-- ── 2) 묶음 운동 (슈퍼세트) ──────────────────────────────────────────
-- superset_id: 같은 값을 가진 entry 들이 한 묶음. 세션 안에서만 의미가 있는
--   로컬 식별자라 FK 가 아니다 (루틴 적용 시에는 새 UUID 로 재매핑한다).
-- superset_name / superset_rest_seconds: 멤버 행에 중복 저장한다. 별도 테이블을
--   만들면 RLS 정책 4개와 조인이 붙는데, 이름 변경 시 멤버 N행 UPDATE 가 훨씬 싸다.
ALTER TABLE public.workout_entries
  ADD COLUMN IF NOT EXISTS superset_id UUID,
  ADD COLUMN IF NOT EXISTS superset_name TEXT
    CHECK (superset_name IS NULL OR char_length(trim(superset_name)) BETWEEN 1 AND 30),
  ADD COLUMN IF NOT EXISTS superset_rest_seconds INT
    CHECK (superset_rest_seconds IS NULL OR superset_rest_seconds BETWEEN 10 AND 600);

CREATE INDEX IF NOT EXISTS idx_entries_superset
  ON public.workout_entries (session_id, superset_id);

-- 루틴에도 같은 구조 + 적용 시 만들 라운드 수
ALTER TABLE public.routine_entries
  ADD COLUMN IF NOT EXISTS superset_id UUID,
  ADD COLUMN IF NOT EXISTS superset_name TEXT
    CHECK (superset_name IS NULL OR char_length(trim(superset_name)) BETWEEN 1 AND 30),
  ADD COLUMN IF NOT EXISTS superset_rest_seconds INT
    CHECK (superset_rest_seconds IS NULL OR superset_rest_seconds BETWEEN 10 AND 600),
  ADD COLUMN IF NOT EXISTS default_rounds INT
    CHECK (default_rounds IS NULL OR default_rounds BETWEEN 1 AND 20);

-- ── 검증 ─────────────────────────────────────────────────────────────
-- SELECT name, kind FROM public.exercises WHERE kind = 'time';  -- 플랭크 2종
-- SELECT count(*) FROM public.sets WHERE duration_seconds IS NOT NULL;  -- 처음엔 0
