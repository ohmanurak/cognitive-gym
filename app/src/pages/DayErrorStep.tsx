import { errorAnalysis, firstOpenMissBlock, hasErrorStep } from '../lib/erroranalysis'
import type { State } from '../lib/store'

/** Status of a Day's Error analysis step, linking to the Block that holds the open misses. */
export function DayErrorStep({ s, week, day }: { s: State; week: number; day: number }) {
  if (!hasErrorStep(day)) return null
  const ea = errorAnalysis(s, week, day)
  const open = firstOpenMissBlock(s, week, day)
  const label = !ea.blocksDone
    ? 'waiting for blocks'
    : ea.complete
      ? ea.misses.length
        ? `done (${ea.misses.length} coded)`
        : 'done (no misses)'
      : `${new Set([...ea.uncoded, ...ea.unfixed]).size} of ${ea.misses.length} misses need a code and Fix`
  return (
    <span className="small">
      Error analysis <span className={`pill ${ea.complete ? 'done' : 'todo'}`}>{label}</span>
      {open && (
        <>
          {' '}
          <a href={`#/block/${open.key}`}>complete it</a>
        </>
      )}
    </span>
  )
}
