/** Only a path inside this app: "/chat/1" yes; "//evil.example", "https://…", "javascript:…" no (open redirect). */
export function safeReturnPath(from: unknown): string {
  return typeof from === 'string' && /^\/(?![/\\])/.test(from) ? from : '/'
}
