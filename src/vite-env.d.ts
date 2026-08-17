/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// 빌드 시각 + 커밋 해시. vite.config.ts 의 define 이 주입한다.
// "업데이트했는데 그대로다"를 판별하려면 폰이 지금 어느 빌드를 돌리는지
// 눈으로 볼 수 있어야 한다 (설정 화면 맨 아래에 표시).
declare const __BUILD_ID__: string
