# 운동 기록을 공유해도 상대방 피드에 안 뜨는 문제

## 증상

세션을 그룹에 공유("피드에 공유")해도, 같은 그룹의 다른 멤버 피드에는 표시되지 않는다.

## 상태

**해결됨 (2026-08-19).** `scripts/08-fix-shared-session-visibility.sql` 실행 후 디버깅 계정 2개로 `fetchFeed`와 동일한 쿼리를 재현해 B가 A의 공유 세션(운동 항목·세트·닉네임 전부 포함)을 정상적으로 읽는 것까지 확인.

## 재현 방법 (디버깅 계정 2개)

Xcode 시뮬레이터/Playwright UI 대신, 앱과 동일한 `@supabase/supabase-js` 호출을 Node 스크립트로 직접 재현. UI를 거치지 않고 실제 RLS·쿼리 경로만 그대로 실행하므로 더 빠르고 확실함.

- 스크립트: `/private/tmp/claude-501/-Users-yjjeon-Desktop-workout-tracker-with-comments/12f2f20c-9a7c-4cb5-92cf-7d17fd6c13a1/scratchpad/repro-feed-share.mjs` (세션 종료 후 사라질 수 있는 임시 디렉터리 — 재현 필요 시 아래 절차대로 새로 작성)
- 절차: `.env.local`의 anon key로 클라이언트 2개 생성 → 각각 `signInAnonymously()` → A는 `create_group_and_join`, B는 A의 초대코드로 `join_group` → A가 세션+운동항목+세트 삽입 후 `session_shares`에 upsert(공유) → B 시점으로 `workout_sessions`/`workout_entries`/`sets`/`session_shares`를 직접 select
- ⚠️ 이 재현은 **실제 프로덕션 Supabase 프로젝트**에 대해 수행됨(로컬/스테이징 DB 없음). 테스트로 생성된 더미 프로필 2개 + 그룹 1개가 남아있음 — anon key로는 삭제 불가(별도 RPC 없음). 세션/운동기록 데이터는 재현 후 A 권한으로 직접 삭제해 정리함(CASCADE로 entries/sets/session_shares까지 같이 삭제됨).

## 원인

`session_shares` 행 자체는 정상 생성되고, B는 그 행을 읽을 수 있다(`session_shares_select` 정책 통과, `is_group_member(group_id)`가 직접 호출해도 `true`). 그런데 B가 실제 `workout_sessions`/`workout_entries`/`sets`를 읽으면 **에러 없이 조용히 0건**이 나온다. `src/lib/feed.ts`의 `fetchFeed`는 이때:

```ts
const session = row.workout_sessions as Record<string, unknown> | null
if (!session) return null // 세션이 삭제됐지만 share가 남아있는 경우 방어
```

로 그 피드 항목을 통째로 걸러버린다 — 원래 이 방어 로직은 "세션이 삭제됐는데 share만 남은 경우"를 위한 것인데, 실제로는 **RLS가 막아서** `null`이 나오는 케이스를 똑같이 삼켜버려 증상만 보면 구분이 안 됐다.

`sessions_select`/`entries_select`/`sets_select` 세 정책 전부 아래 패턴을 쓰는데, 셋 다 동일하게 막혀 있었다(개별 확인 완료):

```sql
EXISTS (SELECT 1 FROM session_shares ss WHERE ss.session_id = ... AND is_group_member(ss.group_id))
```

처음엔 "실제 배포된 정책이 03-multi-group.sql 파일 내용과 다르게 꼬여 있을 것"이라 추정하고 파일 내용을 그대로 베껴 재생성하는 수정 스크립트를 짰는데 — **실행해도 안 고쳐졌다.** 재조사 결과 진짜 원인은 03-multi-group.sql 원문 자체에 있던 SQL 버그였다:

```sql
CREATE POLICY "sessions_select" ON public.workout_sessions
  FOR SELECT USING (
    user_id = public.current_profile_id()
    OR EXISTS (
      SELECT 1 FROM public.session_shares ss
      WHERE ss.session_id = id AND public.is_group_member(ss.group_id)  -- 여기
    )
  );
```

`ss.session_id = id`의 unqualified `id`가 바깥 `workout_sessions.id`가 아니라 **같은 서브쿼리 안의 `session_shares.id`**(session_shares도 PK 컬럼명이 `id`)로 해석된다. SQL 이름 해석은 안쪽 스코프가 우선이라, 사실상 `ss.session_id = ss.id`를 비교하는 꼴이 되어 **항상 거짓** — group_id가 맞든 안 맞든 이 EXISTS는 절대 참이 될 수 없었다.

`entries_select`/`sets_select`는 각자의 EXISTS 로직 자체는 멀쩡했지만(`ss.session_id = s.id`처럼 제대로 qualify돼 있었음), 내부에서 다시 `FROM public.workout_sessions`를 참조하는 부분이 있고, 그 참조는 (SECURITY DEFINER 함수를 거치지 않는 일반 테이블 참조라) `sessions_select`의 RLS를 그대로 상속받는다. 그래서 근본 원인 하나(`sessions_select`의 컬럼 섀도잉)가 세 정책을 동시에 막은 것이었다.

## 조치

`scripts/08-fix-shared-session-visibility.sql`:
1. **진단부**: `pg_policy`에서 관련 정책들의 실제 배포된 정의(`using_expr`)를 조회
2. **교정부**: `id`를 `workout_sessions.id`로 명시적으로 qualify해서 `sessions_select`/`entries_select`/`sets_select`/`reactions_select`/`comments_select`를 재생성. 멱등적이라 여러 번 실행해도 안전

**검증**: 디버깅 계정 2개로 `fetchFeed`와 동일한 조인 쿼리를 재현 — B가 A의 공유 세션(운동 항목·세트·작성자 닉네임 포함)을 정상적으로 읽는 것 확인.

## 다음에 또 비슷한 일이 생기면

1. UI로 재현하기 전에, 디버깅 계정 2개(익명 세션 2개)를 만들어 **`@supabase/supabase-js`로 직접 RLS 경로를 재현**하는 게 실제 화면을 클릭해가며 재현하는 것보다 훨씬 빠르고 원인을 정확히 좁힌다.
2. "조회 결과가 조용히 비어있다(에러 없음)"는 대부분 RLS가 막은 것 — 클라이언트 코드가 "정상인데 데이터가 없다"고 잘못 해석하는 방어 로직(`if (!x) return null` 류)이 있는지 항상 의심할 것.
3. **"수정했는데도 안 고쳐졌다"는 그 수정 자체를 의심할 신호다.** 기존 SQL/코드를 그대로 베껴서 재적용하는 "복구성 수정"은 원본에 있던 버그까지 같이 옮길 수 있다 — 재실행해도 증상이 그대로면, 재생성한 정책의 SQL을 한 줄씩 다시 읽을 것(특히 다른 테이블도 갖고 있는 동명 컬럼 — `id` 같은 — 의 unqualified 참조가 서브쿼리 안에서 엉뚱한 테이블로 섀도잉되지 않는지).
4. 이 프로젝트의 RLS 정책은 대시보드에 SQL을 수동으로 붙여넣어 적용하므로, 스크립트 파일 = 실제 배포 상태라고 가정하지 말 것. 의심되면 `pg_policy`/`pg_get_expr`로 실제 배포된 정의를 먼저 확인.
