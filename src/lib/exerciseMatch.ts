// 추출된 운동 이름 ↔ exercises 시드 매칭 (REEL-TO-ROUTINE.md 5-4절).
//
// 릴스·유튜브 캡션의 운동 이름은 표기가 제각각이다.
//   "인클라인 벤치프레스" / "인클라인 벤치 프레스" / "incline bench press" / "인클벤치프레스"
// 이런 변형을 하나의 키로 눌러서 scripts/01-schema-and-rls.sql 의 시드 이름과 맞춘다.
//
// 순수 함수만 둔다 — supabase import 금지.
// /릴스처리 스킬도 같은 규칙을 참조해야 하고, 브라우저 없이 단독으로 확인할 수
// 있어야 하기 때문이다.

import type { Exercise } from './types'

export interface ExerciseMatch {
  exercise: Exercise
  confidence: number // 0~1. 1=정확히 일치, 0.95=별칭, 그 이하는 유사도
}

// 이 값 미만이면 매칭 실패로 본다(matched_exercise_id = null → 커스텀 운동 생성).
// 너무 낮추면 "덤벨 컬"과 "케이블 컬" 같은 다른 운동이 엮인다.
const MIN_CONFIDENCE = 0.6

// 유사도 매칭에 줄 수 있는 최대 확신. 철자만 비슷해서 걸린 것이므로
// 정확 일치(1)·별칭(0.95)과는 구분되게 천장을 둔다.
const FUZZY_CEILING = 0.9

