import { http } from '../../shared/http'

/** A 10-minute signed link to the stored PDF (owner only; 404 otherwise). Never stored anywhere. */
export const getFileUrl = (id: string) => http<{ url: string; expires_in: number }>(`/documents/${encodeURIComponent(id)}/file`)
