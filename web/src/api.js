export const API = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

async function request(path, options) {
  const response = await fetch(`${API}${path}`, options);
  if (!response.ok) {
    let detail = 'Request failed';
    try { detail = (await response.json()).detail || detail; } catch {}
    throw new Error(detail);
  }
  return response.json();
}

export const analyze = (file, startTerm) => {
  const body = new FormData();
  body.append('file', file);
  body.append('start_term', startTerm);
  return request('/analyze', { method: 'POST', body });
};

export const share = result => request('/share', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result),
});
