export const meta = {
  name: 'reel-to-routine',
  description: '릴스 투 루틴 기능 구현 — 계약(DB+타입+배선) 단독 → UI 2 + 스킬 1 병렬 → 빌드검증 + 통합리뷰',
  whenToUse: 'REEL-TO-ROUTINE.md 설계 문서를 실제 구현으로 옮길 때. args로 단계별 추론 강도(effort)와 범위를 조절한다.',
  phases: [
    { title: '계약', detail: 'DB 마이그레이션 + 타입 + 데이터레이어 + 라우트/탭 배선 (공유 파일 단독 점유)' },
    { title: '구현', detail: '등록·목록 UI / 결과검토·저장 UI / 운동매칭+릴스처리 스킬 — 신규 파일만, 3-way 병렬' },
    { title: '검증', detail: 'tsc+build 통과시키기 → 설계문서 대조 통합 리뷰' },
  ],
}

// ── args 로 조절되는 설정 ────────────────────────────────────────────
// reel-to-routine.args.json 내용을 그대로 Workflow 의 args 로 넘기면 된다.
const cfg = args || {}

const EFFORT = Object.assign(
  { contract: 'high', ui: 'medium', skill: 'high', build: 'low', review: 'high' },
  cfg.effort || {},
)
const MODEL = cfg.model || {}
const SKIP = new Set(cfg.skip || [])
const MODE = cfg.mode === 'plan' ? 'plan' : 'implement'

function o(kind, extra) {
  const base = { effort: EFFORT[kind] }
  if (MODEL[kind]) base.model = MODEL[kind]
  return Object.assign(base, extra || {})
}

const PLAN_SUFFIX = `

[모드: PLAN] 파일을 절대 수정/생성하지 마라. 읽기와 조사만 하고, 만들 파일 경로 · 각 파일의 핵심 코드 스켈레톤 · 위험 지점을 텍스트로 반환하라.`
const IMPL_SUFFIX = `

[모드: IMPLEMENT] 실제로 파일을 작성하라. 아래 "점유 파일" 밖의 파일은 절대 수정하지 마라 — 다른 에이전트가 동시에 작업 중이다. 읽는 것은 자유다.`
const SUFFIX = MODE === 'plan' ? PLAN_SUFFIX : IMPL_SUFFIX

const REPO = `프로젝트: /Users/yjjeon/Desktop/workout-tracker-with-comments (Vite + React 19 + TS + Tailwind4 + Supabase, PWA).
설계 문서: REEL-TO-ROUTINE.md — 반드시 먼저 전부 읽어라.
관례:
- SQL 마이그레이션은 scripts/0N-*.sql 에 추가하고 Supabase 대시보드에서 수동 실행하는 방식이다. scripts/03-multi-group.sql, scripts/04-streak.sql 의 주석 스타일·RLS·컬럼 GRANT 패턴을 그대로 따라라.
- 도메인 타입은 src/lib/types.ts 한 곳에 모은다.
- 데이터 접근은 src/lib/*.ts (예: routines.ts, workouts.ts) 에 함수로 분리하고 컴포넌트는 그것만 호출한다.
- 색은 항상 CSS 변수(var(--color-accent), var(--color-text-dim) 등)를 쓴다. 하드코딩 hex 금지 — 테마 3종을 지원한다.
- 주석과 UI 문구는 한국어. 기존 파일들의 주석 밀도·어투를 맞춰라.
- oxlint 를 쓴다. 미사용 변수/임포트 남기지 마라.`

const CONTRACT_SCHEMA = {
  type: 'object',
  required: ['migrationFile', 'types', 'api', 'routePath', 'resultShape', 'notes'],
  properties: {
    migrationFile: { type: 'string', description: '생성한 SQL 파일 경로' },
    types: {
      type: 'array',
      description: 'src/lib/types.ts 에 추가한 타입들',
      items: {
        type: 'object',
        required: ['name', 'definition'],
        properties: {
          name: { type: 'string' },
          definition: { type: 'string', description: 'TS 정의 원문' },
        },
      },
    },
    api: {
      type: 'array',
      description: 'src/lib/routineImports.ts 에 만든 함수들',
      items: {
        type: 'object',
        required: ['name', 'signature', 'purpose'],
        properties: {
          name: { type: 'string' },
          signature: { type: 'string', description: '완전한 TS 시그니처' },
          purpose: { type: 'string' },
        },
      },
    },
    routePath: { type: 'string', description: '가져오기 화면 라우트 경로' },
    resultShape: { type: 'string', description: 'result jsonb 의 확정 TS 타입 원문' },
    notes: { type: 'string', description: '후속 에이전트가 알아야 할 제약·주의점' },
  },
}

