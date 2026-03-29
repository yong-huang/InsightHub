import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const PROJECT_DIR = path.resolve(__dirname)
const MINDINSIGHT_DIR = '/Users/hyhit/Desktop/workspace/projects/MindInsight'
const TECHINSIGHT_DIR = '/Users/hyhit/Desktop/workspace/projects/TechInsight'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3060,
    fs: {
      allow: [
        PROJECT_DIR,
        MINDINSIGHT_DIR,
        TECHINSIGHT_DIR,
      ],
    },
  },
})
