const API_BASE = (window.LOGTWO_CONFIG?.apiBase || '').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function api(path, options = {}) {
  const {
    method = 'GET',
    body,
    redirectOn401 = true,
    signal = undefined,
  } = options;

  let response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: 'include',
      signal,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError(0, 'Não foi possível falar com o servidor. Verifique sua conexão.');
  }

  let data = null;

  try {
    data = await response.json();
  } catch {
    // Respostas sem JSON (proxy fora do ar, por exemplo).
  }

  if (!response.ok) {
    if (response.status === 401 && redirectOn401) {
      window.location.replace('/index.html');
    }

    throw new ApiError(response.status, data?.error || 'Não foi possível concluir essa ação.');
  }

  return data;
}

export async function logout() {
  try {
    await api('/api/auth/logout', { method: 'POST', redirectOn401: false });
  } finally {
    window.location.replace('/index.html');
  }
}

export function redirectForDiary(diary) {
  if (diary?.status === 'active') {
    window.location.replace('/dashboard.html');
    return;
  }

  window.location.replace('/connect.html');
}