const REVIEW_SCHEMA = {
  type: 'object',
  required: ['verdict', 'findings', 'manualSteps'],
  properties: {
    verdict: { type: 'string', enum: ['ok', 'needs-work'] },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['severity', 'file', 'issue', 'fix'],
        properties: {
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          file: { type: 'string' },
          issue: { type: 'string' },
          fix: { type: 'string' },
        },
      },
    },
    manualSteps: {
      type: 'array',
      description: '사용자가 직접 해야 하는 일 (SQL 실행, 키 설정 등)',
      items: { type: 'string' },
    },
  },
}

// ── 1단계: 계약 ─────────────────────────────────────────────────────
phase('계약')

const contract = await agent(
  `${REPO}

너는 "릴스 투 루틴" 기능의 토대를 혼자 만든다. 뒤이어 3개의 에이전트가 네가 정한 타입·함수 시그니처에만 의존해 UI와 스킬을 병렬로 작성한다. 그러니 시그니처를 확정적으로 정하고, 애매하게 남기지 마라.

점유 파일 (이 파일들만 수정/생성):
1. scripts/05-routine-imports.sql — REEL-TO-ROUTINE.md 4절의 routine_imports 테이블 + RLS.
   - 사용자는 본인 profile_id 행만 insert/select. queued 상태일 때만 delete 허용.
   - update 는 사용자에게 주지 않는다 (처리는 service_role 이 한다).
   - "내 루틴으로 저장"이 끝난 항목을 사용자가 정리할 수 있어야 하므로 done/failed 행의 delete 정책도 판단해서 결정하고 주석으로 이유를 남겨라.
   - 03/04 스크립트처럼 상단에 실행 순서 안내 주석, 하단에 검증용 SELECT 주석을 넣어라.
2. src/lib/types.ts — RoutineImport, ImportStatus, ImportPlatform, 그리고 result jsonb 구조 타입(ExtractedRoutine / ExtractedExercise). 기존 파일 끝에 섹션 주석과 함께 append. 기존 타입은 건드리지 마라.
3. src/lib/routineImports.ts (신규) — 데이터 접근 레이어. 최소한:
   - listImports(profileId): 최신순 목록
   - createImport(profileId, url, userNote): URL 패턴으로 platform 판별(인스타 릴스/유튜브/그 외) 후 insert. 잘못된 URL 은 던진다.
   - deleteImport(id)
   - saveAsRoutine(profileId, extracted): 편집된 ExtractedRoutine 을 기존 routines/routine_entries 로 저장. src/lib/routines.ts 의 createRoutine 을 재사용할 수 있으면 재사용하고, 미매칭 운동(matched_exercise_id 가 null)을 커스텀 exercise 로 먼저 생성해야 하는 경로도 처리해라. src/lib/routines.ts 와 src/lib/workouts.ts 를 읽고 기존 방식에 맞춰라.
4. src/App.tsx — 가져오기 화면 라우트 추가. 페이지 컴포넌트는 아직 없으므로, src/pages/ImportPage.tsx 에서 named export \`ImportPage\` 를 import 하는 형태로 배선만 하고 그 파일 자체는 만들지 마라(다음 단계 담당). 라우트가 컴파일 안 되는 상태로 잠깐 남는 것은 허용된다.
5. src/components/AppLayout.tsx — 하단 탭/네비에 진입점 추가. 기존 탭 구성을 먼저 읽고, 탭이 이미 꽉 차 보이면 설정/루틴 화면 안의 진입점으로 대신 두고 그 판단을 notes 에 적어라.

반드시 지켜라:
- Supabase service_role 키는 프론트/레포에 절대 넣지 않는다. 앱은 anon 키로만 큐에 쌓고 읽는다.
- 사용자에게 노출되는 상태 문구: 대기중/처리중/완료/실패.
- 반환값은 다음 에이전트들이 그대로 참조하는 계약이다. api 의 signature 는 실제로 파일에 쓴 것과 글자 단위로 일치해야 한다.${SUFFIX}`,
  o('contract', { label: 'contract:db+types+wiring', phase: '계약', schema: CONTRACT_SCHEMA }),
)

if (!contract) {
  log('계약 단계 실패 — 이후 단계를 중단한다.')
  return { error: 'contract phase failed' }
}

const CONTRACT_TEXT = `[1단계가 확정한 계약]
마이그레이션: ${contract.migrationFile}
라우트: ${contract.routePath}

타입 (src/lib/types.ts):
${(contract.types || []).map((t) => `${t.name}:\n${t.definition}`).join('\n\n')}

result jsonb 타입:
${contract.resultShape}

데이터 레이어 (src/lib/routineImports.ts) — 이 시그니처를 그대로 쓴다. 바꾸지 마라:
${(contract.api || []).map((f) => `- ${f.signature}  // ${f.purpose}`).join('\n')}

