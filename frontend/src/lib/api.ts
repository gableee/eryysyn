import { supabase } from "./supabase";

const API = import.meta.env.VITE_API_URL;

export async function api(path: string, options: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.status === 204 ? null : res.json();
}

