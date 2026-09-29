// @ts-check
// The Content Security Policy that eng §16 names for strata serve, read from the guideline, and
// a page script that records CSP violations, for the tests of task 0309.
import { readFileSync } from 'node:fs'

/** The policy eng §16 names, read from the guideline so the tests follow it. */
export function strictCsp() {
  const guideline = readFileSync(
    new URL('../../docs/guidelines/engineering/16-security.md', import.meta.url),
    'utf8'
  )
  const csp = /Sends a strict CSP: `([^`]+)`/.exec(guideline)?.[1]
  if (!csp) throw new Error('eng §16 no longer names its CSP')
  return csp
}

/** Page script: records every CSP violation in window.cspViolations, from the first byte on. */
export const RECORD_VIOLATIONS = `
  window.cspViolations = []
  document.addEventListener('securitypolicyviolation', e => {
    const where = e.sourceFile ? ' ' + e.sourceFile.split('/').slice(-2).join('/') + ':' + e.lineNumber : ''
    const what = e.target && e.target.nodeName ? ' ' + e.target.nodeName : ''
    window.cspViolations.push(e.violatedDirective + where + what)
  })
`
