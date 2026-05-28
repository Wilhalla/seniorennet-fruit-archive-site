import { globSync, readFileSync, writeFileSync } from 'node:fs'
import { repairTextEncoding } from './text-encoding.ts'

const patterns = [
  'src/data/*.json',
  'src/content/blog-posts/*.md',
  'src/data/generated/*.json',
  'public/generated/*.json',
]

const files = Array.from(new Set(patterns.flatMap((pattern) => globSync(pattern)))).sort()
let changed = 0

for (const file of files) {
  const before = readFileSync(file, 'utf8')
  const after = repairTextEncoding(before)
  if (after === before) continue
  writeFileSync(file, after)
  changed += 1
}

console.log(`Repaired text encoding in ${changed} of ${files.length} files`)
