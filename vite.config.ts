import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
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
