// @ts-check
// The performance benchmarks of eng §15 (`npm run bench`, task 0207): every tools/bench/*.bench.js,
// or the files named on the command line, in Chromium, the reference browser, against the
// development server. A benchmark exports `bench`, which takes { browser, baseURL } and returns
// its measures; the run fails when one is over its budget. `npm run check` does not run benchmarks.
//
//   npm run bench [-- tools/bench/graph-pan.bench.js]
import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/**
 * @typedef {object} Measure
 * @property {string} name   what was measured
 * @property {number} value
 * @property {string} unit
 * @property {number} budget the eng §15 budget, in the same unit
 */

/** @param {number} n */
const shown = n => (Number.isFinite(n) ? String(Math.round(n * 10) / 10) : String(n))

/**
 * One line for each measure over its budget; a measure that is not a number is over it.
 * @param {Measure[]} measures
 * @returns {string[]}
 */
export function overBudget(measures) {
  return measures
    .filter(m => !(m.value <= m.budget))
    .map(m => `${m.name} is ${shown(m.value)} ${m.unit}, over its ${m.budget} ${m.unit} budget`)
}

/** @param {string[]} files */
async function main(files) {
  const { chromium } = await import('@playwright/test')
  const { startServer } = await import('../../scripts/dev-server.js')
  const dir = fileURLToPath(new URL('.', import.meta.url))
  const paths = files.length
    ? files.map(f => resolve(f))
    : readdirSync(dir)
        .filter(f => f.endsWith('.bench.js'))
        .sort()
        .map(f => join(dir, f))
  const server = await startServer({ port: 0 })
  const browser = await chromium.launch()
  /** @type {Measure[]} */
  const measures = []
  try {
    for (const path of paths) {
      const { bench } = await import(pathToFileURL(path).href)
      measures.push(...(await bench({ browser, baseURL: server.url })))
    }
  } finally {
    await browser.close()
    await server.close()
  }
  console.log('Benchmarks (eng §15, Chromium)')
  for (const m of measures)
    console.log(
      `  ${m.name.padEnd(52)} ${`${shown(m.value)} ${m.unit}`.padStart(10)}   budget ${m.budget} ${m.unit}`
    )
  const problems = overBudget(measures)
  for (const p of problems) console.error(`bench: ${p}`)
  process.exitCode = problems.length ? 1 : 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await main(process.argv.slice(2))
