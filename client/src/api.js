// Thin fetch wrapper: same-origin requests carry the session cookie.
async function call(path, { method = 'GET', body, form } = {}) {
  const res = await fetch(path, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  me: () => call('/api/auth/me'),
  login: (email, password) => call('/api/auth/login', { method: 'POST', body: { email, password } }),
  logout: () => call('/api/auth/logout', { method: 'POST' }),
  courses: () => call('/api/courses'),
  myDoubts: () => call('/api/doubts'),
  inbox: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    return call(`/api/doubts${qs ? `?${qs}` : ''}`);
  },
  similar: (id) => call(`/api/doubts/${id}/similar`),
  summary: () => call('/api/doubts/summary'),
  doubt: (id) => call(`/api/doubts/${id}`),
  createDoubt: (form) => call('/api/doubts', { method: 'POST', form }),
  reply: (doubtId, form) => call(`/api/doubts/${doubtId}/messages`, { method: 'POST', form }),
  setStatus: (doubtId, status) => call(`/api/doubts/${doubtId}/messages/status`, { method: 'PATCH', body: { status } }),
};

export function attachmentUrl(id) {
  return `/api/attachments/${id}/file`;
}
