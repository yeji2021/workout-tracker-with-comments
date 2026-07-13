# 소셜 공유 기능 v2 설계 (Phase 8)

> **구현 완료** (2026-07-08). 8-A~8-E 프론트엔드/스키마 코드 전부 작성됨.
> **DB 마이그레이션 실행 필요**: `scripts/03-multi-group.sql` → `scripts/04-streak.sql` 순서로
> Supabase 대시보드 SQL Editor에서 실행해야 실제로 동작함 (이 환경에는 DB 실행 권한 없음).

> 2026-07-07 확정. 피드 재미 요소(자동 타이틀/멘트/히트맵/스트릭/리캡/라이브) + **멀티 그룹 구조 개편**을 하나의 일관된 설계로 통합.
> 전제: IMPROVEMENTS.md의 Phase 7 중 2번(운동 시작/완료, `started_at/ended_at`)은 스키마 반영 완료 상태.

## 확정 요구사항 요약

| # | 항목 | 비고 |
|---|------|------|
| 1 | 피드 카드 우측에 **미니 바디 히트맵** (작게) | 운동명 칩과의 레이아웃 설계 포함 |
| 2 | 카드 상단 **자동 타이틀**: PR 달성 / 새 운동 도전 / 컨디션 저하 | "오늘은 좀 피곤한가봐요 ㅜ" 등 멘트 |
| 3 | **주간 그룹 리캡** 카드 | |
| 4 | **N일 연속 스트릭** 표시 | |
| 5 | **"지금 운동 중" 라이브** + 실시간 응원 | |
| 6 | 공유 시 **짧은 멘트(캡션)** 입력 (셋로그 스타일) | |
| 7 | **멀티 그룹**: 1인이 여러 그룹 참여, 같은 기록을 여러 그룹에 공유 | 공유 UI 세분화 |

---

## 1. 데이터 모델 개편 — 멀티 그룹 + 공유 단위 분리

### 현재 구조의 한계
- `profiles.group_id` 단일 FK → 1인 1그룹 고정.
- `workout_sessions.is_shared` 불리언 + `group_id` → "공유한다/안 한다"만 있고 **어디에** 공유하는지 선택 불가.
- `reactions`/`comments`가 `session_id` 직결 → 여러 그룹 공유 시 스레드 분리 불가.

### 새 구조 (핵심 결정 3가지)

**결정 ① 멤버십 테이블 분리** — `profiles.group_id` → `group_members` 다대다.

```sql
CREATE TABLE group_members (
  group_id   UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (group_id, profile_id)
);
```

- 닉네임은 프로필 전역 1개 유지(그룹마다 다른 닉네임 X — 단순함 우선). 그룹 참여 시 그 그룹 안에서 닉네임 중복만 검사.
- `profiles.group_id`는 마이그레이션 후 **당분간 유지(deprecated)** — 복구/RPC 하위호환용. UI는 참조하지 않는다.

**결정 ② 공유 = 세션과 그룹 사이의 관계 레코드** — `is_shared` 불리언 → `session_shares` 테이블.

```sql
CREATE TABLE session_shares (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
  group_id   UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  message    TEXT CHECK (message IS NULL OR char_length(message) <= 120), -- 셋로그식 캡션
  highlights JSONB,          -- 공유 시점 스냅샷 (아래 2절)
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (session_id, group_id)  -- 같은 그룹에 중복 공유 방지
);
```

- 세션은 순수 개인 기록이 되고(`workout_sessions.group_id`·`is_shared`는 deprecated), 공유는 "세션 → 그룹" 관계로 N개 생성 가능.
- 멘트(`message`)와 하이라이트 스냅샷은 **공유 단위**에 붙는다 → 그룹마다 다른 멘트로 공유 가능.

**결정 ③ 리액션/댓글은 공유(share) 단위로 이동** — `session_id` → `share_id`.

