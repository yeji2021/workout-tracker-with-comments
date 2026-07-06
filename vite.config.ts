import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // 프리뷰 하네스가 PORT 환경변수로 포트를 지정하면 그 포트를 사용한다.
  server: { port: Number(process.env.PORT) || 5173 },
})
