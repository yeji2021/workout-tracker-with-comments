# 묶음 운동(슈퍼세트) & 시간 기반 운동 — 설계

러프 요청 두 가지를 구체화한 문서.

1. **묶음 운동** — 운동 여러 개를 하나로 묶어 라운드 단위로 반복
   예) `덤벨 팔 = (덤벨 컬 3kg×10, 해머 컬 3kg×10) × 3라운드`
2. **시간 기반 운동** — 플랭크처럼 횟수가 아니라 시간으로 기록. 운동 타이머 제공.
   **코어(복근) 부위에 한해서만** 지원한다 (§2.1의 근거 참고).

두 기능은 서로 독립적이지만 마이그레이션 파일 하나(`scripts/06-superset-and-time.sql`)로 같이 적용한다.
시간 기반 운동은 묶음 안에도 들어갈 수 있다 (예: 코어 묶음 = 크런치 15회 + 플랭크 45초).

---

## 1. 용어

| 용어 | 의미 | 화면 표기 |
|---|---|---|
| 묶음 | 함께 돌리는 운동 2개 이상의 집합 | "묶음" (부제: 슈퍼세트) |
| 라운드 | 묶음을 한 바퀴 도는 것 = 묶음의 "세트" | "라운드" |
| 횟수 운동 | 무게×횟수로 기록 (기존 전부) | 기존 UI 그대로 |
| 시간 운동 | 초 단위 시간으로 기록. **코어 부위만** | "시간" 컬럼 + ▶ 버튼 |

라운드 안에서 운동은 **순차 실행(round-robin)** 이다.
`덤벨 컬 → 해머 컬 → (휴식) → 덤벨 컬 → 해머 컬 → (휴식) → …`

---

## 2. 데이터 모델

새 테이블을 만들지 않는다. 기존 `workout_entries` / `routine_entries` / `sets` / `exercises`에
컬럼만 추가한다 → **RLS 정책을 새로 쓸 필요가 없다** (기존 정책이 그대로 상속됨).

### 2.1 시간 기반 운동 — 코어 한정

```sql
-- 운동 정의 자체가 "시간 기반"인지 (플랭크는 언제나 시간 기반)
-- 제약: kind='time' 은 코어 운동에만 허용한다. 아래 §4 참고.
ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'reps'
    CHECK (kind IN ('reps', 'time'));

ALTER TABLE public.exercises
  ADD CONSTRAINT exercises_time_is_core_only
    CHECK (kind = 'reps' OR primary_muscle_group = '코어');

-- 시간 운동 세트의 실제 기록값. 횟수 운동에서는 항상 NULL.
ALTER TABLE public.sets
  ADD COLUMN IF NOT EXISTS duration_seconds INT
    CHECK (duration_seconds IS NULL OR duration_seconds BETWEEN 0 AND 7200);

-- 시드 중 시간 기반이 자연스러운 것만 전환 (기본 운동은 앱에서 수정 불가하므로 여기서 확정)
UPDATE public.exercises SET kind = 'time'
 WHERE is_default = true AND name IN ('플랭크', '사이드 플랭크');
```

**왜 코어로 좁히나 — 볼륨 축을 지키기 위해서**

시간 세트는 `reps = 0`이므로 `setVolume = weight × reps`가 **항상 0**이 된다
(가중 플랭크 20kg여도 0). 즉 시간 운동은 구조적으로 "볼륨에 안 잡히는 운동"이다.

코어는 원래 볼륨 축이 별 의미가 없던 부위라 이게 문제가 되지 않는다.
반면 월 싯(하체)을 허용하면 **다리 운동한 날의 볼륨이 실제보다 낮게 찍힌다** —
부위별 볼륨 비교와 주간 리캡이 조용히 틀어진다.
그래서 "볼륨이 안 잡히는 운동"을 볼륨이 원래 안 중요한 부위 하나에 가둬 둔다.

부수 효과로 시간 기반 토글이 코어에서만 뜨니 UI 분기와 시드 판단 범위도 좁아진다.

**트레이드오프**: 월 싯(하체), 데드행(등) 같은 코어 밖 시간 운동은 만들 수 없다.
필요해지면 `exercises_time_is_core_only` 제약만 드롭하면 풀리도록 이름을 붙여 뒀다.

**세부 규칙**
- 시간 운동의 `sets.reps`는 항상 `0`으로 둔다 (`NOT NULL` 제약 유지).
- **`weight_kg`는 시간 세트에서도 입력 가능하다** — 가중 플랭크, 중량 러시안 트위스트,
  케이블 크런치처럼 코어에도 중량을 쓰는 운동이 많다. 볼륨에는 안 잡히지만 기록으로는 남는다.