- 같은 세션이라도 그룹 A와 그룹 B의 피드 스레드는 **분리**된다.
- 이유: (a) 서로 모르는 그룹끼리 댓글이 섞여 보이면 프라이버시 문제 + 대화 맥락 붕괴. (b) RLS가 "이 share의 그룹 멤버인가" 한 번만 검사하면 되어 단순해짐. (c) 셋로그류 앱의 멘탈 모델("각 그룹은 독립된 공간")과 일치.
- 트레이드오프: 작성자 입장에서 반응이 그룹별로 나뉘어 보임 → 내 카드에는 그룹 탭별로 각각 확인 (v1 수용).

### RLS 변경 요지

- 헬퍼 교체: `current_group_id()` → `is_group_member(gid uuid)` (SECURITY DEFINER, `group_members` EXISTS 검사).
- `groups` / `profiles` SELECT: "나와 그룹을 하나라도 공유하는가"로 변경.
- `workout_sessions`(+entries/sets) SELECT: `본인 OR EXISTS(session_shares × 내가 멤버인 그룹)`.
- `session_shares`: INSERT는 `내 세션 AND 내가 멤버인 그룹`만, SELECT는 그 그룹 멤버, DELETE(공유 취소)는 세션 소유자.
- `reactions`/`comments`: share → group 멤버십 상속. 본인 명의 강제는 기존 유지.

### RPC 변경

| RPC | 변경 |
|-----|------|
| `create_group_and_join` | 기존 프로필이 있으면 `PROFILE_EXISTS` 예외 → **멤버십만 추가** (새 그룹 개설) |
| `join_group` | 동일 — 기존 프로필이면 멤버십 추가. 해당 그룹 내 닉네임 중복 검사 |
| `leave_group(group_id)` | 신설. 마지막 남은 그룹은 탈퇴 불가(v1 단순화). 내 share/댓글/리액션은 CASCADE 정리 |
| `get_my_profile` / `recover_profile` | 반환에 `groups: [{id, invite_code, member_count}]` 배열 추가 |

### 마이그레이션 순서 (`scripts/03-social-v2.sql`, 무파괴)

1. `group_members` 생성 → `profiles.group_id`에서 백필.
2. `session_shares` 생성 → `is_shared=true` 세션마다 (session, 기존 group_id) 1행 백필.
3. `reactions`/`comments`에 `share_id` 추가 → session→share 매핑으로 백필 → NOT NULL 전환, `session_id` 컬럼과 구정책 제거.
4. RLS/헬퍼/RPC 교체. Realtime publication에 `session_shares` 추가.
5. `profiles`에 스트릭 컬럼 추가 (4절).

---

## 2. 공유 플로우 — ShareSheet (바텀시트)

기존 "공유하기" 토글 버튼을 **공유 시트**로 교체. 진입점: LogPage 운동 완료 요약, 세션 상세(Phase 7-3)의 플로팅 버튼.

```
┌─────────────────────────────┐
│  피드에 공유하기               │
│                             │
│  ✓ 🏋️ 헬창들      (5명)      │   ← 내 그룹 다중 선택 체크박스
│  ✓ 👯 대학동기     (3명)      │      (이미 공유된 그룹은 체크 상태 + "공유됨",
│  ☐ 💼 회사 헬스팟  (4명)      │       해제하면 공유 취소 = share 삭제)
│                             │
│  🏆 벤치 프레스 80kg 신기록!   │   ← 자동 하이라이트 제안 (탭하면 켜기/끄기)
│                             │
│  ┌─────────────────────┐    │
│  │ 오늘 드디어 뚫었다 ㅠㅠ │    │   ← 멘트 입력 (선택, 120자)
│  └─────────────────────┘    │
│                             │
│  [ 2개 그룹에 공유 ]          │
└─────────────────────────────┘
```

- 그룹이 1개뿐이면 선택 UI 생략(자동 선택), 멘트+하이라이트만 노출.
- 멘트는 그룹별 별도 입력이 아니라 **한 번 입력 → 선택된 모든 그룹에 동일 적용** (v1 단순화; `message`는 share별 저장이므로 나중에 그룹별 편집 확장 가능).

