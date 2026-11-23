/** The Reader's address: `/documents/:id?page=…&chat=…&answer=…&n=…` (spec). Empty values are left out. */
export function readerPath(p: { documentId: string; page?: number; chat?: string; answer?: string; n?: number }): string {
  const query = new URLSearchParams()
  if (p.page !== undefined) query.set('page', String(p.page))
  if (p.chat) query.set('chat', p.chat)
  if (p.answer) query.set('answer', p.answer)
  if (p.n !== undefined) query.set('n', String(p.n))
  const q = query.toString()
  return `/documents/${encodeURIComponent(p.documentId)}${q ? `?${q}` : ''}`
}