- 커스텀 운동 추가 UI에서 "시간 기반" 토글은 **부위가 코어일 때만** 노출한다.
- 코어 안에서는 횟수 운동과 시간 운동이 공존한다 (케이블 크런치 20kg×15회 / 플랭크 45초).
  기본 운동의 `kind`는 마이그레이션에서 확정되며 앱에서 못 바꾼다 — 예컨대 마운틴 클라이머를
  시간으로 재고 싶으면 커스텀 운동으로 하나 만들면 된다.

### 2.2 묶음

```sql
ALTER TABLE public.workout_entries
  -- 같은 값을 가진 entry들이 한 묶음. 세션 안에서만 의미가 있는 로컬 식별자다.
  ADD COLUMN IF NOT EXISTS superset_id UUID,
  -- 묶음 이름. 멤버 행에 중복 저장한다 (별도 테이블/조인 없이 읽기 위함).
  ADD COLUMN IF NOT EXISTS superset_name TEXT
    CHECK (superset_name IS NULL OR char_length(trim(superset_name)) BETWEEN 1 AND 30),
  -- 라운드 사이 휴식(초). 묶음 첫 멤버 행의 값만 사용한다.
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
```

**왜 별도 `superset_groups` 테이블을 안 만드나**
- 묶음의 세트/기록은 결국 각 운동의 `sets` 행에 그대로 남는다 → 통계·PR·지난기록 코드가
  **한 줄도 안 바뀐다**. 묶음은 순전히 "묶어서 보여주고 묶어서 조작하는" 표현 계층이다.
- 테이블이 늘면 RLS 정책 4개 + 조인 + 마이그레이션 롤백 리스크가 붙는다.
  이름/휴식값 중복 저장의 비용(이름 변경 시 멤버 N행 UPDATE)이 훨씬 싸다.

**불변식**
1. 같은 `superset_id`를 가진 entry는 `order_index`가 **연속**이어야 한다.
2. 라운드 수 = 멤버들의 세트 수. 라운드 추가/삭제는 항상 멤버 전원에 동시 적용한다.
   - 방어: 렌더는 `max(멤버별 세트 수)`를 라운드 수로 잡고, 비어 있는 칸은 "＋" 자리로 표시한다.
3. `superset_id IS NULL` = 기존과 동일한 단독 운동.

**라운드 ↔ 세트 매핑**: 3라운드 묶음 = 각 멤버 entry가 세트 3개.
`덤벨 컬.sets[2]` = "3라운드의 덤벨 컬".

---

## 3. 동작 명세

### 3.1 시간 운동 기록

**EntryCard 세트 행 (시간 운동)** — "횟수" 자리가 "시간"으로 바뀌고 ▶가 붙는다. kg는 그대로.

```
세트    kg      시간      ▶      완료   삭제
 1    [ 10 ]  [ 45 ]초    ▶       ✓      ✕
 2    [ 10 ]  [ 45 ]초    ▶       ✓      ✕
```

- 시간은 **초 단위 숫자 입력**. 60초 이상이면 입력창 아래 `1:00` 보조 표기.
- 지난 기록 자동 채우기(autofill)는 기존과 동일하게 동작 — 값만 `duration_seconds`.
- 직접 손으로 시간을 적고 ✓만 눌러도 된다 (타이머는 선택 사항).

**운동 타이머 (`ExerciseTimer.tsx`)**

▶를 누르면 시작. 기존 `RestTimer`와 같은 자리(운동 추가 버튼 아래)에 인라인으로 뜬다.

- 목표 시간이 있으면 **카운트다운**, 0/빈칸이면 **카운트업(스톱워치)**.
- `Date.now()` 절대시각 기반 → 백그라운드 전환·새로고침에도 정확 (RestTimer와 동일 원리).
- 화면 잠금 방지(`wakeLock`), 종료 비프 사전 예약(`audio.ts`), 팝업 알림(`notify.ts`)을
  RestTimer와 **동일한 경로로 재사용**한다.
- 버튼: `−10초` `+10초` (카운트다운일 때만) / `완료` / `취소`
- 종료 처리 (카운트다운 0 도달 또는 `완료` 탭):
  1. 비프 + 진동
  2. 실제 경과 시간을 `duration_seconds`에 저장 (조기 완료 시 실제 경과값이 들어간다)
  3. 그 세트 `is_completed = true`
  4. **이어서 휴식 타이머 자동 시작** (기존 세트 완료 경로와 동일)
- `취소`는 아무것도 기록하지 않고 닫는다.

**동시성**: 운동 타이머와 휴식 타이머는 **동시에 뜨지 않는다.**
운동 타이머를 시작하면 진행 중이던 휴식은 취소된다.
(`audio.ts`의 예약 비프 슬롯이 전역 1개라 구조적으로도 이게 맞다.)

