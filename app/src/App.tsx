import { useEffect, useState } from 'react'
import { BackupBanner } from './components/BackupBanner'
import { requestPersistence } from './lib/backup'
import { useAutosaveStatus } from './lib/store'
import { BlockRunner } from './pages/BlockRunner'
import { Dashboard } from './pages/Dashboard'
import { Data } from './pages/Data'
import { Errors } from './pages/Errors'
import { Span } from './pages/Span'
import { SpanTestPage } from './pages/SpanTest'
import { Stats } from './pages/Stats'
import { Plan, WeekPage } from './pages/Week'

function useHash(): string {
  const [hash, setHash] = useState(window.location.hash || '#/')
  useEffect(() => {
    const on = () => {
      setHash(window.location.hash || '#/')
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return hash
}

const NAV = [
  ['#/', 'Home'],
  ['#/plan', 'Plan'],
  ['#/stats', 'Progress'],
  ['#/errors', 'Errors'],
  ['#/span', 'Span practice'],
  ['#/data', 'Data'],
] as const

function Route({ hash }: { hash: string }) {
  const [, path, arg] = hash.split('/')
  switch (path) {
    case 'plan':
      return <Plan />
    case 'week':
      return <WeekPage week={Number(arg)} />
    case 'block':
      if (arg === 'base:2span') return <SpanTestPage />
      return <BlockRunner key={arg} blockKey={decodeURIComponent(arg)} />
    case 'stats':
      return <Stats />
    case 'errors':
      return <Errors />
    case 'span':
      return <Span />
    case 'data':
      return <Data />
    default:
      return <Dashboard />
  }
}

export default function App() {
  const hash = useHash()
  useEffect(requestPersistence, [])
  const backup = useAutosaveStatus()
  return (
    <div className="shell">
      <nav className="nav">
        <a className="brand" href="#/">
          Cognitive Gym
        </a>
        {NAV.slice(1).map(([h, label]) => (
          <a key={h} href={h} className={hash === h ? 'active' : ''}>
            {label}
          </a>
        ))}
        {backup === 'failed' && (
          <a href="#/data" className="muted small" style={{ marginLeft: 'auto' }} title="File backup failed. Open Data.">
            backup failed
          </a>
        )}
      </nav>
      <BackupBanner />
      <Route hash={hash} />
    </div>
  )
}