주의사항: ${contract.notes}`

log(`계약 확정: 타입 ${(contract.types || []).length}개, API ${(contract.api || []).length}개, 라우트 ${contract.routePath}`)

// ── 2단계: 구현 (3-way 병렬, 신규 파일만) ───────────────────────────
phase('구현')

const TASKS = [
  {
    key: 'ui-import',
    effort: 'ui',
    label: 'ui:등록+목록',
    prompt: `너의 점유 파일: src/pages/ImportPage.tsx (신규) 하나뿐이다. 다른 파일은 만들지도 수정하지도 마라.

REEL-TO-ROUTINE.md 6절 중 "루틴 가져오기" 등록 화면과 내 가져오기 목록을 만들어라.
- 링크 붙여넣기 + 선택 메모 + 등록 버튼. URL 패턴 검증 실패 시 인라인 에러.
- 등록 직후 목록 상단에 대기중으로 나타나야 한다 (낙관적 갱신 또는 재조회).
- 목록: 상태 뱃지 4종(대기중/처리중/완료/실패), 플랫폼 아이콘/라벨, 등록 시각.
- 실패 항목은 error 사유를 그대로 보여주고 삭제 버튼 제공.
- 완료 항목을 탭하면 결과 검토 시트를 연다. 시트 컴포넌트는 다른 에이전트가 src/components/ImportReviewSheet.tsx 에 named export \`ImportReviewSheet\` 로 만든다. props 계약은 다음 고정값을 그대로 써라:
    { imp: RoutineImport; onClose: () => void; onSaved: () => void }
  import 만 하고 그 파일은 절대 만들지 마라.
- 화면 하단에 "관리자가 주기적으로 처리해요" 안내 문구 (설계문서 8절 처리 지연 안내).
- 로딩/빈 목록 상태 처리. src/pages/RoutinesPage.tsx 와 src/pages/HistoryPage.tsx 의 레이아웃·클래스 관례를 먼저 읽고 그대로 맞춰라.`,
  },
  {
    key: 'ui-review',
    effort: 'ui',
    label: 'ui:결과검토+저장',
    prompt: `너의 점유 파일: src/components/ImportReviewSheet.tsx (신규) 하나뿐이다. 다른 파일은 만들지도 수정하지도 마라.

REEL-TO-ROUTINE.md 6절의 "완료 항목 → 추출 루틴 미리보기 + 편집 + 내 루틴으로 저장"을 만들어라.
- named export: \`export function ImportReviewSheet({ imp, onClose, onSaved }: Props)\`
  Props = { imp: RoutineImport; onClose: () => void; onSaved: () => void } — 이 계약은 고정이다. 바꾸지 마라.
- imp.result(ExtractedRoutine)를 로컬 편집 상태로 복사해서 편집: 루틴 이름, 운동 추가/삭제/순서, 세트 수, 횟수(reps 는 "8-12" 같은 문자열 범위도 들어온다), 메모.
- matched_exercise_id 가 null 인 운동은 시각적으로 구분하고 "커스텀 운동으로 추가" 플로우를 제공. 기존 운동 선택으로 대체하는 경로도 있어야 한다 — src/components/ExercisePicker.tsx 를 먼저 읽고 재사용할 수 있으면 재사용해라.
- source_summary 와 원본 링크를 상단에 보여준다.
- "내 루틴으로 저장" → 계약에 있는 saveAsRoutine 호출 → 성공 시 onSaved().
- 저장 중 중복 클릭 방지, 실패 시 에러 표시.
- 시트 UI 는 src/components/SaveRoutineModal.tsx / GroupManageSheet.tsx 의 오버레이·애니메이션 관례를 그대로 따라라.`,
  },
  {
    key: 'skill-pipeline',
    effort: 'skill',
    label: 'skill:매칭+릴스처리',
    prompt: `너의 점유 파일: src/lib/exerciseMatch.ts (신규) 와 .claude/skills/릴스처리/SKILL.md (신규) 둘뿐이다. 다른 파일은 만들지도 수정하지도 마라.

(1) src/lib/exerciseMatch.ts — 추출된 운동 이름을 exercises 시드 테이블과 매칭하는 정규화 로직.
- 공백/중점/영한 혼용/약어(덤벨=DB, 바벨=BB), "인클라인 벤치프레스" vs "인클라인 벤치 프레스" 같은 변형을 흡수.
- exports: normalizeExerciseName(name), matchExercise(name, exercises) → { exercise, confidence } | null.
- 순수 함수로 유지 — supabase import 금지. 그래야 스킬 쪽에서도 참조 가능하고 테스트하기 쉽다.
- scripts/01-schema-and-rls.sql 의 exercises 시드 목록을 먼저 읽고 실제 이름들을 기준으로 규칙을 세워라.

(2) .claude/skills/릴스처리/SKILL.md — REEL-TO-ROUTINE.md 5절 파이프라인을 프로젝트 스킬로 작성.
- YAML frontmatter (name, description) 필수. description 은 "릴스처리", "가져오기 큐 처리" 등으로 트리거되게 쓴다.
- 단계: queued 조회 → processing 마킹 → claude-in-chrome 으로 링크 열기 → 캡션/설명란 우선 읽기 → 부족할 때만 영상 캡처 폴백 → 구조화 → exercises 매칭 → result 저장 + done/failed.
- 설계문서대로 유튜브 경로를 먼저 확실히 기술하고 인스타는 확장으로 둔다.
- 셀렉터를 고정하지 마라. "화면에서 캡션을 찾아 읽어라" 수준의 유연한 지침으로 써라 (설계문서 8절 리스크).
- service_role 키는 맥 로컬 환경변수에서만 읽고 절대 레포/프론트에 기록하지 않는다는 것을 명시. 키 값 자체를 SKILL.md 에 적지 마라.
- 실패 사유 문구를 사용자에게 그대로 노출하므로 한국어 표준 문구를 정해라 (예: "비공개 계정이라 열람할 수 없어요", "영상에서 루틴 정보를 찾지 못했어요").
- 마지막에 처리 요약 보고(성공/실패 건수, 영상 폴백 비율) 지시.
- 스킬은 문서다. 실제로 브라우저를 열거나 큐를 처리하지는 마라.`,
  },
].filter((t) => !SKIP.has(t.key))