### 자동 하이라이트 (`highlights` JSONB 스냅샷)

**공유 시점에 클라이언트가 본인 과거 기록으로 계산해서 저장.** 타인 기록 RLS 노출이 필요 없으므로 TODO의 "PR 뱃지 보류" 문제가 자연 해소된다.

```json
{
  "kind": "pr",                       // 'pr' | 'new_exercise' | 'tired' | null
  "title": "🏆 벤치 프레스 80kg 신기록!",
  "prs": [{ "name": "벤치 프레스", "weight_kg": 80 }],
  "new_exercises": ["케이블 크런치"]
}
```

판정 규칙 (우선순위 pr > new_exercise > tired, 유틸 `src/lib/highlights.ts`):

| kind | 조건 | 타이틀 예시 |
|------|------|------------|
| `pr` | 이 세션 어떤 운동의 최고 무게 > 과거 전체 최고 | 🏆 벤치 프레스 80kg 신기록! |
| `new_exercise` | 과거 기록에 없던 운동 포함 | 🌱 새로운 운동에 도전했어요 — 케이블 크런치 |
| `tired` | 세션 총볼륨 < 최근 5개 세션 평균의 70% (세션 3개 미만이면 판정 안 함). `started_at/ended_at` 있으면 강도(볼륨/분)도 60% 미만일 때만 | 😮‍💨 오늘은 좀 피곤한가봐요 ㅜ |
| `null` | 해당 없음 | (타이틀 없음) |

- **`tired`는 반드시 사용자가 끌 수 있어야 한다** — 시트에서 하이라이트 칩을 탭하면 제외(놀림당하기 싫은 날도 있음). `pr`/`new_exercise`는 기본 켜짐.
- 스냅샷이므로 공유 후 기록을 수정해도 타이틀은 유지(재공유 시 재계산).

---

## 3. 피드 화면 & 카드 레이아웃 v2

### FeedPage 구조 (위→아래)

1. **그룹 탭 바**: `전체 | 헬창들 | 대학동기 | +` — 2개 이상 그룹일 때만 표시. `+` = 그룹 관리 시트(새 그룹/초대코드 참여/초대코드 보기/탈퇴). 탭별 안읽음 뱃지(`feedUnread.ts`를 그룹별 last-seen으로 확장).
2. **라이브 바** (5절): "💪 지민 운동 중 · 23분" 가로 스크롤 칩.
3. **주간 리캡 카드** (4절): 월요일~ 그 주 내내 상단 고정, 접기 가능.
4. **피드 카드 리스트**: `session_shares` 기준 조회. "전체" 탭은 모든 내 그룹의 share를 시간순 병합, 카드에 그룹 이름 뱃지 표시. (같은 세션이 겹치는 그룹 2곳에 공유된 경우 중복 노출은 v1 수용 — 엣지 케이스, v2에서 세션 단위 접기)

### FeedCard v2 레이아웃

```
┌──────────────────────────────────────┐
│ ◉🔥7 지민 (나) · 오늘 · 🏋️헬창들   총 볼륨 │
│                              3,240kg │
│ 🏆 벤치 프레스 80kg 신기록!             │  ← highlights.title (있을 때만, 굵게)
│ “오늘 드디어 뚫었다 ㅠㅠ”                │  ← message (있을 때만, 인용 스타일)
│ ┌───────────────────────┬──────────┐ │
│ │ 벤치 프레스 5세트        │   ▟█▙    │ │
│ │ 인클라인 덤벨 3세트      │   ████   │ │  ← 우측: 미니 히트맵
│ │ 케이블 플라이 3세트      │   █  █   │ │     (고정폭 ~96px)
│ │ 딥스 3세트  · +2개       │          │ │
│ └───────────────────────┴──────────┘ │
│ 👍 3  🔥 1  💪  👏  🎯                │
│ ─────────────────────────────────────│
│ 댓글 2개 보기 / 입력                    │
└──────────────────────────────────────┘
```

**미니 히트맵 레이아웃 결정** (검토한 대안 포함):

