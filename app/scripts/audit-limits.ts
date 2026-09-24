import { blocks } from '../src/lib/structure.ts'

const bySource = new Map<string, string[]>()
for (const b of blocks) {
  const desc = `${b.key}${b.limitMin !== null ? `=${b.limitMin}${b.strict ? 's' : ''}` : ''}`
  bySource.set(b.limitSource, [...(bySource.get(b.limitSource) ?? []), desc])
}
console.log(`blocks: ${blocks.length}`)
for (const [source, list] of bySource) {
  console.log(`\n${source} (${list.length})${source === 'none' || source === 'item-targets' ? ': no countdown' : ''}`)
  console.log('  ' + list.join(' '))
}
console.log('\nstrict blocks:', blocks.filter((b) => b.strict).map((b) => b.key).join(' '))
