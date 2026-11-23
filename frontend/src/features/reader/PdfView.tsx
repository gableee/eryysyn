/** The PDF itself. Task 5: a stand-in with the final props; Task 6 draws the pages with PDF.js. */
export type PdfViewProps = {
  url: string
  page: number
  highlights: string[]
  onPageChange(page: number, total: number): void
  onExpired(): void
  onBroken(): void
}

export function PdfView({ page }: PdfViewProps) {
  return <p>Page {page}</p>
}
