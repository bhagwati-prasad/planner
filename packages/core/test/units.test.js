import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as core from '../src/index.js'
import { gen, property } from '../../../tools/testing/index.js'

const ENG8 = new URL(
  '../../../docs/guidelines/engineering/08-data-identifiers-units-and-time.md',
  import.meta.url
)

/** The rows of eng §8's "Canonical internal units" table. */
function unitRows() {
  const text = readFileSync(ENG8, 'utf8')
  const table = text.slice(text.indexOf('## Canonical internal units'), text.indexOf('## Schemas'))
  return [...table.matchAll(/^\| ([^|]+?) \| [^|]+ \| [^|]* \|$/gm)]
    .map(([, quantity]) => quantity)
    .filter(quantity => quantity !== 'Quantity' && !quantity.startsWith('---'))
}

/** Each eng §8 row: its quantity, and [written, canonical] pairs that convert both ways. */
const ROWS = {
  Timestamps: {
    quantity: 'timestamp',
    both: [
      ['2026-09-25T09:00:00.000Z', Date.UTC(2026, 8, 25, 9)],
      ['1970-01-01T00:00:00.001Z', 1],
    ],
  },
  'Durations in properties': {
    quantity: 'duration',
    both: [
      ['4 d', 345_600_000],
      ['2 h 30 min', 9_000_000],
      ['45 s', 45_000],
      ['184 ms', 184],
      ['0.42 ms', 0.42],
    ],
  },
  'Simulated time': {
    quantity: 'simTime',
    both: [
      ['31.204 s', 31_204_000],
      ['0.000001 s', 1],
    ],
  },
  Sizes: {
    quantity: 'size',
    both: [
      ['512 KB', 512_000],
      ['1.5 MB', 1_500_000],
      ['2.3 GB', 2_300_000_000],
      ['999 B', 999],
    ],
  },
  Rates: {
    quantity: 'rate',
    noun: 'req',
    both: [
      ['850 req/s', 850],
      ['1.2k req/s', 1200],
      ['3.4M req/s', 3_400_000],
    ],
  },
  Bandwidth: {
    quantity: 'bandwidth',
    both: [
      ['100 Mbps', 100_000_000],
      ['10 Gbps', 10_000_000_000],
    ],
  },
  Percentages: {
    quantity: 'percent',
    both: [
      ['82%', 0.82],
      ['4.6%', 0.046],
      ['0.08%', 0.0008],
    ],
  },
  Money: {
    quantity: 'money',
    both: [
      ['1,240.00 USD', { amountMicros: 1_240_000_000, currency: 'USD' }],
      ['0.000001 EUR', { amountMicros: 1, currency: 'EUR' }],
    ],
  },
}

describe('canonical units', () => {
  it('every row of the eng §8 units table converts both ways', () => {
    assert.deepEqual(unitRows(), Object.keys(ROWS), 'every row of the table has conversions')
    for (const [row, { quantity, noun, both }] of Object.entries(ROWS)) {
      for (const [written, canonical] of both) {
        assert.deepEqual(
          core.parseQuantity(quantity, written),
          { ok: true, value: canonical },
          `${row}: '${written}' parses`
        )
        assert.equal(core.formatQuantity(quantity, canonical, { noun }), written, `${row}: formats`)
      }
    }
    assert.deepEqual(core.parseQuantity('duration', '30 req/min').code, 'E_UNIT_PARSE')
    assert.equal(core.parseQuantity('rate', '30 req/min').value, 0.5, 'other written units convert')
    assert.equal(core.parseQuantity('size', '1.5 GiB').value, 1.5 * 1024 ** 3)
  })

  it('percentages are stored as fractions and money as integer micro-units with a currency code', () => {
    assert.deepEqual(core.checkValue({ type: 'percent', unit: '%' }, 99.9), {
      ok: true,
      value: 0.999,
    })
    assert.equal(core.parseQuantity('percent', '150%').value, 1.5)
    assert.deepEqual(core.parseQuantity('money', 'USD 12.50'), {
      ok: true,
      value: { amountMicros: 12_500_000, currency: 'USD' },
    })
    assert.equal(core.parseQuantity('money', '-3 GBP').value.amountMicros, -3_000_000)
    for (const bad of ['1.2345678 USD', '12.50 usd', '12.50', '12.50 DOLLARS'])
      assert.equal(core.parseQuantity('money', bad).code, 'E_UNIT_PARSE', bad)
    assert.throws(
      () => core.formatQuantity('money', { amountMicros: 1.5, currency: 'USD' }),
      err => err.code === 'E_UNIT_VALUE',
      'money is only ever whole micro-units'
    )
  })

  it('property: parse(format(x)) equals x for every supported unit', () => {
    // Numbers from 1e-9 to 1e12 with any digits, and whole numbers up to 2^53.
    const real = gen.map(gen.tuple(gen.float(0, 1), gen.int(-9, 12)), ([m, e]) => m * 10 ** e)
    const whole = gen.int(0, Number.MAX_SAFE_INTEGER)
    const cases = {
      timestamp: gen.int(0, Date.UTC(2200, 0, 1)),
      duration: real,
      durationWhole: whole,
      simTime: whole,
      size: real,
      sizeWhole: whole,
      rate: real,
      bandwidth: real,
      percent: real,
      money: gen.record({
        amountMicros: gen.int(-Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
        currency: gen.oneOf('USD', 'EUR', 'JPY'),
      }),
    }
    for (const [name, values] of Object.entries(cases)) {
      const quantity = name.replace('Whole', '')
      property([values], x => {
        const written = core.formatQuantity(quantity, x)
        assert.deepEqual(core.parseQuantity(quantity, written), { ok: true, value: x }, written)
      })
    }
  })
})
