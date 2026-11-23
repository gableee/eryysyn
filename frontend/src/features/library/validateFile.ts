/** Same limit as the backend (MAX_BYTES in api/documents.py). */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024

/**
 * A quick check before uploading, so the student gets the message at once instead of after sending
 * 20 MB. Convenience only: the backend checks type and size again (413 / 415).
 */
export function validateFile(file: File): string | null {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  if (!isPdf) return 'Only PDF files for now.'
  if (file.size > MAX_UPLOAD_BYTES) return 'This file is over 20 MB.'
  return null
}
