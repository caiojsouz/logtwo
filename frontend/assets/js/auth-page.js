import { api, ApiError, redirectForDiary } from './api.js';
import { hideBootScreen, showBootError } from './ui.js';

const form = document.querySelector('#auth-form');
const nameField = document.querySelector('#name-field');
const nameInput = document.querySelector('#name');
const emailInput = document.querySelector('#email');
const passwordInput = document.querySelector('#password');
const submitButton = document.querySelector('#auth-submit');
const submitLabel = document.querySelector('#submit-label');
const submitSpinner = document.querySelector('#submit-spinner');
const errorBox = document.querySelector('#form-error');
const errorText = document.querySelector('#form-error-text');
const formIntro = document.querySelector('#form-intro');
const modeHint = document.querySelector('#mode-hint');
const hintSwitch = document.querySelector('#hint-switch');
const togglePassword = document.querySelector('#toggle-password');
const eyeOpen = document.querySelector('#eye-open');
const eyeClosed = document.querySelector('#eye-closed');
const tabs = [...document.querySelectorAll('.tab-button')];

const COPY = {
  login: {
    intro: 'Entre para voltar à estante de vocês.',
    label: 'Entrar no diário',
    hint: 'Ainda não tem um diário?',
    hintAction: 'Crie sua conta primeiro',
    autocomplete: 'current-password',
  },
  register: {
    intro: 'Crie sua conta. O convite para a sua dupla vem depois.',
    label: 'Criar minha conta',
    hint: 'Já tem uma conta?',
    hintAction: 'Entrar no diário',
    autocomplete: 'new-password',
  },
};

let mode = 'login';
let isSubmitting = false;

document.querySelector('#current-year').textContent = new Date().getFullYear();

function setMode(nextMode, { focus = false } = {}) {
  mode = nextMode;
  const copy = COPY[mode];
  const isRegister = mode === 'register';

  for (const tab of tabs) {
    const active = tab.dataset.mode === mode;
    tab.setAttribute('aria-selected', String(active));
    tab.classList.toggle('text-zinc-100', active);
    tab.classList.toggle('text-zinc-400', !active);
    tab.querySelector('[data-tab-line]').classList.toggle('hidden', !active);
  }

  nameField.classList.toggle('hidden', !isRegister);
  nameInput.required = isRegister;
  passwordInput.autocomplete = copy.autocomplete;
  formIntro.textContent = copy.intro;
  submitLabel.textContent = copy.label;
  modeHint.firstChild.textContent = `${copy.hint} `;
  hintSwitch.textContent = copy.hintAction;

  hideError();

  if (focus) {
    (isRegister ? nameInput : emailInput).focus();
  }
}

function showError(message) {
  errorText.textContent = message;
  errorBox.classList.remove('hidden');
  errorBox.classList.add('flex');
}

function hideError() {
  errorBox.classList.add('hidden');
  errorBox.classList.remove('flex');
}

function setLoading(loading) {
  isSubmitting = loading;
  submitButton.disabled = loading;
  submitButton.setAttribute('aria-busy', String(loading));
  submitSpinner.classList.toggle('hidden', !loading);

  if (loading) {
    submitLabel.textContent = mode === 'register' ? 'Criando conta…' : 'Entrando…';
  } else {
    submitLabel.textContent = COPY[mode].label;
  }
}

for (const tab of tabs) {
  tab.addEventListener('click', () => {
    if (tab.dataset.mode === mode) return;
    setMode(tab.dataset.mode);
  });
}

hintSwitch.addEventListener('click', () => {
  setMode(mode === 'login' ? 'register' : 'login', { focus: true });
});

togglePassword.addEventListener('click', () => {
  const showing = passwordInput.type === 'text';
  passwordInput.type = showing ? 'password' : 'text';
  eyeOpen.classList.toggle('hidden', !showing);
  eyeClosed.classList.toggle('hidden', showing);
  togglePassword.setAttribute('aria-label', showing ? 'Mostrar senha' : 'Ocultar senha');
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (isSubmitting) return;

  hideError();

  const name = nameInput.value.trim().replace(/\s+/g, ' ');
  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value;

  if (mode === 'register' && (name.length < 2 || name.length > 60)) {
    showError('Informe seu nome (entre 2 e 60 caracteres).');
    nameInput.focus();
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showError('Informe um e-mail válido.');
    emailInput.focus();
    return;
  }

  if (password.length < 8) {
    showError('A senha precisa ter pelo menos 8 caracteres.');
    passwordInput.focus();
    return;
  }

  setLoading(true);

  try {
    const body = mode === 'register' ? { name, email, password } : { email, password };
    const data = await api(`/api/auth/${mode}`, {
      method: 'POST',
      body,
      redirectOn401: false,
    });

    if (!data?.user) {
      console.error('[logtwo] Resposta de autenticação sem usuário.', data);
      showError('O servidor devolveu uma resposta inválida. Tente novamente.');
      setLoading(false);
      return;
    }

    redirectForDiary(data?.diary);
  } catch (error) {
    console.error(`[logtwo] Falha ao ${mode === 'register' ? 'criar conta' : 'entrar'}`, error);

    if (error instanceof ApiError || error?.status !== undefined) {
      showError(error.message);
    } else {
      showError('Não foi possível concluir agora. Tente novamente.');
    }
    setLoading(false);
  }
});

async function checkSession() {
  try {
    const data = await api('/api/auth/me', { redirectOn401: false });

    if (!data?.user) {
      console.error('[logtwo] Sessão sem usuário na resposta.', data);
      showBootError('Não foi possível abrir o diário. Tente novamente.');
      return;
    }

    redirectForDiary(data?.diary);
  } catch (error) {
    if (error?.status === 401) {
      hideBootScreen();
      return;
    }

    console.error('[logtwo] Falha ao verificar a sessão', error);
    showBootError(error.message || 'Não foi possível abrir o diário.');
  }
}

checkSession();
