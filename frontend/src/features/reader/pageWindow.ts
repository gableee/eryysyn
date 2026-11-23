/** A `?page=` value as a real page: a number from 1 to the last page (odd values open page 1 or the last page). */
export function clampPage(raw: string | null, total: number): number {
  const n = Math.floor(Number(raw))
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.min(n, Math.max(1, total))
}

/** Pages to draw: the visible one and one on each side. Everything else stays an empty slot (memory stays flat). */
export function pagesToDraw(visible: number, total: number): number[] {
  const pages: number[] = []
  for (let p = visible - 1; p <= visible + 1; p++) if (p >= 1 && p <= total) pages.push(p)
  return pages
}
