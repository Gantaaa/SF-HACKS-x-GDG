const API = import.meta.env.VITE_API_URL;

export async function analyze(file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API}/analyze`, { method: "POST", body: form });
  if (!res.ok) throw new Error((await res.json()).detail || "Something went wrong");
  return res.json();
}

export async function share(result) {
  const res = await fetch(`${API}/share`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(result),
  });
  return (await res.json()).id;
}
