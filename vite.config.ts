import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// 폰이 지금 어느 빌드를 돌리고 있는지 앱 안에서 눈으로 확인하기 위한 표식.
// "업데이트했는데 그대로다"가 (1) 코드가 안 고쳐진 건지 (2) 새 빌드가 기기에
// 도달을 못 한 건지 구분이 안 돼 몇 번을 헛돌았다. 설정 맨 아래에 찍는다.
function buildId(): string {
  const sha =
    process.env.VERCEL_GIT_COMMIT_SHA ??
    (() => {
      try {
        return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
          .toString()
          .trim()
      } catch {
        return ''
      }
    })()
  const t = new Date().toISOString().replace('T', ' ').slice(0, 16)
  return `${t}Z · ${sha.slice(0, 7) || 'nogit'}`
}

// https://vite.dev/config/
export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(buildId()) },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 새 버전 감지 시 자동 새로고침 대신 사용자가 직접 확인하도록(UpdateToast) prompt 모드 사용
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: '운동 트래커',
        short_name: '운동기록',
        description: '개인 운동 기록 + 친구와 공유하는 헬스 트래커',
        theme_color: '#0b0d10',
        background_color: '#0b0d10',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        lang: 'ko',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // 앱 셸(정적 자원)만 캐싱 — 오프라인 데이터 동기화는 2차 범위 밖
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  // 프리뷰 하네스가 PORT 환경변수로 포트를 지정하면 그 포트를 사용한다.
  server: { port: Number(process.env.PORT) || 5173 },
})
