// Bundles the TS smoke tests (resolving the '@' alias) and runs them in Node.
import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const tests = ['smoke.ts', 'store-smoke.ts']
for (const t of tests) {
  const entry = join(here, t)
  const out = join(here, '.' + t.replace(/\.ts$/, '.mjs'))
  await build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'esm',
    alias: { '@': resolve(root, 'src') },
    outfile: out,
    logLevel: 'warning',
  })
  console.log(`\n=== ${t} ===`)
  await import(pathToFileURL(out).href)
}
