# Supabase 초기 설정 (Phase 1)

## 0단계: 익명 로그인 켜기 (필수 선행)

닉네임+초대코드 방식은 Supabase **익명 세션** 위에서 동작합니다.

1. [Supabase 대시보드](https://app.supabase.com) → 프로젝트 선택
2. **Authentication → Sign In / Providers**
3. **Anonymous sign-ins** 토글 **ON**

이걸 켜지 않으면 앱의 온보딩이 `AUTH_REQUIRED` 로 실패합니다.

## 1단계: 스키마 & RLS 생성

1. 대시보드 → **SQL Editor**
2. `scripts/01-schema-and-rls.sql` **전체 내용** 복사 → 붙여넣기 → **Run**

> ⚠️ 스크립트 상단에 `DROP TABLE IF EXISTS ...` 가 있어 재실행 시 기존 데이터가 초기화됩니다. 신규 설정에는 문제없지만, 데이터가 쌓인 후에는 함부로 재실행하지 마세요.

**생성되는 것**
- 테이블 10개: groups, profiles, exercises, workout_sessions, workout_entries, sets, routines, routine_entries, reactions, comments
- 전 테이블 RLS 정책 (개인 기록 격리 + 공유 세션만 그룹 공개)
- 온보딩/복구 RPC 3종 (아래 참고)
- 기본 운동 시드 70개 (가슴/등/어깨/하체/팔/코어)
- Realtime 등록 (reactions, comments — Phase 5용)

### 검증

SQL Editor에서:

```sql
SELECT primary_muscle_group, count(*) FROM public.exercises GROUP BY 1 ORDER BY 1;
```

→ 6개 부위, 합계 70개면 정상.

## 2단계: 계정/보안 구조 이해 (참고)

- **익명 auth 세션**이 기기를 식별하고, `profiles.auth_user_id` 로 프로필과 연결됩니다.
- 프로필 생성/복구는 테이블 직접 INSERT가 아니라 **RPC만** 사용합니다 (RLS가 직접 쓰기를 차단):

| RPC | 용도 | 반환 |
|---|---|---|
| `create_group_and_join(nickname)` | 새 그룹 만들고 참여 | profile_id, group_id, invite_code, **recovery_code** |
| `join_group(invite_code, nickname)` | 초대코드로 참여 | 〃 |
| `recover_profile(recovery_code)` | 폰 변경 시 재연결 | profile_id, group_id, nickname, invite_code |

- `recovery_code` 는 **RPC 응답에서 단 한 번만** 받을 수 있고, 이후 어떤 SELECT로도 조회 불가(컬럼 권한 차단). 온보딩 화면에서 반드시 사용자에게 보여주고 저장을 유도해야 합니다.
- 에러 코드: `AUTH_REQUIRED`, `PROFILE_EXISTS`, `INVALID_INVITE_CODE`, `NICKNAME_TAKEN`, `INVALID_RECOVERY_CODE`, `ALREADY_LINKED`

## 3단계: 프론트엔드 온보딩 (다음 작업)

- [ ] 익명 세션 부트스트랩 (`supabase.auth.signInAnonymously()`)
- [ ] 온보딩 UI: 닉네임 → 그룹 생성 or 초대코드 입력
- [ ] 복구 코드 안내 화면 (복사 버튼 + "저장했어요" 확인)
- [ ] 복구 플로우: 복구 코드 입력 → `recover_profile`
- [ ] 로컬 스토리지에 profile_id 캐시

## 용어 정리

- **Group**: 친구 그룹. 고유 `invite_code` (6자리) 보유
- **Profile**: 사용자. 닉네임 + (숨겨진) 복구코드
- **Recovery Code**: 폰 변경 시 데이터 복구용 20자 코드. 발급 시 1회만 노출
- **Invite Code**: 그룹 참여용 코드. 친구에게 공유