`notify.ts`는 문구가 "휴식 끝!"로 하드코딩돼 있으므로, 제목/본문을 인자로 받도록
일반화한다(`scheduleTimerNotification(endsAt, {title, body})`). 기존 호출부는 래퍼로 유지.

### 3.2 묶음 만들기

`LogPage` 하단 버튼이 둘로 나뉜다: `+ 운동 추가` / `+ 묶음 추가`

`+ 묶음 추가` →
1. **ExercisePicker 다중 선택 모드** (2개 이상 선택해야 다음으로)
2. 묶음 설정 시트
   - 이름 (기본값: 선택한 운동들의 최빈 부위 + " 묶음" — 예 `팔 묶음`)
   - 라운드 수 (기본 **3**)
   - 라운드 간 휴식 (기본 **90초** — 단일 운동 기본값 60초보다 길게)
3. 저장 → 멤버 entry 생성 + 각 멤버에 라운드 수만큼 세트 생성.
   세트 값은 기존 단일 운동 추가와 똑같이 **지난 기록에서 autofill**.

### 3.3 묶음 카드 UI

```
┌──────────────────────────────────────────┐
│ ⠿  덤벨 팔                    3라운드  ⋯ │
│                                          │
│  라운드 1                                │
│    덤벨 컬   ↑↓   [3]kg  [10]회   ✓     │
│    해머 컬   ↑↓   [3]kg  [10]회   ✓     │
│  라운드 2                                │
│    덤벨 컬        [3]kg  [10]회   ✓     │
│    해머 컬        [3]kg  [10]회   ✓     │
│  라운드 3                                │
│    …                                     │
│                                          │
│  ＋ 라운드 추가                          │
└──────────────────────────────────────────┘
```

- `⠿` 드래그 핸들 = **묶음 블록 전체**를 이동 (멤버 개별 이동 불가 — 불변식 1 유지).
- `↑↓` (1라운드 행에만 표시) = 묶음 **안에서** 운동 순서 교체.
- `⋯` 메뉴: `이름 변경` / `라운드 휴식 변경` / `묶음 해제` / `묶음 삭제`
  - **해제**: `superset_id`/`name`/`rest`를 NULL로 → 개별 운동 카드로 분리. 세트 기록은 그대로 유지.
  - **삭제**: 멤버 entry 전부 삭제.
- `＋ 라운드 추가`: 멤버 전원에 세트 1개씩 추가 (직전 라운드 값 복사).
- 메모(`notes`)는 운동별로 존재하므로 묶음 카드에서는 `⋯ → 운동별 메모`로 접어 둔다.

### 3.4 묶음의 휴식 규칙

**라운드가 끝날 때만 쉰다.**

- 묶음 멤버 중 **마지막 운동**의 세트를 ✓ → 휴식 타이머 시작 (길이 = `superset_rest_seconds`)
- 그 앞 운동들의 ✓ → 휴식 없음. 대신 카드에서 다음 운동 행을 강조해 "바로 이어서" 신호를 준다.
- 휴식 중 `±10초` 조정 → 그 묶음의 `superset_rest_seconds`를 갱신(= 다음 라운드부터 적용,
  루틴으로 저장하면 다음에도 유지).
- 단일 운동의 휴식은 기존 그대로 `exercise_rest_prefs`를 쓴다. 묶음 휴식은 그 값을
  **오염시키지 않는다** (덤벨 컬을 단독으로 할 때의 60초는 그대로 남는다).

### 3.5 루틴 연동

`createRoutine(profileId, name, exerciseIds)` → 구조체를 받도록 시그니처를 바꾼다.

```ts
export interface RoutineEntryInput {
  exercise_id: string
  superset_id: string | null
  superset_name: string | null
  superset_rest_seconds: number | null
  default_rounds: number | null
}
```

- **루틴 저장**: 오늘 세션의 묶음 구성과 라운드 수를 그대로 담는다.
- **루틴 적용**(`applyRoutineToToday`): `superset_id`를 **새 UUID로 재매핑**해서 삽입하고
  (`superset_id`는 세션 로컬 식별자다), `default_rounds`만큼 세트를 만든다.
  세트 값은 기존과 동일하게 지난 기록에서 채운다.
- **RoutinesPage / RoutineBuilder**: 묶음을 블록으로 표시하고, 블록 단위 순서 이동·삭제까지 지원.
  편집기에서 **새 묶음을 만드는 기능은 이번 범위 밖** — 묶음 생성은 LogPage에서 하고
  "루틴 저장"으로 굳히는 흐름을 정식 경로로 둔다.
