import { currentWeeksCompleted, downloadExport } from '../lib/backup'
import { useBackupMeta } from '../lib/backupMeta'
import { shouldRemind } from '../lib/integrity'
import { useStore } from '../lib/store'

export function BackupBanner() {
  useStore() // re-render when progress changes
  const meta = useBackupMeta()
  if (!shouldRemind(meta, Date.now(), currentWeeksCompleted())) return null
  return (
    <div className="notice row">
      <span className="grow">Back up your progress: it lives only in this browser.</span>
      <button className="primary" onClick={downloadExport}>
        Export now
      </button>
    </div>
  )
}
