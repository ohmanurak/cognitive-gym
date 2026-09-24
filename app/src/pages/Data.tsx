import { useRef, useState } from 'react'
import { actions } from '../lib/store'

export function Data() {
  const file = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState('')

  function download() {
    const blob = new Blob([actions.exportJson()], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `cognitive-gym-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function load(f: File) {
    try {
      actions.importJson(await f.text())
      setMsg('Imported. Existing progress was replaced.')
    } catch (e) {
      setMsg(`Import failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <div>
      <h1>Your data</h1>
      <div className="muted">
        Progress lives in this browser only. Export a backup regularly, and use export/import to move to another device.
      </div>
      <div className="card row">
        <button className="primary" onClick={download}>
          Export JSON
        </button>
        <button onClick={() => file.current?.click()}>Import JSON…</button>
        <input
          ref={file}
          type="file"
          accept="application/json"
          hidden
          onChange={(e) => e.target.files?.[0] && load(e.target.files[0])}
        />
        <span className="grow" />
        <button
          onClick={() => {
            if (confirm('Erase all progress in this browser? Export first if unsure.')) actions.reset()
          }}
        >
          Reset all
        </button>
      </div>
      {msg && <div className="notice">{msg}</div>}
    </div>
  )
}
