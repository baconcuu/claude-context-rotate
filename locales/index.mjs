import en from './en.mjs'
import vi from './vi.mjs'

// One file per language. To add one: copy en.mjs to <code>.mjs (a two-letter code: ja, de,
// pt, ...), translate every text and keep each {placeholder} as it is, then list the file
// here and its code under "language" in .claude-plugin/plugin.json.
export const LOCALES = { en, vi }

// The `language` setting: a listed code, or `auto` for the system's own (vi-VN → vi), else English.
export function langOf(choice, system = '') {
  const code = choice && choice !== 'auto' ? String(choice) : String(system).split(/[-_]/)[0].toLowerCase()
  return Object.hasOwn(LOCALES, code) ? code : 'en'
}

// 'Deleted {n} conversation(s)' with { n: 3 } → 'Deleted 3 conversation(s)'
export const fill = (text, vars = {}) => text.replace(/\{(\w+)\}/g, (m, k) => (Object.hasOwn(vars, k) ? String(vars[k]) : m))