// ── 1) 정리 규칙 ────────────────────────────────────────────────────
// 이름에 섞여 들어오는 군더더기(목록 번호, 괄호 주석, 세트 표기, 이모지)를 턴다.
const CLEAN_PATTERNS: [RegExp, string][] = [
  [/^\s*\d+\s*[.)]\s*/, ' '], // "1. 벤치프레스", "2) 스쿼트"
  [/[([{（［〔][^)\]}）］〕]*[)\]}）］〕]/g, ' '], // 괄호 주석: "딥스 (가슴)"
  [/\d+\s*[x×*]\s*\d+/g, ' '], // "3x12", "4 x 10"
  [/\d+\s*(?:세트|회|번|초|분|kg|킬로|reps?|sets?)/g, ' '], // "4세트 12회"
  [/[-–—_/\\|·・:;,.+&~"'`]/g, ' '], // 구분자는 공백으로 (T-바 → t 바)
  [/[^가-힣a-z0-9 ]/g, ' '], // 이모지·기타 기호 제거
]

// ── 2) 토큰 사전 (영문·약어 → 시드에서 쓰는 한글 표기) ──────────────
// 공백으로 쪼갠 토큰 단위로 치환한다. 시드 이름이 전부 한글 음차라서
// 영어로 적힌 캡션을 같은 키로 모으려면 이 단계가 필요하다.
const TOKEN_SYNONYMS: Record<string, string> = {
  // 기구·약어
  dumbbell: '덤벨',
  dumbell: '덤벨',
  db: '덤벨',
  barbell: '바벨',
  bb: '바벨',
  bar: '바',
  cable: '케이블',
  machine: '머신',
  smith: '스미스',
  rope: '로프',
  band: '밴드',
  // 자세·변형
  incline: '인클라인',
  decline: '디클라인',
  flat: '플랫',
  seated: '시티드',
  standing: '스탠딩',
  lying: '라잉',
  bent: '벤트',
  over: '오버',
  bentover: '벤트오버',
  overhead: '오버헤드',
  reverse: '리버스',
  inverted: '인버티드',
  upright: '업라이트',
  straight: '스트레이트',
  close: '클로즈',
  grip: '그립',
  wide: '와이드',
  narrow: '내로우',
  single: '원',
  one: '원',
  arm: '암',
  side: '사이드',
  front: '프론트',
  rear: '리어',
  lateral: '레터럴',
  hanging: '행잉',
  walking: '워킹',
  split: '스플릿',
  bulgarian: '불가리안',
  romanian: '루마니안',
  conventional: '컨벤셔널',
  // 부위
  chest: '체스트',
  back: '백',
  lat: '랫',
  shoulder: '숄더',
  leg: '레그',
  legs: '레그',
  calf: '카프',
  hip: '힙',
  glute: '글루트',
  triceps: '트라이셉스',
  tricep: '트라이셉스',
  pec: '펙',
  deck: '덱',
  abs: 'ab',
  // 동작
  press: '프레스',
  bench: '벤치',
  squat: '스쿼트',
  deadlift: '데드리프트',
  dead: '데드',
  lift: '리프트',
  row: '로우',
  rows: '로우',
  pulldown: '풀다운',
  pushdown: '푸시다운',
  pull: '풀',
  push: '푸시',
  down: '다운',
  up: '업',
  pullup: '풀업',
  chinup: '친업',
  chin: '친',
  pushup: '푸시업',
  dip: '딥스',
  dips: '딥스',
  curl: '컬',
  extension: '익스텐션',
  raise: '레이즈',
  fly: '플라이',
  flye: '플라이',
  shrug: '슈러그',
  face: '페이스',
  hammer: '해머',
  preacher: '프리처',
  concentration: '컨센트레이션',
  skull: '스컬',
  crusher: '크러셔',
  kickback: '킥백',
  abduction: '어브덕션',
  goblet: '고블릿',
  hack: '핵',
  thrust: '스러스트',
  lunge: '런지',
  plank: '플랭크',
  crunch: '크런치',
  bicycle: '바이시클',
  russian: '러시안',
  twist: '트위스트',
  mountain: '마운틴',
  climber: '클라이머',
  rollout: '롤아웃',
  wood: '우드',
  chop: '촙',
  bug: '버그',
  butterfly: '버터플라이',
  crossover: '크로스오버',
  hyperextension: '하이퍼익스텐션',
  ohp: '오버헤드프레스',
  rdl: '루마니안데드리프트',
}

// ── 3) 한글 표기 흔들림 ─────────────────────────────────────────────
// 토큰 치환 뒤, 공백이 하나로 정리된 문자열에 그대로 적용한다.
// (\s* 를 넣은 규칙은 띄어쓰기를 건너뛰고 매칭된다)
const SPELLING_VARIANTS: [RegExp, string][] = [
  [/덤밸|댐벨|담벨/g, '덤벨'],
  [/바밸/g, '바벨'],
  [/벤취/g, '벤치'],
  [/푸쉬/g, '푸시'],
  [/프레쓰/g, '프레스'],
  [/스미쓰/g, '스미스'],
  [/머쉰/g, '머신'],
  [/쇼울더/g, '숄더'],
  [/오버해드/g, '오버헤드'],
  [/프런트/g, '프론트'],
  [/씨티드/g, '시티드'],
  [/래터럴|라테랄/g, '레터럴'],
  [/쓰러스트|트러스트/g, '스러스트'],
  [/스콰트|스쿼드|스퀏/g, '스쿼트'],
  [/익스텐젼|익스탠션/g, '익스텐션'],
  [/크러쉬/g, '크러셔'],
  [/크런지/g, '크런치'],
  [/런쥐/g, '런지'],
  [/플랑크/g, '플랭크'],
  [/칼프/g, '카프'],
  [/로우잉|로잉/g, '로우'],
  [/렛\s*풀/g, '랫풀'],
  [/삼두/g, '트라이셉스'],
  [/트라이셉(?!스)/g, '트라이셉스'], // "트라이셉 킥백" → 트라이셉스 킥백
  [/인클(?!라인)/g, '인클라인'], // "인클벤치프레스" → 인클라인벤치프레스
  [/디클(?!라인)/g, '디클라인'],
  [/팔\s*굽혀\s*펴기/g, '푸시업'],
  [/턱걸이/g, '풀업'],
]

// ── 4) 별칭 (시드 이름 → 같은 운동을 가리키는 다른 이름들) ──────────
// 철자 유사도로는 절대 못 잡는 헬스장 은어·다른 계열 명칭만 담는다.
// "덤벨 런지 → 런지"처럼 단어가 겹치는 축약은 유사도가 알아서 잡으므로 뺀다.
const ALIASES: Record<string, string[]> = {
  '벤치 프레스': ['벤프', '플랫 벤치 프레스', '플랫 벤치'],
  '인클라인 벤치 프레스': ['인클라인 바벨 프레스'],
  '인클라인 덤벨 프레스': ['인덤프'],
  '덤벨 벤치 프레스': ['플랫 덤벨 프레스', '덤벨 프레스'],
  '오버헤드 프레스': ['밀리터리 프레스', '바벨 숄더 프레스'],
  '랫 풀다운': ['랫풀', '라풀'],
  '풀업': ['턱걸이', '풀 업'],
  '바벨 로우': ['벤트오버 로우', '벤트오버 바벨 로우'],
  '덤벨 로우': ['원암 로우', '원암 덤벨 로우'],
  '시티드 케이블 로우': ['케이블 로우', '시티드 로우'],
  '데드리프트': ['컨벤셔널 데드리프트', '데드'],
  '루마니안 데드리프트': ['루마니안데드', '스티프 레그 데드리프트'],
  '백 익스텐션': ['하이퍼 익스텐션', '허리 익스텐션'],
  '사이드 레터럴 레이즈': ['레터럴 레이즈', '사이드 레이즈', '사레레', '숄더 레이즈'],
  '벤트오버 레터럴 레이즈': ['리어 델트 레이즈', '리어 레이즈', '벤트오버 레이즈'],
  '리버스 펙덱 플라이': ['리버스 펙덱', '리어 델트 머신'],
  '펙덱 플라이': ['펙덱', '버터플라이 머신', '버터플라이'],
  '케이블 플라이': ['케이블 크로스오버', '크로스오버'],
  '체스트 프레스 머신': ['체스트 프레스', '머신 체스트 프레스', '머신 벤치 프레스'],
  '스미스 머신 벤치 프레스': ['스미스 벤치 프레스'],
  '스미스 머신 스쿼트': ['스미스 스쿼트'],
  '스미스 머신 숄더 프레스': ['스미스 숄더 프레스'],
  '딥스 (가슴)': ['체스트 딥스', '평행봉 딥스'],
  '스쿼트': ['백 스쿼트', '바벨 스쿼트'],
  '불가리안 스플릿 스쿼트': ['불가리안 스쿼트'],
  '카프 레이즈': ['스탠딩 카프 레이즈', '종아리 레이즈'],
  '힙 스러스트': ['바벨 힙 스러스트'],
  '트라이셉스 푸시다운': ['케이블 푸시다운', '푸시다운'],
  '오버헤드 트라이셉스 익스텐션': ['프렌치 프레스', '오버헤드 익스텐션'],
  '스컬 크러셔': ['라잉 트라이셉스 익스텐션'],
  'AB 롤아웃': ['앱 롤아웃', '복근 롤아웃', '휠 롤아웃'],
  '플랭크': ['엘보 플랭크', '프론트 플랭크'],
}

// ── 5) 서로 배타적인 표시어 ─────────────────────────────────────────
// 철자 유사도만 보면 "바벨 벤치프레스"가 "벤치 프레스"(0.80)보다
// "덤벨 벤치 프레스"(0.83)에 더 가깝다 — 한 글자 차이라서.
// 같은 그룹의 표시어를 서로 다르게 갖고 있으면 다른 운동으로 보고 후보에서 뺀다.
const EXCLUSIVE_MARKERS: string[][] = [
  ['덤벨', '바벨', '케이블', '머신', '스미스', '밴드'], // 기구
  ['인클라인', '디클라인', '플랫'], // 각도
]

// ── 정규화 ──────────────────────────────────────────────────────────

interface Prepared {
  key: string // 공백까지 제거한 최종 비교 키
  tokens: string[] // 단어 단위 비교용
}

function computePrepared(name: string): Prepared {
  let text = String(name ?? '')
    .normalize('NFC')
    .toLowerCase()
  for (const [pattern, replacement] of CLEAN_PATTERNS) {
    text = text.replace(pattern, replacement)
  }

  // 영문·약어 토큰을 한글 표기로 (복수형 s/es 는 떼고 한 번 더 본다)
  const mapped = text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      const direct = TOKEN_SYNONYMS[token]
      if (direct) return direct
      const singular = token.replace(/e?s$/, '')
      return TOKEN_SYNONYMS[singular] ?? token
    })

  // 한글 표기 흔들림은 붙여 쓴 경우까지 잡아야 해서 문자열 상태로 처리한다
  let joined = mapped.join(' ')
  for (const [pattern, replacement] of SPELLING_VARIANTS) {
    joined = joined.replace(pattern, replacement)
  }

  const tokens = joined.trim().split(/\s+/).filter(Boolean)
  return { key: tokens.join(''), tokens }
}

