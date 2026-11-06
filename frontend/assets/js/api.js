const API_BASE = (window.LOGTWO_CONFIG?.apiBase || '').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export async function api(path, options = {}) {
  const {
    method = 'GET',
    body,
    redirectOn401 = true,
    signal = undefined,
  } = options;

  const url = `${API_BASE}${path}`;
  let response;

  try {
    response = await fetch(url, {
      method,
      credentials: 'include',
      signal,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;

    console.error(`[logtwo] Falha de rede em ${method} ${url}`, error);
    throw new ApiError(0, 'Não foi possível falar com o servidor. Verifique sua conexão.');
  }

  let raw = '';

  try {
    raw = await response.text();
  } catch (error) {
    if (error.name === 'AbortError') throw error;

    console.error(`[logtwo] Falha ao ler a resposta de ${method} ${url}`, error);
    throw new ApiError(response.status, 'Não foi possível ler a resposta do servidor.');
  }

  let data = null;

  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      console.error(
        `[logtwo] Resposta não-JSON em ${method} ${url} (status ${response.status})`,
        raw.slice(0, 500),
      );
    }
  }

  if (!response.ok) {
    const message =
      data?.error ||
      (response.status === 502 || response.status === 503
        ? 'O servidor está indisponível no momento. Tente novamente em instantes.'
        : `O servidor respondeu com status ${response.status}.`);

    if (response.status === 401) {
      console.warn(
        `[logtwo] ${method} ${url} retornou 401`,
        data?.error || raw.slice(0, 300) || '(sem corpo)',
      );

      if (redirectOn401) {
        window.location.replace('/index.html');
      }
    } else {
      console.error(
        `[logtwo] ${method} ${url} falhou (status ${response.status})`,
        data?.error || raw.slice(0, 500) || '(sem corpo)',
      );
    }

    throw new ApiError(response.status, message, data);
  }

  if (data === null || typeof data !== 'object') {
    console.error(
      `[logtwo] ${method} ${url} respondeu ${response.status} sem JSON válido`,
      raw.slice(0, 500) || '(corpo vazio)',
    );
    throw new ApiError(
      502,
      'O servidor devolveu uma resposta inválida. Verifique se a API está no ar e tente novamente.',
      { raw: raw.slice(0, 500) },
    );
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
