import type { IncomingMessage } from 'node:http'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { readProgress, resolveSaveDir, writeProgress } from './server/saveFile.ts'

const readBody = (req: IncomingMessage) =>
  new Promise<string>((resolve, reject) => {
    let s = ''
    req.on('data', (c) => (s += c))
    req.on('end', () => resolve(s))
    req.on('error', reject)
  })

/**
 * Dev-server save file: GET /api/progress, POST /api/progress[?backup=1].
 * Only active under `npm run dev`.
 */
function progressFile(): Plugin {
  return {
    name: 'cogym-progress-file',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/progress', async (req, res) => {
        const send = (code: number, obj: unknown) => {
          res.statusCode = code
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(obj))
        }
        const dir = resolveSaveDir()
        if (req.method === 'GET') {
          const r = readProgress(dir)
          if (r.status === 'ok') return send(200, r.data)
          if (r.status === 'not-found') return send(404, { error: 'not-found' })
          return send(r.status === 'corrupt' ? 422 : 500, { error: r.status === 'corrupt' ? 'corrupt' : r.message })
        }
        if (req.method === 'POST') {
          let body: unknown
          try {
            body = JSON.parse(await readBody(req))
          } catch {
            return send(400, { error: 'Invalid JSON' })
          }
          const backup = new URL(req.url ?? '', 'http://x').searchParams.get('backup') === '1'
          const r = writeProgress(dir, body, { backup })
          return r.ok ? send(200, { ok: true, savedAt: r.savedAt }) : send(r.status, { error: r.error })
        }
        res.setHeader('Allow', 'GET, POST')
        send(405, { error: 'Method not allowed' })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), progressFile()],
})
