import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: 'tok' } } })) } },
}))

import { ApiError, http, setUnauthorizedHandler } from './http'

const API = import.meta.env.VITE_API_URL

function reply(status: number, body: unknown = {}) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
  setUnauthorizedHandler(() => {})
})

describe('http', () => {
  it('adds the bearer token and the API base url', async () => {
    fetchMock.mockResolvedValue(reply(200, [{ id: 'w1' }]))
    const data = await http<{ id: string }[]>('/workspaces')
    expect(data).toEqual([{ id: 'w1' }])
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${API}/workspaces`)
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer tok')
  })

  it('refuses a path that is not relative, so the token never leaves for another site', async () => {
    await expect(http('https://evil.example/x')).rejects.toThrow(TypeError)
    await expect(http('//evil.example/x')).rejects.toThrow(TypeError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('204 returns null', async () => {
    fetchMock.mockResolvedValue(reply(204))
    expect(await http('/documents/1', { method: 'DELETE' })).toBeNull()
  })

  it.each([
    [404, 'not_found'],
    [413, 'too_large'],
    [415, 'unsupported'],
    [422, 'invalid'],
    [502, 'unavailable'],
    [503, 'unavailable'],
    [500, 'server'],
  ])('status %i becomes kind %s', async (status, kind) => {
    fetchMock.mockResolvedValue(reply(status, { detail: 'x' }))
    const err = (await http('/x').catch((e: unknown) => e)) as ApiError
    expect(err).toBeInstanceOf(ApiError)
    expect(err.kind).toBe(kind)
    expect(err.status).toBe(status)
  })

  it('401 becomes unauthorized and calls the handler once', async () => {
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)
    fetchMock.mockResolvedValue(reply(401))
    const err = (await http('/x').catch((e: unknown) => e)) as ApiError
    expect(err.kind).toBe('unauthorized')
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('a network failure becomes kind network with no status', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const err = (await http('/x').catch((e: unknown) => e)) as ApiError
    expect(err).toBeInstanceOf(ApiError)
    expect(err.kind).toBe('network')
    expect(err.status).toBeNull()
  })
})
