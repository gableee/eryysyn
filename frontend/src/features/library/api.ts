/** The ONLY file in the Library feature that knows backend URLs (backend/app/api/documents.py). */
import { http } from '../../shared/http'
import type { DocumentStatus, LibraryDocument } from './types'

export const listDocuments = (ws: string) => http<LibraryDocument[]>(`/workspaces/${ws}/documents`)

/** Multipart upload. No Content-Type header: the browser sets it, with the boundary. Synchronous:
 *  the backend answers after reading the PDF, so this can take a minute. */
export function uploadDocument(ws: string, file: File) {
  const body = new FormData()
  body.append('file', file)
  return http<{ id: string; filename: string; status: DocumentStatus }>(`/workspaces/${ws}/documents`, { method: 'POST', body })
}

export const retryDocument = (id: string) => http<{ id: string; status: DocumentStatus }>(`/documents/${id}/index`, { method: 'POST' })

export const deleteDocument = (id: string) => http<null>(`/documents/${id}`, { method: 'DELETE' })