- `routineImports.saveAsRoutine`(릴스 투 루틴)은 묶음 없이 단일 운동만 만든다 (기존과 동일).

---

## 4. 통계·기록에 미치는 영향

묶음은 **영향 없음** (entry/set 구조가 그대로라 모든 계산이 동일).
시간 운동도 코어 한정 제약(§2.1) 덕분에 손댈 곳이 "기록됨" 판정 하나로 줄어든다.

### 바꾸는 곳

`stats.ts`의 `isLogged`가 핵심 변경이다.

```ts
// 현재:  const isLogged = (s: StatSet) => num(s.reps) > 0
// 변경:  시간 세트(reps=0, duration>0)도 "한 세트 했다"로 센다.
const isLogged = (s: StatSet) => num(s.reps) > 0 || num(s.duration_seconds) > 0
```

같은 판정이 아래 3곳에 손으로 복사돼 있으므로, 이 참에 `stats.ts`의 헬퍼를 export 해서
한 곳으로 모은다 (지금 고치지 않으면 "플랭크만 한 날"이 세 화면에서 제각각 보인다):

- `workouts.listSessionsOverview` — 기록 탭 캘린더의 세트 수/빈 세션 필터
- `LogPage.handleComplete` — 완료 요약 모달의 세트 수
- `SessionDetailPage.stats` — 상세 화면의 세트 수/횟수

부수 효과로 `volumeByGroup` · `setCountByGroup` · `workoutDayCount` · `volumeByDate`가
전부 같은 헬퍼를 쓰므로 자동으로 맞춰진다. 코어는 볼륨이 0인 채로 **세트 수 차트에는 잡힌다.**

**`personalRecords`에 가드 한 줄** — 현재 조건은 `!isLogged(st) || st.weight_kg == null`인데,
`isLogged`가 확장되면 가중 플랭크(20kg, reps=0, 60초)가 통과해 "플랭크 20kg × 0회"로
무게 PR 목록에 끼어든다. `num(st.reps) <= 0`이면 건너뛰도록 추가한다.

`getLastPerformance` / `getLastPerformanceMany`의 반환값에 `duration_seconds`를 추가한다
(시간 운동 autofill용). 이건 통계가 아니라 입력 편의 쪽 변경이다.

### 안 바꾸는 곳 (그대로 맞는다)

| 위치 | 이유 |
|---|---|
| `setVolume` (`weight × reps`) | 시간 세트는 `reps=0` → 중량이 있어도 자동으로 0 기여 |
| `highlights.detectHighlights` | PR·컨디션 판정이 모두 `reps > 0`을 먼저 확인 → 시간 세트 무영향 |
| `epley1RM` | 무게 PR 목록에서만 호출되고, 위 가드로 시간 세트가 거기 못 들어감 |

### 이번 범위 밖 (명시적 제외)

- **시간 PR("플랭크 최장 3:20")** — 무게 PR과 축이 달라 `PR` 타입·StatsPage 섹션·
  `session_shares.highlights` jsonb 계약·`FeedCard` 렌더가 연쇄로 바뀐다. 별도 작업으로 분리.
  (시간 운동도 "🌱 새로운 운동" 하이라이트에는 정상적으로 잡힌다.)
- `aiPrompt`의 통계 요약에 시간 운동은 포함하지 않는다.
- 완료 요약/상세 화면의 "총 유지 시간" 표시 — 있으면 좋지만 필수는 아니라 후순위.

---

## 5. 구현 순서

| 단계 | 내용 | 주요 파일 |
|---|---|---|
| 1 | 마이그레이션 + 타입 | `scripts/06-superset-and-time.sql`, `src/lib/types.ts` |
| 2 | 시간 운동 데이터 계층 | `workouts.ts`, `stats.ts`, `restPrefs.ts` |
| 3 | 시간 운동 UI + 운동 타이머 | `EntryCard.tsx`, `ExerciseTimer.tsx`, `ExercisePicker.tsx`, `notify.ts` |
| 4 | 묶음 데이터 계층 | `workouts.ts` (묶음 CRUD, 라운드 조작) |
| 5 | 묶음 UI | `SupersetCard.tsx`, `LogPage.tsx`(블록 렌더/드래그), `SupersetSetupSheet.tsx` |
| 6 | 루틴 연동 | `routines.ts`, `RoutinesPage.tsx`, `RoutineBuilder.tsx`, `SaveRoutineModal.tsx` |
| 7 | `isLogged` 통일 + 빌드/프리뷰 검증 | `stats.ts`, `workouts.ts`, `SessionDetailPage.tsx` |

마이그레이션은 `02`/`05`와 같이 **추가만 하고 DROP 하지 않는다** → 기존 데이터 안전, 재실행 가능.
