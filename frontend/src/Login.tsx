import { useState } from "react";
import { supabase } from "./lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // YOU: call supabase.auth.signInWithPassword({ email, password })
    // if it returns an error, setError(error.message)
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>Eryysyn</h1>
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
      <button type="submit">Log in</button>
      {error && <p>{error}</p>}
    </form>
  );
}