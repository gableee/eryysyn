import { ApiError } from '../../shared/http'

/** What a failed question says, the same in the chat and in the Reader's Chat tab. */
export function sendError(error: unknown): string {
  if (error instanceof ApiError && error.kind === 'unavailable') return 'Ery is offline right now. Try again in a minute.'
  if (error instanceof ApiError && error.kind === 'network') return "Can't reach the server"
  return 'Something went wrong. Try again.'
}
