import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import { api } from "./lib/api";

type Doc = { id: string; filename: string; status: string };

export default function Library() {
  const [workspaceId, setWorkspaceId] = useState("");
  const [docs, setDocs] = useState<Doc[]>([]);
  const [error, setError] = useState("");

  async function loadDocs(wsId: string) {
    // YOU: setDocs(await api(`/workspaces/${wsId}/documents`))
  }

  useEffect(() => {
    api("/workspaces")
      .then((ws) => {
        setWorkspaceId(ws[0].id);
        return loadDocs(ws[0].id);
      })
      .catch((e) => setError(e.message));
  }, []);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // YOU: build FormData, append("file", file), POST it to
    // `/workspaces/${workspaceId}/documents` (no Content-Type header!),
    // then reload the list
  }

  async function handleDelete(id: string) {
    // YOU: DELETE `/documents/${id}`, then reload the list
  }

  return (
    <div>
      <button onClick={() => supabase.auth.signOut()}>Log out</button>
      <h1>My documents</h1>
      <input type="file" accept="application/pdf" onChange={handleUpload} />
      {error && <p>Error: {error}</p>}
      <ul>
        {docs.map((d) => (
          <li key={d.id}>
            {d.filename} [{d.status}]{" "}
            <button onClick={() => handleDelete(d.id)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}