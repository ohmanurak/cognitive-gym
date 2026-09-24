import { applyStartupPreview, dismissNotice, dismissPreview, useStartupView } from '../lib/startup'
import { ImportPreview } from './ImportPreview'

/** Startup restore feedback: notice line, warning, and the merge preview when the file would add or replace a Block. */
export function StartupRestore() {
  const v = useStartupView()
  return (
    <>
      {v.warning && (
        <div className="notice" role="alert">
          {v.warning}
        </div>
      )}
      {v.notice && (
        <div className="notice row">
          <span className="grow">{v.notice}</span>
          <button onClick={dismissNotice}>Dismiss</button>
        </div>
      )}
      {v.preview && (
        <>
          <div className="muted small">
            The progress file has Blocks this browser does not.{v.preview.warn} Cancel keeps everything as is; this shows again next time you open the app.
          </div>
          <ImportPreview plan={v.preview.plan} onConfirm={applyStartupPreview} onCancel={dismissPreview} />
        </>
      )}
    </>
  )
}
