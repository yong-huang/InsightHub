import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { documentDiscovery } from './vite-plugins/documentDiscovery'

const PROJECT_DIR = path.resolve(__dirname)
const MINDINSIGHT_DIR = '/Users/hyhit/Desktop/workspace/projects/MindInsight'
const TECHINSIGHT_DIR = '/Users/hyhit/Desktop/workspace/projects/TechInsight'
const LEETCODEINSIGHT_DIR = '/Users/hyhit/Desktop/workspace/projects/LeetCodeInsight'

export default defineConfig({
  plugins: [
    react(),
    documentDiscovery({
      mindInsightDir: MINDINSIGHT_DIR,
      techInsightDir: TECHINSIGHT_DIR,
      leetcodeInsightDir: LEETCODEINSIGHT_DIR,
      aiApiUrl: 'http://127.0.0.1:7001/v1',
      aiModel: 'Qwen/Qwen3.5-27B-4bit',
      workspacesPath: '.insighthub-workspaces.json',
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3060,
    fs: {
      allow: [
        PROJECT_DIR,
        MINDINSIGHT_DIR,
        TECHINSIGHT_DIR,
        LEETCODEINSIGHT_DIR,
      ],
    },
  },
})
