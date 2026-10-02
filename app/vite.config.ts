import type { IncomingMessage } from 'node:http'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { capFromEnv, createCoachClient, createSpendStore, handleCoach } from './server/coach.ts'
import { createLinkFetcher, handleLinks } from './server/links.ts'
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

/**
 * Coach me: GET /api/coach/health, POST /api/coach/diagnose, POST /api/coach/links. Only active under `npm run dev`.
 * The key is read server-side from ANTHROPIC_API_KEY (app/.env.local) and never reaches the bundle.
 */
function coachApi(): Plugin {
  let env: Record<string, string> = {}
  return {
    name: 'cogym-coach',
    apply: 'serve',
    configResolved(config) {
      env = loadEnv(config.mode, config.envDir || config.root, '')
    },
    configureServer(server) {
      const apiKey = env.ANTHROPIC_API_KEY
      const deps = {
        client: apiKey ? createCoachClient(apiKey) : null,
        spend: createSpendStore(resolveSaveDir()),
        now: () => new Date(),
        capUsd: capFromEnv(env),
        log: (line: string) => server.config.logger.info(line),
      }
      const fetcher = createLinkFetcher()
      server.middlewares.use('/api/coach', async (req, res) => {
        const send = (code: number, obj: unknown) => {
          res.statusCode = code
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(obj))
        }
        let body: unknown
        if (req.method === 'POST') {
          try {
            body = JSON.parse(await readBody(req))
          } catch {
            return send(400, { error: 'Invalid JSON' })
          }
        }
        const path = new URL(req.url ?? '', 'http://x').pathname
        const coachReq = { method: req.method ?? 'GET', path, body }
        const r = path === '/links' ? await handleLinks(coachReq, { ...deps, fetcher }) : await handleCoach(coachReq, deps)
        send(r.status, r.body)
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), progressFile(), coachApi()],
})
