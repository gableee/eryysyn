/** What the backend's document endpoints return (backend/app/api/documents.py). */
export type DocumentStatus = 'uploaded' | 'indexed' | 'failed'

export interface LibraryDocument {
  id: string
  filename: string
  status: DocumentStatus
  created_at: string
}

/** A row that exists only in the browser while its upload request runs. */
export interface UploadingDocument {
  filename: string
  status: 'uploading'
}
