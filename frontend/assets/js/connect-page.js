import { api, logout } from './api.js';
import { hideBootScreen, showBootError, toast } from './ui.js';

const choiceState = document.querySelector('#choice-state');
const pendingState = document.querySelector('#pending-state');
const createForm = document.querySelector('#create-form');
const createButton = document.querySelector('#create-diary-btn');
const createError = createForm.querySelector('[data-form-error]');
const joinForm = document.querySelector('#join-form');
const joinButton = document.querySelector('#join-diary-btn');
const joinError = document.querySelector('#join-hint');
const inviteInput = document.querySelector('#invite-input');
const inviteCode = document.querySelector('#invite-code');
const copyButton = document.querySelector('#copy-code');
const copyLabel = document.querySelector('#copy-label');
const refreshButton = document.querySelector('#refresh-state');
const pendingFeedback = document.querySelector('#pending-feedback');
const greeting = document.querySelector('#user-greeting');

let currentDiary = null;
let pollTimer = null;

function setButtonBusy(button, busy, busyLabel = 'Aguarde…') {
  const label = button.querySelector('[data-button-label]');
  const spinner = button.querySelector('[data-button-spinner]');

  button.disabled = busy;
  spinner?.classList.toggle('hidden', !busy);

  if (label) {
    if (busy) {
      label.dataset.idleLabel = label.textContent;
      label.textContent = busyLabel;
    } else if (label.dataset.idleLabel) {
      label.textContent = label.dataset.idleLabel;
      delete label.dataset.idleLabel;
    }
  }
}

function showFormError(element, message) {
  if (!element) return;
  element.textContent = message;
  element.classList.remove('hidden');
  element.classList.add('text-danger');
}

function clearFormError(element, fallback = '') {
  if (!element) return;
  element.textContent = fallback;
  element.classList.add('hidden');
  element.classList.remove('text-danger');
}

function showChoice() {
  choiceState.classList.remove('hidden');
  pendingState.classList.add('hidden');
}

function showPending(diary) {
  currentDiary = diary;
  choiceState.classList.add('hidden');
  pendingState.classList.remove('hidden');
  inviteCode.textContent = diary.inviteCode || '—';
  pendingFeedback.textContent = '';
  startPolling();
}

async function refreshStatus({ manual = false } = {}) {
  if (document.hidden && !manual) return;

  try {
    const data = await api('/api/auth/me', { redirectOn401: false });

    if (data.diary?.status === 'active') {
      stopPolling();
      window.location.replace('/dashboard.html');
      return;
    }

    if (data.diary?.status === 'pending') {
      currentDiary = data.diary;
      inviteCode.textContent = data.diary.inviteCode || '—';

      if (manual) {
        pendingFeedback.textContent = 'Ainda não. O código continua ativo.';
      }
      return;
    }

    if (manual) {
      pendingFeedback.textContent = 'Nenhum diário encontrado. Recarregue a página.';
    }
  } catch (error) {
    if (error?.status === 401) {
      window.location.replace('/index.html');
      return;
    }

    if (manual) {
      pendingFeedback.textContent = error.message;
    }
  }
}

function startPolling() {
  stopPolling();
  pollTimer = window.setInterval(() => refreshStatus(), 6000);
}

function stopPolling() {
  if (pollTimer) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
}

function getInviteCode() {
  return currentDiary?.inviteCode || inviteCode.textContent.trim();
}

async function copyInviteCode() {
  const code = getInviteCode();

  if (!code || code === '—') return;

  try {
    await navigator.clipboard.writeText(code);
  } catch {
    const helper = document.createElement('textarea');
    helper.value = code;
    helper.setAttribute('readonly', '');
    helper.style.position = 'fixed';
    helper.style.opacity = '0';
    document.body.appendChild(helper);
    helper.select();
    document.execCommand('copy');
    helper.remove();
  }

  copyLabel.textContent = 'Código copiado';
  toast('Código copiado. Agora é só enviar para sua dupla.');

  window.setTimeout(() => {
    copyLabel.textContent = 'Copiar código';
  }, 2200);
}

createForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearFormError(createError);
  setButtonBusy(createButton, true, 'Gerando código…');

  try {
    const data = await api('/api/diary', { method: 'POST' });
    showPending(data.diary);
    toast('Diário criado. Envie o código para sua dupla.');
  } catch (error) {
    if (error?.status === 409) {
      await refreshStatus({ manual: true });
      return;
    }
    showFormError(createError, error.message);
  } finally {
    setButtonBusy(createButton, false);
  }
});

joinForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const code = inviteInput.value.trim().toUpperCase();

  if (!/^[A-Z0-9]{8}$/.test(code)) {
    showFormError(joinError, 'Digite os 8 caracteres do código.');
    inviteInput.focus();
    return;
  }

  joinError.classList.remove('text-danger');
  joinError.textContent = '8 caracteres, sem espaços.';
  setButtonBusy(joinButton, true, 'Entrando…');

  try {
    await api('/api/diary/join', { method: 'POST', body: { code } });
    window.location.replace('/dashboard.html');
  } catch (error) {
    showFormError(joinError, error.message);
    setButtonBusy(joinButton, false);
  }
});

inviteInput.addEventListener('input', () => {
  const formatted = inviteInput.value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);

  if (inviteInput.value !== formatted) {
    inviteInput.value = formatted;
  }
});

copyButton.addEventListener('click', copyInviteCode);

refreshButton.addEventListener('click', async () => {
  refreshButton.disabled = true;
  refreshButton.textContent = 'Verificando…';
  await refreshStatus({ manual: true });
  refreshButton.disabled = false;
  refreshButton.textContent = 'Verificar agora';
});

for (const button of document.querySelectorAll('[data-logout]')) {
  button.addEventListener('click', () => logout());
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && currentDiary) refreshStatus();
});

async function init() {
  try {
    const data = await api('/api/auth/me', { redirectOn401: false });

    if (data.diary?.status === 'active') {
      window.location.replace('/dashboard.html');
      return;
    }

    greeting.textContent = `Olá, ${data.user.name.split(/\s+/)[0]}`;

    if (data.diary?.status === 'pending') {
      showPending(data.diary);
    } else {
      showChoice();
    }

    hideBootScreen();
  } catch (error) {
    if (error?.status === 401) {
      window.location.replace('/index.html');
      return;
    }

    showBootError(error.message || 'Não foi possível carregar seu convite.');
  }
}

init();