// 같은 이름이 반복해서 들어온다(운동 하나당 시드 70여 개를 훑는다).
// 순수 함수라 입력이 같으면 결과도 같으므로 결과만 캐시해 둔다.
const prepCache = new Map<string, Prepared>()

function prepare(name: string): Prepared {
  const cached = prepCache.get(name)
  if (cached) return cached
  const prepared = computePrepared(name)
  if (prepCache.size > 500) prepCache.clear() // 무한정 커지지 않게
  prepCache.set(name, prepared)
  return prepared
}

// 운동 이름을 비교용 키로 정규화한다.
// 공백·구분자·괄호·세트 표기를 털고, 영문/약어를 한글 표기로 바꾼 결과.
//   "Incline DB Press" → "인클라인덤벨프레스"
//   "딥스 (가슴)"       → "딥스"
export function normalizeExerciseName(name: string): string {
  return prepare(name).key
}

// ── 유사도 ──────────────────────────────────────────────────────────

// 인접 2글자 묶음. 한 글자짜리는 자기 자신을 쓴다.
function bigrams(text: string): string[] {
  if (text.length < 2) return text ? [text] : []
  const out: string[] = []
  for (let i = 0; i < text.length - 1; i++) out.push(text.slice(i, i + 2))
  return out
}

// Dice 계수 (0~1). 중복도 세는 multiset 기준.
function dice(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const pool = new Map<string, number>()
  for (const item of a) pool.set(item, (pool.get(item) ?? 0) + 1)
  let hit = 0
  for (const item of b) {
    const left = pool.get(item) ?? 0
    if (left > 0) {
      pool.set(item, left - 1)
      hit++
    }
  }
  return (2 * hit) / (a.length + b.length)
}