- **채택: 우측 고정폭 컬럼(~96px), 앞모습 실루엣 1개만.** 운동 칩은 좌측 `flex-1`에서 세로로 흐르고, 히트맵이 카드 높이를 지배하지 않는다. 6부위 중 '등'만 뒷모습 전용인데, 미니에서는 **등을 앞모습 어깨~몸통 상부에 옅은 외곽 글로우로 근사 표현**하거나, 등 볼륨이 지배적인 세션(등이 최대 부위)일 때만 뒷모습으로 스위칭하는 방식. → 구현: `BodyHeatmap`에 `variant: 'full' | 'mini'` prop 추가. mini = 실루엣 1개, h-24(96px), 라벨/여백 제거.
- 대안 A(기각) — 앞+뒤 2개를 초소형으로: 폭 140px+ 필요, 칩 영역이 너무 좁아짐. 30~40px 실루엣은 색 판독 불가.
- 대안 B(기각) — 히트맵을 카드 배경 워터마크로: 예쁘지만 색 대비 문제로 다크/라이트 모두에서 가독성 리스크.
- 운동 칩은 **세로 리스트 최대 4줄 + "+N개"** (탭하면 카드 내 확장). 현재의 가로 wrap 칩은 운동이 많으면 히트맵과 높이 균형이 깨지므로 세로 정렬로 변경.
- 히트맵 탭 → 풀사이즈 히트맵 + 부위별 볼륨 팝오버 (v1은 생략 가능).

### 데이터 조회 변경 (`feed.ts`)

- `fetchFeed(groupId | 'all')`: `session_shares` 기준 select, `workout_sessions → entries → sets/exercises` 조인 유지. 부위별 볼륨(히트맵 데이터)은 이미 내려오는 sets에서 클라이언트 집계(`stats.ts` 재사용).
- Realtime: `session_shares` INSERT/DELETE도 구독 → 새 공유가 실시간으로 뜬다.

---

## 4. 스트릭 & 주간 그룹 리캡

### 스트릭 (N일 연속)

- 저장: `profiles.streak_count INT DEFAULT 0`, `profiles.streak_date DATE` (마지막 반영일). 컬럼 GRANT에 SELECT/UPDATE 추가 (그룹원이 읽을 수 있어야 피드에 표시 가능 — 스냅샷 방식이라 RLS로 타인 세션을 열 필요 없음).
- 갱신: **본인 클라이언트가** ① 운동 완료(endSession) 시 ② 앱 부팅 시 자기 세션 날짜로 재계산 후 UPDATE. 규칙: 오늘 또는 어제 기록 있으면 연속 유지, 이틀 빵꾸나면 0부터.
- 표시: 피드 아바타에 **링 + 🔥N** — 오늘 운동했으면 링 활성(그라데이션), 스트릭 3일 이상이면 숫자 표시. 내 홈 대시보드에도 동일 컴포넌트(`StreakAvatar`) 재사용.

### 주간 그룹 리캡 카드

- **서버 크론 없이 클라이언트 계산**: 현재 그룹 탭의 지난주(월~일) `session_shares`를 집계. 캐시로 재계산 최소화.
- 내용:
  - "지난주 헬창들이 함께 든 무게 **12.4t** 🐘" — 재미 환산: 1.5t 자동차 / 4t 코끼리 / 11t 버스 / 40t 고래 단계별.
  - 멤버별 기여 미니 바 (닉네임 + 볼륨).
  - 🏆 최다 볼륨 / 📅 최다 출석 / 신기록 수(각 share의 `highlights.prs` 집계).
- **"공유된 운동 기준"임을 작은 글씨로 명시** (비공유 세션은 집계 불가 — RLS 설계상 의도된 것).
- 표시 위치: 그룹 탭별 피드 최상단, 월요일에 새 리캡 등장. "전체" 탭에서는 숨김(그룹별 맥락이라).

---

## 5. "지금 운동 중" 라이브 + 실시간 응원

스키마 변경 없음 — **Supabase Realtime presence + broadcast만 사용** (휘발성).

