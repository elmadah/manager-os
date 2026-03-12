const BASE_URL = import.meta.env.VITE_API_URL || '/api';

async function request(method, path, body) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE_URL}${path}`, options);
  if (!res.ok) {
    const error = new Error(`${res.status} ${res.statusText}`);
    error.status = res.status;
    try {
      error.data = await res.json();
    } catch {}
    throw error;
  }
  if (res.status === 204) return null;
  return res.json();
}

const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  del: (path) => request('DELETE', path),
};

export default api;