// 두 키가 같은 그룹에서 다른 표시어를 갖고 있으면 true (= 다른 운동).
// 한쪽에만 표시어가 있는 것은 충돌이 아니다 — "벤치프레스"는 "덤벨 벤치 프레스"의
// 축약일 수 있기 때문.
function hasMarkerConflict(a: string, b: string): boolean {
  for (const group of EXCLUSIVE_MARKERS) {
    const inA = group.filter((marker) => a.includes(marker))
    if (inA.length === 0) continue
    const inB = group.filter((marker) => b.includes(marker))
    if (inB.length === 0) continue
    if (!inA.some((marker) => inB.includes(marker))) return true
  }
  return false
}

// 별칭 → 시드 이름 (둘 다 정규화된 키). 처음 쓸 때 한 번만 만든다.
let aliasIndex: Map<string, string> | null = null

function getAliasIndex(): Map<string, string> {
  if (aliasIndex) return aliasIndex
  const index = new Map<string, string>()
  for (const [canonical, variants] of Object.entries(ALIASES)) {
    const target = normalizeExerciseName(canonical)
    for (const variant of variants) {
      const key = normalizeExerciseName(variant)
      if (key && key !== target) index.set(key, target)
    }
  }
  aliasIndex = index
  return index
}

// 이름 하나를 운동 목록과 맞춘다. 확신이 MIN_CONFIDENCE 미만이면 null.
//
// 순서: 정규화 일치(1) → 별칭 일치(0.95) → 철자·단어 유사도(≤0.9).
// 점수가 같으면 (1) 길이 차가 작은 것 (2) 기본 운동 (3) 목록에서 먼저 나온 것.
//
// 0.6~0.8 구간은 "비슷하긴 한데 확신은 없는" 상태다("컬" → "바벨 컬"처럼
// 원래 이름이 너무 짧을 때 나온다). 자동으로 matched_exercise_id 에 넣을 때는
// 0.8 이상만 쓰고, 그 아래는 사용자에게 확인시키거나 null 로 두는 편이 안전하다.
export function matchExercise(
  name: string,
  exercises: Exercise[],
): ExerciseMatch | null {
  const query = prepare(name)
  if (!query.key) return null

  const aliasTarget = getAliasIndex().get(query.key) ?? null
  const queryGrams = bigrams(query.key)

  let best: ExerciseMatch | null = null
  let bestGap = Number.POSITIVE_INFINITY

  for (const exercise of exercises) {
    const candidate = prepare(exercise.name)
    if (!candidate.key) continue

    let confidence: number
    if (candidate.key === query.key) {
      confidence = 1
    } else if (aliasTarget && candidate.key === aliasTarget) {
      confidence = 0.95
    } else {
      if (hasMarkerConflict(query.key, candidate.key)) continue
      const score = Math.max(
        dice(queryGrams, bigrams(candidate.key)),
        dice(query.tokens, candidate.tokens),
      )
      if (score < MIN_CONFIDENCE) continue
      confidence = Math.min(score, FUZZY_CEILING)
    }

    const gap = Math.abs(candidate.key.length - query.key.length)
    if (!best) {
      best = { exercise, confidence }
      bestGap = gap
      continue
    }
    if (confidence > best.confidence) {
      best = { exercise, confidence }
      bestGap = gap
      continue
    }
    if (confidence === best.confidence) {
      if (gap < bestGap || (gap === bestGap && exercise.is_default && !best.exercise.is_default)) {
        best = { exercise, confidence }
        bestGap = gap
      }
    }
  }

  return best
}