- **Presence**: 그룹마다 채널 `live:group:<group_id>`.
  - LogPage: 활성 세션(`started_at` 있고 `ended_at` 없음) 동안 join, payload `{profile_id, nickname, started_at}`. 완료/이탈 시 leave.
  - FeedPage: 내 그룹 채널들 구독 → 라이브 바에 "💪 지민 운동 중 · 23분" (경과는 `started_at` 기준 로컬 계산).
- **응원 (broadcast)**: 라이브 칩 탭 → 이모지 피커 → 같은 채널에 `{type:'cheer', to, emoji, from_nickname}` broadcast.
  - 운동 중인 상대 LogPage가 수신 → **화면에 이모지 플로팅 애니메이션 + "지민님의 응원 🔥"** 토스트. 세트 중에 친구 응원이 날아오는 이 앱만의 킬러 경험.
  - 휘발성(저장 안 함)이라 부담 없이 연타 가능 — 초당 스로틀만 클라이언트에서.
- 전제: Phase 7-2(시작/완료)가 배포되어 `started_at/ended_at`이 실제로 채워지고 있어야 함.

---

## 6. 진행 순서 & 작업 항목

의존성: **8-A가 전부의 전제** (공유 모델이 바뀌므로 B~D를 먼저 하면 재작업). C는 B와 병행 가능. E는 독립적(7-2 배포만 전제).

### 8-A. 멀티 그룹 기반 ★필수 선행
- [x] `scripts/03-social-v2.sql`: `group_members` + `session_shares` + reactions/comments `share_id` 전환 + 백필 + RLS/헬퍼/RPC 교체 + Realtime publication
- [x] `types.ts`/`profile.ts`: Profile에 `groups[]`, ProfileContext 다중 그룹 반영
- [x] `feed.ts`: share 기준 조회/리액션/댓글로 전환
- [x] FeedPage 그룹 탭 바 + 그룹 관리 시트(만들기/참여/초대코드/탈퇴)
- [x] `feedUnread.ts` 그룹별 last-seen
- [x] 온보딩 문구 조정 (그룹은 나중에 더 만들 수 있음을 암시)

### 8-B. 공유 시트 + 멘트 + 자동 하이라이트
- [x] `highlights.ts`: PR/새운동/tired 판정 + 타이틀 생성 (내 과거 기록만 사용)
- [x] `ShareSheet` 컴포넌트: 그룹 다중 선택, 하이라이트 칩 토글, 멘트 입력, 공유/취소
- [x] LogPage 완료 요약·세션 상세에 진입점 연결
- [x] FeedCard에 타이틀/멘트 렌더링

### 8-C. FeedCard 레이아웃 v2
- [x] `BodyHeatmap` `variant='mini'` (실루엣 1개, 96px, 등 근사 표현)
- [x] 카드 본문 2컬럼: 운동 세로 리스트(4줄+더보기) | 미니 히트맵
- [x] 부위별 볼륨 집계 유틸 연결

### 8-D. 스트릭 + 주간 리캡
- [x] `profiles.streak_count/streak_date` + GRANT (03 sql에 포함)
- [x] 스트릭 재계산 유틸 + endSession/부팅 훅
- [x] `StreakAvatar` (링 + 🔥N) — 피드/홈 공용
- [x] `WeeklyRecapCard`: 그룹 탭별 지난주 집계 + 재미 환산 + 왕들 + PR 수

### 8-E. 라이브 + 응원
- [x] presence 유틸 (`live.ts`): 채널 join/track/구독
- [x] LogPage: 활성 세션 동안 presence + cheer 수신(플로팅 이모지)
- [x] FeedPage: 라이브 바 + 응원 보내기 피커

### 열어둔 것 (v2 이후)
- "전체" 탭에서 중복 share 세션 단위 접기
- 그룹별 멘트 개별 편집
- 리액션 버스트/콤보 애니메이션 (8-C에 얹기 좋음)
- 빠른 반응 프리셋 댓글 칩
