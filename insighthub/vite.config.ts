import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import * as fs from 'fs'
import { documentDiscovery } from './vite-plugins/documentDiscovery'

const PROJECT_DIR = path.resolve(__dirname)

// Read workspace paths from config
function loadWorkspacePaths(): string[] {
  const configPath = path.resolve(PROJECT_DIR, '.insighthub-workspaces.json')
  let workspaces: any[] = []
  try {
    if (fs.existsSync(configPath)) {
      const wsConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      if (Array.isArray(wsConfig)) workspaces = wsConfig
    }
  } catch {}
  return workspaces
    .map((ws: any) => ws.path)
    .filter(Boolean)
    .map((p: string) => path.isAbsolute(p) ? p : path.resolve(PROJECT_DIR, p))
}

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/recharts')) return 'vendor-recharts'
          if (id.includes('node_modules/d3-force')) return 'vendor-d3'
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) return 'vendor-react'
        },
      },
    },
  },
  plugins: [
    react(),
    documentDiscovery({
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
    port: 5600,
    fs: {
      allow: [
        PROJECT_DIR,
        ...loadWorkspacePaths(),
      ],
    },
  },
})
