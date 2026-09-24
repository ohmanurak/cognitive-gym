import { useRef, useState } from 'react'
import { actions, useStore } from '../lib/store'
import { currentFingerprint, downloadExport, orphansNow } from '../lib/backup'
import { fingerprintMatches } from '../lib/integrity'

export function Data() {
  const file = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState('')
  useStore()
  const orphans = orphansNow()

  async function load(f: File) {
    try {
      const text = await f.text()
      actions.importJson(text)
      const same = fingerprintMatches(JSON.parse(text).workbookFingerprint, currentFingerprint)
      setMsg(
        'Imported. Existing progress was replaced.' +
          (same === false ? ' The workbook has changed since this export: unmatched attempts are listed below.' : ''),
      )
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
        <button className="primary" onClick={downloadExport}>
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
      <div className="card">
        <h2>Orphaned data</h2>
        {orphans.count === 0 ? (
          <div className="muted">None. Every saved attempt matches the current workbook.</div>
        ) : (
          <>
            <div className="muted">
              {orphans.attempts.length} attempts, {orphans.drafts.length} drafts, {orphans.blocks.length} blocks no
              longer match the workbook. They are kept, never deleted.
            </div>
            <ul>
              {orphans.attempts.map((a, i) => (
                <li key={i}>
                  {a.itemId} round {a.round}: {a.answer || '(blank)'}
                </li>
              ))}
              {orphans.drafts.map((d) => (
                <li key={d.itemId}>
                  {d.itemId} draft: {d.answer || '(blank)'}
                </li>
              ))}
              {orphans.blocks.map((k) => (
                <li key={k}>Block {k}</li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
