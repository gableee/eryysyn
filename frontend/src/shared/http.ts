/**
 * The ONLY place that talks to our backend. Feature api.ts files call http(); components never do.
 *
 * - adds the Supabase login token
 * - only accepts paths like "/workspaces", so the token can never be sent to another site
 * - turns every failure into one ApiError with a `kind` the screens can react to
 */
import { supabase } from './supabase'

const API = import.meta.env.VITE_API_URL

export type ApiErrorKind =
  | 'unauthorized' // 401: logged out or token expired
  | 'not_found'    // 404: gone, or not yours (the backend answers 404, never 403)
  | 'too_large'    // 413: upload over 20 MB
  | 'unsupported'  // 415: not a PDF
  | 'invalid'      // 422: input rejected (empty, too long)
  | 'unavailable'  // 502/503: the model or a service behind the backend is down
  | 'network'      // no answer at all: server down, offline
  | 'server'       // any other 5xx

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status: number | null

  constructor(kind: ApiErrorKind, status: number | null, message: string) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.status = status
  }
}

const KIND_BY_STATUS: Record<number, ApiErrorKind> = {
  401: 'unauthorized', 404: 'not_found', 413: 'too_large', 415: 'unsupported', 422: 'invalid',
  502: 'unavailable', 503: 'unavailable',
}

let onUnauthorized: () => void = () => {}

/** Called once per 401. The session layer sets it to "sign out" (Task 4). */
export function setUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn
}

export async function http<T>(path: string, init: RequestInit = {}): Promise<T> {
  // "/x" yes; "https://…" and "//host/x" (protocol-relative) no.
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new TypeError(`http() takes a path like "/workspaces", got ${JSON.stringify(path)}`)
  }
  const { data } = await supabase.auth.getSession()
  const headers = new Headers(init.headers)
  const token = data.session?.access_token
  if (token) headers.set('Authorization', `Bearer ${token}`)

  let res: Response
  try {
    res = await fetch(`${API}${path}`, { ...init, headers })
  } catch {
    throw new ApiError('network', null, "Can't reach the server")
  }

  if (!res.ok) {
    const kind = KIND_BY_STATUS[res.status] ?? (res.status >= 500 ? 'server' : 'invalid')
    if (kind === 'unauthorized') onUnauthorized()
    throw new ApiError(kind, res.status, `Request failed (${res.status})`)
  }
  return (res.status === 204 ? null : await res.json()) as T
}
