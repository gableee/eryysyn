/** The "Added" column: "Nov 20" this year, "Mar 4, 2025" before, in the reader's own date format. */
export function formatAdded(iso: string, now = new Date(), locale?: string): string {
  const date = new Date(iso)
  const thisYear = date.getFullYear() === now.getFullYear()
  return date.toLocaleDateString(locale, { month: 'short', day: 'numeric', ...(thisYear ? {} : { year: 'numeric' }) })
}
