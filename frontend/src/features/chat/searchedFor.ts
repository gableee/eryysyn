const normal = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim().replace(/[?.!]+$/, '')

/** Show "Searched for" only when the rewrite really changed the question, not just its case or a "?". */
export function showSearchedFor(typed: string, searched: string | null): boolean {
  return searched !== null && normal(typed) !== normal(searched)
}
