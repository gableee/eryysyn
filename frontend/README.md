# Eryysyn frontend

React 19 + TypeScript + Vite. Talks to the FastAPI backend (`../backend`) and Supabase Auth.

## Run it

```bash
cp .env.example .env      # then fill in the values (never commit .env)
npm install
npm run dev               # http://localhost:5173  (component states: /dev/states)
npm test                  # Vitest + React Testing Library
npm run build             # type check + production build (adds the Content Security Policy)
npm run preview           # serve the production build locally
```

| Variable | What |
|---|---|
| `VITE_API_URL` | the backend, e.g. `http://localhost:8000` (the backend allows `http://localhost:5173`) |
| `VITE_SUPABASE_URL` | your Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | the **publishable / anon** key only. Never the `service_role` key. |
| `VITE_AUTH_GOOGLE` | `true` shows "Continue with Google" (set it up first, below) |

## Folders

```
src/app/        routes, guards, the shell (top bar, sidebar, phone tabs), /dev/states
src/features/   auth/ · library/ · chat/   (each with its own api.ts: the only place with backend URLs)
src/shared/     http client (token, typed errors), supabase client, theme, UI kit
src/styles/     tokens.css (Sage light + dark, contrast tested) and base.css
```
Rules: components never call `fetch`; features never import each other; model output is shown as text only.

## Sign-in setup (Supabase dashboard)

- **Authentication > Providers > Email > Minimum password length: 8** (the app asks for 8; Supabase must enforce it).
- **Confirm email** can be on or off: the app handles both. Turn it on before real users.
- **Authentication > URL Configuration**: Site URL and Redirect URLs = `http://localhost:5173` (and later the Vercel domain). Supabase refuses any other redirect.

### Google ("Continue with Google")

1. Google Cloud Console > APIs & Services > Credentials > Create OAuth client ID (Web application).
   Authorized redirect URI: `https://<your-project>.supabase.co/auth/v1/callback`.
2. Supabase > Authentication > Providers > Google: enable, paste the client ID and secret.
3. Set `VITE_AUTH_GOOGLE=true` in `.env` and restart `npm run dev`.

The app uses the PKCE flow: Google returns a one-time code, never tokens in the URL.

## Security notes

- Production build: a Content Security Policy `<meta>` tag (only our scripts; connections only to the API and Supabase). Not on the dev server, whose hot reload needs an inline script.
- `vercel.json`: every path serves `index.html` (reloading `/chat/123` works) and security headers, including `frame-ancestors 'none'` against clickjacking.
- At deployment (Phase 8): move the full CSP into a real HTTP header once the backend's public URL is known.
