import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// base '/' — сайт в корне домена; маршруты через HashRouter.
// envDir по умолчанию — сам web/, чтобы прочие VITE_* из корня репо не попали в бандл.
export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
