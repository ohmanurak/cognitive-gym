import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initWriter } from './lib/writer'

// The writer lock is decided before render so a read-only tab never writes, restores or autosaves.
void initWriter().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