const built = await parallel(
  TASKS.map((t) => () =>
    agent(`${REPO}\n\n${CONTRACT_TEXT}\n\n${t.prompt}${SUFFIX}`, o(t.effort, { label: t.label, phase: '구현' })),
  ),
)

log(`구현 완료: ${built.filter(Boolean).length}/${TASKS.length} 성공`)

// ── 3단계: 검증 ─────────────────────────────────────────────────────
phase('검증')

if (MODE === 'plan' || SKIP.has('verify')) {
  return { contract, built, skipped: 'verify' }
}

const buildResult = await agent(
  `${REPO}\n\n${CONTRACT_TEXT}\n\n방금 4개 에이전트가 "릴스 투 루틴" 기능을 병렬로 구현했다. 지금은 너 혼자만 파일을 쓴다.

\`npm run build\` (tsc -b && vite build) 와 \`npm run lint\` 를 실행해 통과할 때까지 고쳐라.
- 병렬 작성이라 발생하기 쉬운 문제를 우선 의심해라: import 경로 불일치, props 계약 어긋남, 타입 이름 불일치, 미사용 임포트, 컴포넌트 export 형태(named vs default) 불일치.
- 고치는 범위는 배선/타입 정합성까지다. 기능을 새로 설계하거나 UI 를 다시 쓰지 마라.
- 3회 시도해도 못 고치는 에러가 있으면 멈추고 정확한 에러 출력과 원인을 반환해라.
마지막에 build/lint 최종 출력 요약과 네가 고친 파일 목록을 반환해라.`,
  o('build', { label: 'verify:build+lint', phase: '검증' }),
)

const review = await agent(
  `${REPO}\n\n${CONTRACT_TEXT}\n\n빌드 담당 보고:\n${buildResult || '(없음)'}\n\n"릴스 투 루틴" 구현 전체를 REEL-TO-ROUTINE.md 설계 문서와 대조해 리뷰해라. 파일은 수정하지 말고 읽기만 해라.

반드시 확인할 것:
- git diff 로 이번에 추가/변경된 파일 전체를 실제로 읽어라. 요약만 보고 판단하지 마라.
- service_role 키나 Supabase 시크릿이 레포·프론트·SKILL.md 어디에도 없는지 (설계문서 8절, 과거 키 노출 사고 이력 있음).
- RLS 정책이 실제로 타인의 routine_imports 행을 막는지. 컬럼 GRANT 가 03/04 스크립트와 충돌하지 않는지.
- 사용자에게 update 권한을 주지 않았는지, queued 외 상태의 delete 정책이 의도대로인지.
- result jsonb 를 신뢰하고 렌더링하는 곳에서 null/필드누락에 터지지 않는지.
- 색 하드코딩(hex) 없이 CSS 변수만 쓰는지 — 테마 3종 지원.
- 설계문서 6절 UI 체크리스트 5개 항목이 실제로 다 충족됐는지.
근거 없는 추측성 지적은 넣지 마라. 파일과 줄을 짚을 수 있는 것만 findings 에 넣어라. manualSteps 에는 사용자가 직접 해야 하는 일(SQL 실행 등)을 순서대로 적어라.`,
  o('review', { label: 'review:설계대조', phase: '검증', schema: REVIEW_SCHEMA }),
)

return { contract, built, buildResult, review }
