/**
 * Which sentence of a source supports a claim in the answer? Used by the chat's source cards and by the Reader.
 *
 * Lexical matching (shared words), not embeddings: instant, in the browser, testable. The rule is strict on
 * purpose: a sentence is marked only when it clearly wins, because marking the wrong sentence is worse than
 * marking none (spec: anti-goal).
 */

const MIN_SCORE = 0.5      // the best sentence must contain at least half of the claim's content
const MIN_MARGIN = 0.15    // ...and beat the second best by this much

// Abbreviations whose full stop does not end a sentence (lower case, without the final dot).
const ABBREVIATIONS = new Set(['e.g', 'i.e', 'dr', 'mr', 'mrs', 'ms', 'prof', 'vs', 'etc', 'fig', 'no', 'approx', 'p', 'pp', 'cf', 'st'])
const STOP_WORDS = new Set(('a an the and or but if of in on at to for from by with without as is are was were be been being ' +
  'it its this that these those there their they them he she we you i which who whom what when where why how ' +
  'can could should would may might must will shall do does did has have had not no so than then too very also ' +
  'into onto about over under up down out more most such only own same other any each few all both some').split(' '))
// Numbers and units carry the facts students check: they count double.
const UNITS = new Set(['mmhg', 'mg', 'mcg', 'g', 'kg', 'ml', 'l', 'cm', 'mm', 'm', 'bpm', 'kcal', '%', 'iu', 'mmol'])

// A citation marker, with the same rule as the chat's parseCitations: not glued to a word ("items[1]" is code).
const MARKER = /\[(\d{1,3})\]/g
const isGlued = (text: string, at: number) => at > 0 && /[\p{L}\p{N}_]/u.test(text[at - 1])

/** Sentences of a text. Abbreviations ("e.g.", "Dr.") and decimals ("120.5") do not end a sentence. */
export function splitSentences(text: string): string[] {
  const out: string[] = []
  let start = 0
  for (const m of text.matchAll(/[.!?]+(?=\s|$)/g)) {
    const end = m.index! + m[0].length
    const lastWord = text.slice(start, m.index!).split(/\s+/).pop()?.toLowerCase() ?? ''
    if (m[0] === '.' && ABBREVIATIONS.has(lastWord)) continue
    out.push(text.slice(start, end).trim())
    start = end
  }
  const rest = text.slice(start).trim()
  if (rest) out.push(rest)
  return out.filter(Boolean)
}

type Weighted = Map<string, number>

function contentWords(text: string): Weighted {
  const words: Weighted = new Map()
  for (const raw of text.toLowerCase().match(/\d+(?:\.\d+)?|%|[\p{L}]+/gu) ?? []) {
    if (STOP_WORDS.has(raw)) continue
    const isNumber = /^\d/.test(raw)
    if (!isNumber && raw.length < 2 && raw !== '%') continue
    const word = !isNumber && raw.length > 3 && raw.endsWith('s') ? raw.slice(0, -1) : raw   // "readings" = "reading"
    words.set(word, isNumber || UNITS.has(word) ? 2 : 1)
  }
  return words
}

function score(claim: Weighted, sentence: string): number {
  const have = contentWords(sentence)
  let total = 0
  let found = 0
  for (const [word, weight] of claim) {
    total += weight
    if (have.has(word)) found += weight
  }
  return total === 0 ? 0 : found / total
}

/** Index of the sentence that clearly supports the claim, or null when none clearly does. */
export function findSupportingSentence(claim: string, sentences: string[]): number | null {
  const words = contentWords(claim)
  const scores = sentences.map((s) => score(words, s))
  let best = -1
  scores.forEach((s, i) => { if (best === -1 || s > scores[best]) best = i })
  if (best === -1 || scores[best] < MIN_SCORE) return null
  const second = Math.max(0, ...scores.filter((_, i) => i !== best))
  return scores[best] - second >= MIN_MARGIN ? best : null
}

/** Each answer sentence that carries [n], markers removed, in order: the k-th [n] belongs to claims[k]. */
export function claimsFor(answer: string, n: number): string[] {
  // "...below 120. [1] Next" -> "...below 120 [1]. Next": a marker after the full stop belongs to its sentence
  const moved = answer.replace(/([.!?])(\s+)((?:\[\d{1,3}\]\s*)+)/g, ' $3$1$2')
  const claims: string[] = []
  for (const sentence of splitSentences(moved)) {
    for (const m of sentence.matchAll(MARKER)) {
      if (Number(m[1]) !== n || isGlued(sentence, m.index!)) continue
      claims.push(stripMarkers(sentence))
    }
  }
  return claims
}

function stripMarkers(sentence: string): string {
  return sentence.replace(/\s*\[\d{1,3}\]/g, (whole, at: number) => (isGlued(sentence, at + whole.indexOf('[')) ? whole : ''))
    .replace(/\s+([.!?])/g, '$1').trim()
}

export type Support = { sentences: string[]; marks: { index: number; claims: number[] }[] }

/** For source [n] of an answer: the excerpt's sentences, and one mark per supporting sentence with the claims it supports. */
export function supportForCitation(answer: string, n: number, excerpt: string): Support {
  const sentences = splitSentences(excerpt)
  const byIndex = new Map<number, number[]>()
  claimsFor(answer, n).forEach((claim, k) => {
    const index = findSupportingSentence(claim, sentences)
    if (index !== null) byIndex.set(index, [...(byIndex.get(index) ?? []), k])
  })
  const marks = [...byIndex].map(([index, claims]) => ({ index, claims })).sort((a, b) => a.index - b.index)
  return { sentences, marks }
}
