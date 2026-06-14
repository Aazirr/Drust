import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const buildId =
  process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA ?? new Date().toISOString()

export default defineConfig({
  plugins: [react()],
  define: {
    __DRUST_WEB_BUILD_ID__: JSON.stringify(buildId),
  },
})
