import { api, logout } from './api.js';
import {
  debounce,
  escapeHtml,
  firstName,
  formatDuration,
  formatHoursShort,
  formatSince,
  hideBootScreen,
  initials,
  showBootError,
  starSvg,
  staticStars,
  toast,
} from './ui.js';

const state = {
  me: null,
  diary: null,
  stats: null,
  movies: [],
  members: [],
  partner: null,
  watchlist: [],
  favorites: [],
  activeTab: 'watched',
  searchResults: [],
  searchAbort: null,
  modalAbort: null,
  activeMovie: null,
  draftRating: 0,
  modalTrigger: null,
  isSaving: false,
  actionBusy: false,
  avatarBusy: false,
};

const MAX_FAVORITES = 4;
const TAB_HASH = {
  watched: '#assistidos',
  watchlist: '#indicacoes',
  profile: '#perfil',
};
const HASH_TAB = Object.fromEntries(
  Object.entries(TAB_HASH).map(([tab, hash]) => [hash, tab]),
);
const TAB_BY_ID = {
  'tab-watched': 'watched',
  'tab-watchlist': 'watchlist',
  'tab-profile': 'profile',
};
const PANEL_BY_ID = {
  'panel-watched': 'watched',
  'panel-watchlist': 'watchlist',
  'panel-profile': 'profile',
};

function normalizeNavigationMarkup() {
  const buttons = document.querySelectorAll(
    '#tab-watched, #tab-watchlist, #tab-profile, [data-tab]',
  );

  for (const button of buttons) {
    if (!button.dataset.tab && TAB_BY_ID[button.id]) {
      button.dataset.tab = TAB_BY_ID[button.id];
    }
  }

  const panels = document.querySelectorAll(
    '#panel-watched, #panel-watchlist, #panel-profile, [data-panel]',
  );

  for (const panel of panels) {
    if (!panel.dataset.panel && PANEL_BY_ID[panel.id]) {
      panel.dataset.panel = PANEL_BY_ID[panel.id];
    }
  }
}

function on(element, event, handler, options) {
  if (element) element.addEventListener(event, handler, options);
}

const els = {
  duoAvatars: document.querySelector('#duo-avatars'),
  duoNames: document.querySelector('#duo-names'),
  diarySince: document.querySelector('#diary-since'),
  statMovies: document.querySelector('#stat-movies'),
  statHours: document.querySelector('#stat-hours'),
  memberAverages: document.querySelector('#member-averages'),
  sidebarUserAvatar: document.querySelector('#sidebar-user-avatar'),
  sidebarUserName: document.querySelector('#sidebar-user-name'),
  sidebarUserEmail: document.querySelector('#sidebar-user-email'),
  shelfCount: document.querySelector('#shelf-count'),
  moviesGrid: document.querySelector('#movies-grid'),
  emptyState: document.querySelector('#empty-state'),
  emptySearchButton: document.querySelector('#empty-search-btn'),
  tabs: document.querySelector('#dashboard-tabs'),
  watchlistCount: document.querySelector('#watchlist-count'),
  watchlistGrid: document.querySelector('#watchlist-grid'),
  watchlistEmpty: document.querySelector('#watchlist-empty'),
  watchlistSearchButton: document.querySelector('#watchlist-search-btn'),
  profileAvatar: document.querySelector('#profile-avatar'),
  profileName: document.querySelector('#profile-name'),
  profileEmail: document.querySelector('#profile-email'),
  profileAvatarButton: document.querySelector('#profile-avatar-button'),
  profileAvatarRemove: document.querySelector('#profile-avatar-remove'),
  profileAvatarInput: document.querySelector('#profile-avatar-input'),
  profileNameForm: document.querySelector('#profile-name-form'),
  profileNameInput: document.querySelector('#profile-name-input'),
  favoritesCount: document.querySelector('#favorites-count'),
  favoritesGrid: document.querySelector('#favorites-grid'),
  searchWrap: document.querySelector('#search-wrap'),
  searchInput: document.querySelector('#search-input'),
  searchClear: document.querySelector('#search-clear'),
  searchSpinner: document.querySelector('#search-spinner'),
  searchPanel: document.querySelector('#search-panel'),
  modal: document.querySelector('#movie-modal'),
  modalContent: document.querySelector('#modal-content'),
};

normalizeNavigationMarkup();

const FILM_ICON = `
  <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
    <rect x="3" y="4" width="18" height="16" rx="2"></rect>
    <path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"></path>
  </svg>`;

const BOOKMARK_ICON = `
  <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
    <path d="M6 4h12v17l-6-4-6 4V4z"></path>
  </svg>`;

const PLUS_ICON = `
  <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
    <path d="M12 5v14M5 12h14"></path>
  </svg>`;

const TRASH_ICON = `
  <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
    <path d="M4 7h16M9 4h6M7 7l1 13h8l1-13M10 11v5M14 11v5"></path>
  </svg>`;

function cardDeleteButton(attribute, movie, suffix) {
  return `
    <button
      type="button"
      ${attribute}="${movie.tmdbId}"
      aria-label="Remover ${escapeHtml(movie.title)} ${suffix}"
      title="Remover ${suffix}"
      class="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-light/15 bg-base/75 text-zinc-300/80 opacity-70 backdrop-blur transition hover:border-danger/40 hover:text-danger focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
    >
      ${TRASH_ICON}
    </button>`;
}

const formatAverage = (value) =>
  value === null || value === undefined ? '—' : Number(value).toFixed(1).replace('.', ',');

const formatShortDate = (isoDate) => {
  if (!isoDate) return '';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' })
    .format(date)
    .replace('.', '');
};

const memberById = (id) => state.members.find((member) => member.id === id) || null;
const memberTone = (index) =>
  index === 0 ? 'bg-accent/15 text-accent' : 'bg-panel/40 text-zinc-100';

const isRecommended = (movieId) =>
  state.watchlist.some((movie) => movie.tmdbId === movieId);
const isFavorite = (movieId) => state.favorites.some((movie) => movie.tmdbId === movieId);

function tabFromLocation() {
  return HASH_TAB[window.location.hash] || 'watched';
}

function avatarMarkup(
  person,
  {
    size = 'h-10 w-10',
    textSize = 'text-[10px]',
    tone = 'bg-panel/40 text-zinc-100',
    border = 'border-2 border-base',
    extra = '',
  } = {},
) {
  if (person?.avatarUrl) {
    return `<img
      src="${escapeHtml(person.avatarUrl)}"
      alt=""
      loading="lazy"
      decoding="async"
      class="${size} shrink-0 rounded-full object-cover ${border} ${extra}"
    />`;
  }

  return `<span class="flex ${size} shrink-0 items-center justify-center rounded-full font-bold ${border} ${tone} ${textSize} ${extra}">
    ${escapeHtml(initials(person?.name))}
  </span>`;
}

function syncMember(user) {
  if (!user) return;

  const index = state.members.findIndex((member) => member.id === user.id);

  if (index >= 0) {
    state.members[index] = { ...state.members[index], name: user.name, avatarUrl: user.avatarUrl ?? null };
  }

  if (state.partner?.id === user.id) {
    state.partner = { ...state.partner, name: user.name, avatarUrl: user.avatarUrl ?? null };
  }
}

function applyProfileUser(user) {
  if (!user) return;

  state.me = { ...state.me, ...user };
  syncMember(state.me);
  renderSidebar();
  renderProfile();
}

function memberLabel(member) {
  const first = firstName(member.name);
  const hasCollision = state.members.some(
    (other) => other.id !== member.id && firstName(other.name).toLowerCase() === first.toLowerCase(),
  );
  return hasCollision ? member.name.trim() : first;
}

function renderSidebar() {
  const members = state.members;

  els.duoAvatars.innerHTML = members
    .map(
      (member, index) => `
        <div class="shrink-0" title="${escapeHtml(member.name)}">
          ${avatarMarkup(member, { tone: memberTone(index) })}
        </div>`,
    )
    .join('');

  els.duoNames.innerHTML = members
    .map((member, index) => {
      const name = escapeHtml(memberLabel(member));
      if (index === 0) return name;
      return `<span class="px-1 font-display italic text-accent">&amp;</span>${name}`;
    })
    .join('');

  const since = formatSince(state.diary?.createdAt);
  els.diarySince.textContent = since ? `juntos desde ${since}` : 'um diário a dois';

  els.statMovies.textContent = state.stats?.movieCount ?? 0;
  els.statHours.textContent = formatHoursShort(state.stats?.totalMinutes ?? 0);

  els.memberAverages.innerHTML = members
    .map((member, index) => {
      const info = state.stats?.byUser?.[member.id] ?? { count: 0, average: null };
      const rating = formatAverage(info.average);

      return `
        <div class="flex items-center gap-2.5" title="${info.count} ${info.count === 1 ? 'avaliação' : 'avaliações'}">
          ${avatarMarkup(member, {
            size: 'h-6 w-6',
            textSize: 'text-[8px]',
            tone: memberTone(index),
            border: '',
          })}
          <span class="min-w-0 flex-1 truncate text-[11px] text-zinc-400">${escapeHtml(memberLabel(member))}</span>
          <span class="flex items-center gap-1 text-accent">
            ${starSvg('h-2.5 w-2.5')}
            <span class="text-[11px] font-semibold">${rating}</span>
          </span>
        </div>`;
    })
    .join('');

  if (state.me) {
    els.sidebarUserAvatar.innerHTML = avatarMarkup(state.me, {
      size: 'h-9 w-9',
      tone: 'bg-accent/15 text-accent',
      border: 'border border-panel/25',
    });
    els.sidebarUserName.textContent = state.me.name;
    els.sidebarUserEmail.textContent = state.me.email;
  }

  if (members.length === 2) {
    document.title = `logtwo. — ${memberLabel(members[0])} & ${memberLabel(members[1])}`;
  }
}

function posterMarkup(movie, { small = false } = {}) {
  if (movie.posterUrl) {
    return `<img
      src="${escapeHtml(movie.posterUrl)}"
      alt="${small ? '' : `Pôster de ${escapeHtml(movie.title)}`}"
      loading="lazy"
      decoding="async"
      class="${small ? 'search-row-poster h-full w-full object-cover transition duration-500' : 'h-full w-full object-cover transition duration-700 ease-out group-hover:scale-[1.04]'}"
    />`;
  }

  return `
    <div class="poster-sheen flex h-full w-full flex-col items-center justify-center gap-3 p-3 text-center">
      <span class="${small ? 'text-zinc-400' : 'text-accent/50'}">${FILM_ICON}</span>
      <span class="line-clamp-3 font-display ${small ? 'text-sm' : 'text-lg'} leading-tight text-zinc-100/75">
        ${escapeHtml(movie.title)}
      </span>
    </div>`;
}

function ratingChip(member, review, index) {
  const rated = Boolean(review);

  return `
    <div
      class="flex min-w-0 items-center gap-1.5 rounded-lg border px-1.5 py-1 ${
        index === 0 ? 'border-accent/20 bg-accent/[0.05]' : 'border-panel/25 bg-panel/[0.07]'
      }"
      title="Nota de ${escapeHtml(member.name)}${rated ? `: ${review.rating} de 5` : ': ainda sem nota'}"
    >
      <span class="h-1 w-1 shrink-0 rounded-full ${index === 0 ? 'bg-accent' : 'bg-light/60'}"></span>
      <span class="truncate text-[9px] font-medium uppercase tracking-[0.08em] text-zinc-400">
        ${escapeHtml(memberLabel(member))}
      </span>
      <span class="ml-auto flex shrink-0 items-center gap-0.5 ${rated ? 'text-accent' : 'text-zinc-400/40'}">
        ${starSvg('h-2.5 w-2.5')}
        <span class="text-[10px] font-semibold">${rated ? review.rating : '—'}</span>
      </span>
    </div>`;
}

function renderMovieCard(movie, index) {
  const reviews = new Map((movie.reviews || []).map((review) => [review.userId, review]));
  const runtime = movie.runtime ? formatDuration(movie.runtime) : null;
  const meta = [movie.year, runtime].filter(Boolean).join(' · ') || 'ficha do TMDB';
  const delay = Math.min(index * 45, 360);

  return `
    <article class="card-enter group relative" style="animation-delay:${delay}ms">
      <button
        type="button"
        data-movie-id="${movie.tmdbId}"
        class="group block w-full text-left"
        aria-label="Abrir ${escapeHtml(movie.title)}"
      >
        <div class="relative aspect-[2/3] overflow-hidden rounded-2xl border border-panel/25 bg-panel/10">
          ${posterMarkup(movie)}
          <div class="pointer-events-none absolute inset-0 bg-gradient-to-t from-base/75 via-transparent to-transparent"></div>
          <div class="pointer-events-none absolute inset-x-0 bottom-0 flex translate-y-2 items-center justify-center p-3 opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100">
            <span class="rounded-full border border-light/20 bg-base/70 px-3 py-1 text-[8px] uppercase tracking-[0.2em] text-zinc-100 backdrop-blur">
              ver notas
            </span>
          </div>
        </div>

        <div class="mt-3 px-0.5">
          <h3 class="truncate text-[13px] font-semibold leading-snug text-zinc-100">
            ${escapeHtml(movie.title)}
          </h3>
          <p class="mt-1 text-[9px] uppercase tracking-[0.14em] text-zinc-400">${escapeHtml(meta)}</p>
          <div class="mt-2.5 grid grid-cols-2 gap-1.5">
            ${state.members
              .map((member, memberIndex) =>
                ratingChip(member, reviews.get(member.id), memberIndex),
              )
              .join('')}
          </div>
        </div>
      </button>
      ${cardDeleteButton('data-delete-watched', movie, 'dos assistidos')}
    </article>`;
}

function renderShelf() {
  const count = state.movies.length;

  els.shelfCount.textContent =
    count === 0 ? 'Nenhum filme por aqui ainda' : `${count} ${count === 1 ? 'filme' : 'filmes'} na estante`;
  els.moviesGrid.classList.toggle('hidden', count === 0);
  els.emptyState.classList.toggle('hidden', count > 0);

  if (count === 0) {
    els.moviesGrid.innerHTML = '';
    return;
  }

  els.moviesGrid.innerHTML = state.movies.map(renderMovieCard).join('');
}

function renderWatchlistCard(movie, index) {
  const recommender = movie.recommendedBy?.name || 'alguém da dupla';
  const runtime = movie.runtime ? formatDuration(movie.runtime) : null;
  const meta = [movie.year, runtime].filter(Boolean).join(' · ') || 'ficha do TMDB';
  const date = formatShortDate(movie.recommendedAt);
  const delay = Math.min(index * 45, 360);

  return `
    <article class="card-enter group relative" style="animation-delay:${delay}ms">
      <button
        type="button"
        data-movie-id="${movie.tmdbId}"
        class="group block w-full text-left"
        aria-label="Abrir ${escapeHtml(movie.title)}"
      >
        <div class="relative aspect-[2/3] overflow-hidden rounded-2xl border border-panel/25 bg-panel/10">
          ${posterMarkup(movie)}
          <div class="pointer-events-none absolute inset-0 bg-gradient-to-t from-base/75 via-transparent to-transparent"></div>
          <span class="absolute left-2.5 top-2.5 rounded-full border border-accent/25 bg-base/70 px-2 py-0.5 text-[8px] uppercase tracking-[0.14em] text-accent backdrop-blur">
            na fila
          </span>
          <div class="pointer-events-none absolute inset-x-0 bottom-0 flex translate-y-2 items-center justify-center p-3 opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100">
            <span class="rounded-full border border-light/20 bg-base/70 px-3 py-1 text-[8px] uppercase tracking-[0.2em] text-zinc-100 backdrop-blur">
              abrir ficha
            </span>
          </div>
        </div>

        <div class="mt-3 px-0.5">
          <h3 class="truncate text-[13px] font-semibold leading-snug text-zinc-100">
            ${escapeHtml(movie.title)}
          </h3>
          <p class="mt-1 text-[9px] uppercase tracking-[0.14em] text-zinc-400">${escapeHtml(meta)}</p>
        </div>
      </button>

      ${cardDeleteButton('data-remove-recommendation', movie, 'das indicações')}

      <p class="mt-2.5 min-w-0 truncate px-0.5 text-[9px] uppercase tracking-[0.12em] text-zinc-400" title="Indicado por ${escapeHtml(recommender)}">
        por <span class="text-accent/80">${escapeHtml(firstName(recommender))}</span>${date ? ` · ${escapeHtml(date)}` : ''}
      </p>
    </article>`;
}

function renderWatchlist() {
  const count = state.watchlist.length;

  els.watchlistCount.textContent =
    count === 0
      ? 'Nenhuma indicação ainda'
      : `${count} ${count === 1 ? 'filme esperando' : 'filmes esperando'} vocês`;
  els.watchlistGrid.classList.toggle('hidden', count === 0);
  els.watchlistEmpty.classList.toggle('hidden', count > 0);

  if (count === 0) {
    els.watchlistGrid.innerHTML = '';
    return;
  }

  els.watchlistGrid.innerHTML = state.watchlist.map(renderWatchlistCard).join('');
}

function renderFavoriteSlot(movie) {
  if (!movie) {
    return `
      <button
        type="button"
        data-empty-favorite
        aria-label="Adicionar um filme favorito"
        class="group flex aspect-[2/3] w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-panel/30 bg-panel/[0.03] px-3 text-center transition hover:border-accent/40 hover:bg-accent/[0.04]"
      >
        <span class="flex h-9 w-9 items-center justify-center rounded-full border border-panel/35 text-zinc-400 transition group-hover:border-accent/40 group-hover:text-accent">
          ${PLUS_ICON}
        </span>
        <span class="text-[9px] uppercase tracking-[0.16em] text-zinc-400/70">vaga livre</span>
      </button>`;
  }

  return `
    <div class="group relative">
      <button
        type="button"
        data-movie-id="${movie.tmdbId}"
        class="block w-full text-left"
        aria-label="Abrir ${escapeHtml(movie.title)}"
      >
        <div class="relative aspect-[2/3] overflow-hidden rounded-2xl border border-panel/25 bg-panel/10">
          ${posterMarkup(movie)}
          <div class="pointer-events-none absolute inset-0 bg-gradient-to-t from-base/85 via-transparent to-transparent"></div>
          <div class="pointer-events-none absolute inset-x-0 bottom-0 p-3">
            <p class="line-clamp-2 text-[11px] font-semibold leading-snug text-zinc-100">
              ${escapeHtml(movie.title)}
            </p>
            ${movie.year ? `<p class="mt-1 text-[8px] uppercase tracking-[0.14em] text-zinc-400">${escapeHtml(movie.year)}</p>` : ''}
          </div>
        </div>
      </button>
      <button
        type="button"
        data-remove-favorite="${movie.tmdbId}"
        aria-label="Remover ${escapeHtml(movie.title)} dos favoritos"
        class="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-light/15 bg-base/75 text-zinc-300 opacity-0 backdrop-blur transition hover:border-danger/40 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
      >
        <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18"></path>
        </svg>
      </button>
    </div>`;
}

function renderProfile() {
  if (!state.me) return;

  els.profileAvatar.innerHTML = avatarMarkup(state.me, {
    size: 'h-24 w-24 sm:h-28 sm:w-28',
    textSize: 'text-3xl',
    tone: 'bg-accent/15 text-accent',
    border: 'border border-panel/40',
  });
  els.profileName.textContent = state.me.name;
  els.profileEmail.textContent = state.me.email;

  if (document.activeElement !== els.profileNameInput) {
    els.profileNameInput.value = state.me.name;
  }

  const hasAvatar = Boolean(state.me.avatarUrl);
  els.profileAvatarRemove.classList.toggle('hidden', !hasAvatar);
  els.profileAvatarRemove.classList.toggle('inline-flex', hasAvatar);

  els.favoritesCount.textContent = `${state.favorites.length}/${MAX_FAVORITES}`;
  els.favoritesGrid.innerHTML = Array.from({ length: MAX_FAVORITES }, (_, index) =>
    renderFavoriteSlot(state.favorites[index]),
  ).join('');
}

function renderTabs() {
  const counts = {
    watched: state.movies.length,
    watchlist: state.watchlist.length,
  };

  for (const element of document.querySelectorAll('[data-tab-count]')) {
    element.textContent = counts[element.dataset.tabCount] ?? 0;
  }
}

function setActiveTab(tab, { push = false, animate = true } = {}) {
  const next = TAB_HASH[tab] ? tab : 'watched';
  state.activeTab = next;

  for (const button of document.querySelectorAll('[data-tab]')) {
    const active = button.dataset.tab === next;

    button.classList.toggle('is-active', active);
    button.classList.toggle('text-zinc-400', !active);
    button.classList.toggle('text-zinc-100', active);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
  }

  for (const panel of document.querySelectorAll('[data-panel]')) {
    const active = panel.dataset.panel === next;

    panel.hidden = false;
    panel.classList.toggle('hidden', !active);
    panel.classList.toggle('block', active);

    if (active && animate) {
      panel.classList.remove('animate-fade-up');
      void panel.offsetWidth;
      panel.classList.add('animate-fade-up');
    }
  }

  if (push && window.location.hash !== TAB_HASH[next]) {
    window.history.pushState({ tab: next }, '', TAB_HASH[next]);
  }

  const main = document.querySelector('main');
  main?.scrollTo({ top: 0, behavior: 'auto' });

  if (window.matchMedia('(max-width: 1023px)').matches) {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
}

function renderAll() {
  renderSidebar();
  renderShelf();
  renderWatchlist();
  renderProfile();
  renderTabs();
}

function applyDashboardData(data) {
  const diary = data?.diary;

  if (!diary || !Array.isArray(diary.members)) {
    console.error('[logtwo] /api/diary devolveu um diário inválido.', data);
    throw new Error('Não foi possível carregar os dados do diário.');
  }

  state.diary = diary;
  state.stats = data.stats ?? null;
  state.movies = Array.isArray(data.movies) ? data.movies : [];
  state.members = diary.members;
  state.partner = diary.partner ?? null;
}

async function loadDashboard() {
  const [data, recommendationsData, profileData] = await Promise.all([
    api('/api/diary'),
    api('/api/recommendations').catch((error) => {
      console.error('[logtwo] Não foi possível carregar as indicações.', error);
      return null;
    }),
    api('/api/profile').catch((error) => {
      console.error('[logtwo] Não foi possível carregar o perfil.', error);
      return null;
    }),
  ]);

  if (!data?.diary) {
    console.error('[logtwo] /api/diary sem diário na resposta.', data);
    throw new Error('Não foi possível carregar os dados do diário.');
  }

  applyDashboardData(data);

  if (Array.isArray(recommendationsData?.recommendations)) {
    state.watchlist = recommendationsData.recommendations;
  }

  if (Array.isArray(profileData?.favorites)) {
    state.favorites = profileData.favorites;
  }

  if (profileData?.user) {
    state.me = { ...state.me, ...profileData.user };
    syncMember(state.me);
  }
}

function setSearchExpanded(expanded) {
  els.searchInput.setAttribute('aria-expanded', String(expanded));
}

function hideSearchPanel() {
  state.searchAbort?.abort();
  state.searchAbort = null;
  els.searchSpinner.classList.add('hidden');
  els.searchPanel.classList.add('hidden');
  els.searchPanel.innerHTML = '';
  setSearchExpanded(false);
}

function showSearchPanel(html) {
  els.searchPanel.innerHTML = html;
  els.searchPanel.classList.remove('hidden');
  setSearchExpanded(true);
}

function renderSearchLoading() {
  const skeleton = `
    <div class="flex items-center gap-3 p-2">
      <div class="h-16 w-11 shrink-0 animate-pulse rounded-md bg-panel/20"></div>
      <div class="flex-1 space-y-2">
        <div class="h-3 w-2/3 animate-pulse rounded bg-panel/20"></div>
        <div class="h-2.5 w-1/3 animate-pulse rounded bg-panel/15"></div>
      </div>
    </div>`;

  showSearchPanel(`
    <div class="flex items-center justify-between border-b border-panel/20 px-4 py-3">
      <p class="micro-label">buscando no tmdb</p>
      <span class="spinner spinner-light"></span>
    </div>
    <div class="space-y-1 p-2">${skeleton.repeat(3)}</div>`);
}

function renderSearchResults(results) {
  const query = els.searchInput.value.trim();

  if (results.length === 0) {
    showSearchPanel(`
      <div class="px-6 py-10 text-center">
        <p class="text-sm text-zinc-100">Nenhum filme encontrado para “${escapeHtml(query)}”.</p>
        <p class="mt-2 text-[11px] text-zinc-400">Tente outro título ou o nome original.</p>
      </div>`);
    return;
  }

  const rows = results
    .map(
      (movie) => `
        <button
          type="button"
          data-search-result="${movie.tmdbId}"
          class="search-row flex w-full items-center gap-3 rounded-xl p-2 text-left transition hover:bg-panel/15"
        >
          <div class="h-16 w-11 shrink-0 overflow-hidden rounded-md bg-panel/20">
            ${posterMarkup(movie, { small: true })}
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-[13px] font-medium text-zinc-100">${escapeHtml(movie.title)}</p>
            <p class="mt-1 text-[9px] uppercase tracking-[0.16em] text-zinc-400">
              ${movie.year ? escapeHtml(movie.year) : 'sem data'}
            </p>
          </div>
          ${
            movie.inDiary
              ? `<span class="shrink-0 rounded-full border border-accent/25 bg-accent/[0.06] px-2 py-1 text-[8px] uppercase tracking-[0.14em] text-accent">no diário</span>`
              : isRecommended(movie.tmdbId)
                ? `<span class="shrink-0 rounded-full border border-light/20 px-2 py-1 text-[8px] uppercase tracking-[0.14em] text-light/70">indicado</span>`
                : `<span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-panel/35 text-zinc-400">
                     <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>
                   </span>`
          }
        </button>`,
    )
    .join('');

  showSearchPanel(`
    <div class="flex items-center justify-between border-b border-panel/20 px-4 py-3">
      <p class="micro-label">resultados no tmdb</p>
      <span class="text-[9px] uppercase tracking-[0.16em] text-zinc-400">${results.length}</span>
    </div>
    <div class="max-h-[min(430px,60vh)] overflow-y-auto p-2">${rows}</div>
    <p class="border-t border-panel/20 px-4 py-2.5 text-center text-[9px] uppercase tracking-[0.14em] text-zinc-400/60">
      escolha um filme para abrir as notas
    </p>`);
}

function renderSearchError(message) {
  showSearchPanel(`
    <div class="px-6 py-8 text-center">
      <p class="text-xs leading-relaxed text-danger">${escapeHtml(message)}</p>
      <button
        type="button"
        data-retry-search
        class="mt-4 rounded-full border border-panel/40 px-4 py-2 text-[10px] uppercase tracking-[0.14em] text-zinc-400 transition hover:border-accent/40 hover:text-zinc-100"
      >
        Tentar novamente
      </button>
    </div>`);
}

async function performSearch(query) {
  if (query.length < 2) return;
  if (els.searchInput.value.trim() !== query) return;

  state.searchAbort?.abort();
  const controller = new AbortController();
  state.searchAbort = controller;

  els.searchSpinner.classList.remove('hidden');
  renderSearchLoading();

  try {
    const data = await api(`/api/movies/search?q=${encodeURIComponent(query)}`, {
      signal: controller.signal,
    });

    if (controller.signal.aborted || els.searchInput.value.trim() !== query) return;

    if (!Array.isArray(data?.results)) {
      console.error('[logtwo] Busca sem lista de resultados.', data);
      renderSearchError('O servidor devolveu uma busca inválida. Tente novamente.');
      return;
    }

    state.searchResults = data.results;
    renderSearchResults(data.results);
  } catch (error) {
    if (error.name === 'AbortError') return;

    console.error('[logtwo] Falha na busca de filmes', error);
    renderSearchError(error.message);
  } finally {
    if (state.searchAbort === controller) {
      state.searchAbort = null;
      els.searchSpinner.classList.add('hidden');
    }
  }
}

const scheduleSearch = debounce((query) => performSearch(query), 400);

function updateSearchClear() {
  const visible = els.searchInput.value.length > 0;
  els.searchClear.classList.toggle('hidden', !visible);
  els.searchClear.classList.toggle('flex', visible);
}

function resetSearch() {
  state.searchAbort?.abort();
  state.searchAbort = null;
  els.searchInput.value = '';
  state.searchResults = [];
  els.searchSpinner.classList.add('hidden');
  updateSearchClear();
  hideSearchPanel();
}

els.searchInput.addEventListener('input', () => {
  updateSearchClear();

  const query = els.searchInput.value.trim();

  if (query.length < 2) {
    state.searchAbort?.abort();
    state.searchAbort = null;
    els.searchSpinner.classList.add('hidden');
    hideSearchPanel();
    return;
  }

  scheduleSearch(query);
});

els.searchInput.addEventListener('focus', () => {
  const query = els.searchInput.value.trim();

  if (query.length >= 2 && els.searchPanel.classList.contains('hidden')) {
    performSearch(query);
  }
});

els.searchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    hideSearchPanel();
    return;
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    performSearch(els.searchInput.value.trim());
  }
});

els.searchClear.addEventListener('click', () => {
  resetSearch();
  els.searchInput.focus();
});

els.searchPanel.addEventListener('click', (event) => {
  const result = event.target.closest('[data-search-result]');

  if (result) {
    const movieId = Number(result.dataset.searchResult);
    resetSearch();
    els.searchInput.blur();
    openMovie(movieId, els.searchInput);
    return;
  }

  if (event.target.closest('[data-retry-search]')) {
    performSearch(els.searchInput.value.trim());
  }
});

document.addEventListener('pointerdown', (event) => {
  if (!els.searchWrap.contains(event.target)) {
    hideSearchPanel();
  }
});

on(els.emptySearchButton, 'click', focusSearch);
on(els.watchlistSearchButton, 'click', focusSearch);

for (const button of document.querySelectorAll('[data-tab]')) {
  button.addEventListener('click', () => {
    setActiveTab(button.dataset.tab, { push: true });
  });
}

on(els.tabs, 'keydown', (event) => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;

  const buttons = [...document.querySelectorAll('[data-tab]')];
  const current = buttons.indexOf(document.activeElement);

  if (current < 0) return;

  event.preventDefault();

  const nextIndex =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? buttons.length - 1
        : (current + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;

  const next = buttons[nextIndex];
  next.focus();
  setActiveTab(next.dataset.tab, { push: true });
});

window.addEventListener('popstate', () => {
  setActiveTab(tabFromLocation());
});

on(els.moviesGrid, 'click', (event) => {
  const remove = event.target.closest('[data-delete-watched]');

  if (remove) {
    deleteWatchedFromShelf(Number(remove.dataset.deleteWatched));
    return;
  }

  const card = event.target.closest('[data-movie-id]');
  if (card) openMovie(Number(card.dataset.movieId), card);
});

on(els.watchlistGrid, 'click', (event) => {
  const remove = event.target.closest('[data-remove-recommendation]');

  if (remove) {
    removeRecommendationFromShelf(Number(remove.dataset.removeRecommendation));
    return;
  }

  const card = event.target.closest('[data-movie-id]');
  if (card) openMovie(Number(card.dataset.movieId), card);
});

on(els.favoritesGrid, 'click', (event) => {
  const remove = event.target.closest('[data-remove-favorite]');

  if (remove) {
    removeFavoriteFromShelf(Number(remove.dataset.removeFavorite));
    return;
  }

  if (event.target.closest('[data-empty-favorite]')) {
    focusSearch();
    return;
  }

  const card = event.target.closest('[data-movie-id]');
  if (card) openMovie(Number(card.dataset.movieId), card);
});

on(els.profileAvatarButton, 'click', () => {
  els.profileAvatarInput?.click();
});

on(els.profileAvatarInput, 'change', () => {
  const file = els.profileAvatarInput.files?.[0];
  if (file) uploadAvatar(file);
});

on(els.profileAvatarRemove, 'click', removeAvatar);
on(els.profileNameForm, 'submit', saveProfileName);

function modalCloseButton() {
  return `
    <button
      type="button"
      data-close-modal-button
      aria-label="Fechar filme"
      class="absolute right-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-light/15 bg-base/60 text-zinc-100/80 backdrop-blur transition hover:border-accent/40 hover:text-zinc-100"
    >
      <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <path d="M6 6l12 12M18 6 6 18"></path>
      </svg>
    </button>`;
}

function renderModalLoading() {
  els.modalContent.innerHTML = `
    <div class="relative p-6 sm:p-9">
      ${modalCloseButton()}
      <div class="flex flex-col gap-6 pt-10 sm:flex-row sm:pt-4">
        <div class="h-56 w-36 shrink-0 animate-pulse rounded-2xl bg-panel/20"></div>
        <div class="flex-1 space-y-3 pt-4">
          <div class="h-2.5 w-24 animate-pulse rounded bg-panel/20"></div>
          <div class="h-9 w-3/4 animate-pulse rounded bg-panel/20"></div>
          <div class="h-3 w-1/2 animate-pulse rounded bg-panel/15"></div>
          <div class="h-20 w-full animate-pulse rounded bg-panel/10"></div>
        </div>
      </div>
      <p class="mt-6 text-[10px] uppercase tracking-[0.2em] text-zinc-400">abrindo a ficha do filme</p>
    </div>`;
}

function renderModalError(message) {
  els.modalContent.innerHTML = `
    <div class="relative px-6 py-16 text-center">
      ${modalCloseButton()}
      <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-danger/30 text-danger">
        ${FILM_ICON}
      </div>
      <h2 id="modal-title" class="mt-5 font-display text-3xl">Não deu para abrir este filme.</h2>
      <p class="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-zinc-400">${escapeHtml(message)}</p>
      <button type="button" data-close-modal-button class="mt-6 rounded-full border border-panel/40 px-5 py-2.5 text-xs text-zinc-400 transition hover:border-accent/40 hover:text-zinc-100">
        Voltar para a estante
      </button>
    </div>`;
}

function starButtons(rating) {
  return Array.from({ length: 5 }, (_, index) => {
    const value = index + 1;
    return `
      <button
        type="button"
        data-rating="${value}"
        aria-label="${value} ${value === 1 ? 'estrela' : 'estrelas'}"
        aria-pressed="${value === rating}"
        class="rating-star ${value <= rating ? 'is-filled' : ''} rounded-md p-0.5"
      >
        ${starSvg('h-7 w-7')}
      </button>`;
  }).join('');
}

function modalActionsMarkup() {
  const movie = state.activeMovie;
  if (!movie) return '';

  const recommendation = state.watchlist.find((item) => item.tmdbId === movie.tmdbId);
  const favorite = isFavorite(movie.tmdbId);
  const busy = state.actionBusy;

  const recLabel = recommendation ? 'Remover indicação' : 'Indicar filme';
  const recTitle = recommendation
    ? 'Remover esta indicação da dupla'
    : 'Sugerir este filme para a dupla';
  const recDisabled = busy;

  const favoriteFull = !favorite && state.favorites.length >= MAX_FAVORITES;
  const favLabel = favorite
    ? 'Remover dos favoritos'
    : favoriteFull
      ? 'Favoritos cheios'
      : 'Adicionar aos favoritos';
  const favTitle = favorite
    ? 'Remover dos seus favoritos'
    : favoriteFull
      ? `Você já escolheu ${MAX_FAVORITES} favoritos.`
      : 'Salvar nos seus favoritos';
  const favDisabled = busy || favoriteFull;

  const base =
    'inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] transition disabled:cursor-not-allowed disabled:opacity-40';
  const neutral = 'border-panel/35 text-zinc-300 hover:border-accent/40 hover:text-zinc-100';
  const selected = 'border-accent/40 bg-accent/[0.08] text-accent hover:border-accent/60';

  return `
    <button
      type="button"
      data-action-recommend
      aria-pressed="${Boolean(recommendation)}"
      title="${escapeHtml(recTitle)}"
      ${recDisabled ? 'disabled' : ''}
      class="${base} ${recommendation ? selected : neutral}"
    >
      ${BOOKMARK_ICON}
      ${escapeHtml(recLabel)}
    </button>

    <button
      type="button"
      data-action-favorite
      aria-pressed="${favorite}"
      title="${escapeHtml(favTitle)}"
      ${favDisabled ? 'disabled' : ''}
      class="${base} ${favorite ? selected : neutral}"
    >
      ${starSvg('h-3.5 w-3.5')}
      ${escapeHtml(favLabel)}
    </button>

    ${
      favoriteFull
        ? `<span class="text-[9px] uppercase tracking-[0.12em] text-zinc-400/60">limite de ${MAX_FAVORITES} favoritos</span>`
        : ''
    }`;
}

function updateModalActions() {
  const container = els.modal.querySelector('[data-modal-actions]');
  if (!container) return;
  container.innerHTML = modalActionsMarkup();
}

function renderModal() {
  const movie = state.activeMovie;
  if (!movie) return;

  const reviews = movie.reviews || [];
  const ownReview = reviews.find((review) => review.userId === state.me.id) || null;
  const partner = state.partner || state.members.find((member) => member.id !== state.me.id);
  const partnerReview = partner
    ? reviews.find((review) => review.userId === partner.id) || null
    : null;
  const ownMemberIndex = state.members.findIndex((member) => member.id === state.me.id);
  const partnerIndex = partner
    ? state.members.findIndex((member) => member.id === partner.id)
    : 1;
  const ownName = memberLabel(state.me);
  const partnerName = partner ? memberLabel(partner) : 'Sua dupla';
  const genres = movie.genres || [];
  const runtime = movie.runtime ? formatDuration(movie.runtime) : null;
  const backdrop = movie.backdropUrl
    ? `<img src="${escapeHtml(movie.backdropUrl)}" alt="" class="absolute inset-0 h-full w-full object-cover opacity-40" />`
    : '<div class="poster-sheen absolute inset-0 opacity-70"></div>';

  const ownPanel = `
    <section class="rounded-2xl border border-accent/25 bg-accent/[0.04] p-5">
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-2.5">
          ${avatarMarkup(state.me, {
            size: 'h-8 w-8',
            textSize: 'text-[9px]',
            tone: memberTone(ownMemberIndex),
            border: 'border border-accent/25',
          })}
          <div>
            <p class="micro-label">sua nota</p>
            <p class="mt-0.5 text-xs font-semibold text-zinc-100">${escapeHtml(ownName)}</p>
          </div>
        </div>
        <span id="draft-rating-label" class="text-[10px] uppercase tracking-[0.14em] text-accent">
          ${state.draftRating ? `${state.draftRating} / 5` : 'Sem nota'}
        </span>
      </div>

      <div id="rating-stars" class="mt-4 flex items-center gap-1" role="group" aria-label="Sua nota de 1 a 5">
        ${starButtons(state.draftRating)}
      </div>

      <label for="review-comment" class="micro-label mt-5 block">comentário</label>
      <textarea
        id="review-comment"
        maxlength="500"
        rows="3"
        placeholder="O que você achou? (opcional)"
        class="mt-2 w-full resize-none rounded-xl border border-panel/30 bg-base/50 p-3 text-sm leading-relaxed text-zinc-100 placeholder:text-zinc-400/40 transition focus:border-accent/60 focus:outline-none"
      >${escapeHtml(ownReview?.comment || '')}</textarea>

      <div class="mt-3 flex items-center justify-between gap-3">
        <span id="comment-count" class="text-[9px] tracking-[0.1em] text-zinc-400">${(ownReview?.comment || '').length}/500</span>
        <button
          type="button"
          data-save-review
          ${state.draftRating ? '' : 'disabled'}
          class="rounded-full bg-accent px-4 py-2 text-[11px] font-semibold text-base transition hover:bg-light disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span data-save-label>${ownReview ? 'Atualizar nota' : 'Salvar nota'}</span>
        </button>
      </div>
    </section>`;

  const partnerPanel = `
    <section class="rounded-2xl border border-panel/25 bg-panel/[0.06] p-5">
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-2.5">
          ${avatarMarkup(partner || { name: '?' }, {
            size: 'h-8 w-8',
            textSize: 'text-[9px]',
            tone: memberTone(partnerIndex),
            border: 'border border-panel/25',
          })}
          <div>
            <p class="micro-label">nota de ${escapeHtml(partnerName)}</p>
            <p class="mt-0.5 text-xs font-semibold text-zinc-100">${escapeHtml(partner?.name || 'Sua dupla')}</p>
          </div>
        </div>
        <span class="text-[10px] uppercase tracking-[0.14em] ${partnerReview ? 'text-accent' : 'text-zinc-400/60'}">
          ${partnerReview ? `${partnerReview.rating} / 5` : 'Sem nota'}
        </span>
      </div>

      <div class="mt-4 flex items-center gap-1">
        ${staticStars(partnerReview?.rating || 0, { size: 'h-6 w-6' })}
      </div>

      <div class="mt-5 min-h-[104px] rounded-xl border border-panel/20 bg-base/30 p-3">
        ${
          partnerReview?.comment
            ? `<p class="whitespace-pre-line text-[13px] leading-relaxed text-zinc-100/80">${escapeHtml(partnerReview.comment)}</p>`
            : `<p class="text-[11px] italic leading-relaxed text-zinc-400/60">${
                partnerReview
                  ? `${escapeHtml(partnerName)} não deixou comentário.`
                  : `${escapeHtml(partnerName)} ainda não avaliou este filme.`
              }</p>`
        }
      </div>
    </section>`;

  els.modalContent.innerHTML = `
    <div class="relative overflow-hidden rounded-t-[26px] sm:rounded-t-[30px]">
      ${backdrop}
      <div class="absolute inset-0 bg-gradient-to-t from-[#0b0d0c] via-[#0b0d0c]/75 to-[#0b0d0c]/20"></div>
      ${modalCloseButton()}

      <div class="relative z-10 flex items-end gap-4 px-5 pb-6 pt-24 sm:gap-7 sm:px-8 sm:pb-8 sm:pt-28">
        <div class="w-[94px] shrink-0 sm:w-[142px]">
          <div class="aspect-[2/3] overflow-hidden rounded-xl border border-light/10 bg-panel/20 shadow-2xl">
            ${posterMarkup(movie)}
          </div>
        </div>
        <div class="min-w-0 flex-1 pb-0.5">
          <p class="micro-label">ficha do filme</p>
          <h2 id="modal-title" class="mt-2 font-display text-[30px] leading-[1.02] tracking-[-0.03em] sm:text-5xl">
            ${escapeHtml(movie.title)}
          </h2>
          <div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] uppercase tracking-[0.18em] text-zinc-400">
            ${movie.year ? `<span>${escapeHtml(movie.year)}</span>` : ''}
            ${runtime ? `<span>${escapeHtml(runtime)}</span>` : ''}
            ${
              movie.voteAverage
                ? `<span class="text-accent/80">TMDB ${formatAverage(movie.voteAverage)}</span>`
                : ''
            }
          </div>
          ${
            genres.length
              ? `<div class="mt-3 flex flex-wrap gap-1.5">
                   ${genres
                     .slice(0, 5)
                     .map(
                       (genre) =>
                         `<span class="rounded-full border border-panel/35 px-2 py-0.5 text-[8px] uppercase tracking-[0.12em] text-zinc-400">${escapeHtml(genre)}</span>`,
                     )
                     .join('')}
                 </div>`
              : ''
          }
        </div>
      </div>
    </div>

    <div class="px-5 pb-7 sm:px-8 sm:pb-8">
      <p class="max-w-2xl text-[13px] leading-relaxed ${movie.overview ? 'text-zinc-400' : 'italic text-zinc-400/60'}">
        ${escapeHtml(movie.overview || 'Sem sinopse disponível no TMDB.')}
      </p>

      <div class="mt-5 flex flex-wrap items-center gap-2" data-modal-actions>
        ${modalActionsMarkup()}
      </div>

      <div class="my-6 h-px bg-panel/25"></div>

      <div class="grid gap-4 lg:grid-cols-2">
        ${ownPanel}
        ${partnerPanel}
      </div>

      <p class="mt-5 text-center text-[8px] uppercase tracking-[0.2em] text-zinc-400/50">
        cada nota é individual — você edita apenas a sua · dados e imagens via TMDB
      </p>
    </div>`;
}

function paintStars(rating, preview = 0) {
  const shown = preview || rating;
  const buttons = els.modal.querySelectorAll('#rating-stars [data-rating]');

  for (const button of buttons) {
    const value = Number(button.dataset.rating);
    button.classList.toggle('is-filled', value <= shown);
    button.setAttribute('aria-pressed', String(value === rating));
  }

  const label = els.modal.querySelector('#draft-rating-label');
  if (label) {
    label.textContent = shown ? `${shown} / 5` : 'Sem nota';
  }
}

function updateSaveButton() {
  const button = els.modal.querySelector('[data-save-review]');
  if (!button) return;

  const ownReview = state.activeMovie?.reviews?.find(
    (review) => review.userId === state.me.id,
  );

  button.disabled = !state.draftRating || state.isSaving;
  const label = button.querySelector('[data-save-label]');

  if (label) {
    label.textContent = state.isSaving ? 'Salvando…' : ownReview ? 'Atualizar nota' : 'Salvar nota';
  }
}

async function refreshAfterReview(fallbackMovie) {
  try {
    await loadDashboard();
    renderSidebar();
    renderShelf();
    renderTabs();
  } catch (error) {
    console.warn('[logtwo] Não foi possível recarregar o diário; mantendo o estado local.', error);
    const index = state.movies.findIndex((movie) => movie.tmdbId === fallbackMovie.tmdbId);
    if (index >= 0) {
      state.movies[index] = fallbackMovie;
    } else {
      state.movies.unshift(fallbackMovie);
    }
    renderShelf();
  }
}

async function syncDiaryState() {
  try {
    await loadDashboard();
    renderAll();
  } catch (error) {
    console.warn('[logtwo] Não foi possível sincronizar o diário; mantendo o estado local.', error);
  }
}

async function saveReview() {
  if (!state.activeMovie || state.isSaving) return;

  if (!state.draftRating) {
    toast('Escolha de 1 a 5 estrelas antes de salvar.', 'error');
    return;
  }

  const movie = state.activeMovie;
  const hadReview = movie.reviews.some((review) => review.userId === state.me.id);
  const comment = els.modal.querySelector('#review-comment')?.value ?? '';

  state.isSaving = true;
  updateSaveButton();

  try {
    const data = await api(`/api/movies/${movie.tmdbId}/review`, {
      method: 'PUT',
      body: { rating: state.draftRating, comment },
    });

    if (!data?.review) {
      console.error('[logtwo] Salvamento de nota sem avaliação na resposta.', data);
      throw new Error('O servidor não confirmou sua nota. Tente novamente.');
    }

    movie.reviews = [
      data.review,
      ...movie.reviews.filter((review) => review.userId !== state.me.id),
    ];
    state.draftRating = data.review.rating;

    toast(hadReview ? 'Sua nota foi atualizada.' : 'Sua nota foi salva.');
    await refreshAfterReview(movie);
    renderModal();
    els.modal.querySelector('[data-save-review]')?.focus();
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.isSaving = false;
    updateSaveButton();
  }
}

async function toggleRecommendation() {
  const movie = state.activeMovie;
  if (!movie || state.actionBusy) return;

  const existing = state.watchlist.find((item) => item.tmdbId === movie.tmdbId);

  if (existing && !window.confirm('Tem certeza que deseja remover este item?')) return;

  state.actionBusy = true;
  updateModalActions();

  try {
    if (existing) {
      await api(`/api/recommendations/${movie.tmdbId}`, { method: 'DELETE' });
      state.watchlist = state.watchlist.filter((item) => item.tmdbId !== movie.tmdbId);
      toast('Indicação removida.');
    } else {
      const data = await api('/api/recommendations', {
        method: 'POST',
        body: { movieId: movie.tmdbId },
      });

      if (!data?.recommendation) {
        console.error('[logtwo] Indicação sem filme na resposta.', data);
        throw new Error('O servidor não confirmou a indicação.');
      }

      state.watchlist = [
        data.recommendation,
        ...state.watchlist.filter((item) => item.tmdbId !== data.recommendation.tmdbId),
      ];
      toast('Filme indicado para a dupla.');
    }

    renderWatchlist();
    renderTabs();
    await syncDiaryState();
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.actionBusy = false;
    updateModalActions();
  }
}

async function toggleFavorite() {
  const movie = state.activeMovie;
  if (!movie || state.actionBusy) return;

  const existing = isFavorite(movie.tmdbId);

  if (!existing && state.favorites.length >= MAX_FAVORITES) {
    toast(`Você pode escolher até ${MAX_FAVORITES} filmes favoritos.`, 'error');
    return;
  }

  state.actionBusy = true;
  updateModalActions();

  try {
    if (existing) {
      await api(`/api/profile/favorites/${movie.tmdbId}`, { method: 'DELETE' });
      state.favorites = state.favorites.filter((item) => item.tmdbId !== movie.tmdbId);
      toast('Filme removido dos favoritos.');
    } else {
      const data = await api('/api/profile/favorites', {
        method: 'POST',
        body: { movieId: movie.tmdbId },
      });

      if (Array.isArray(data?.favorites)) {
        state.favorites = data.favorites;
      } else if (data?.favorite) {
        state.favorites = [
          ...state.favorites.filter((item) => item.tmdbId !== data.favorite.tmdbId),
          data.favorite,
        ];
      } else {
        console.error('[logtwo] Favorito sem lista na resposta.', data);
        throw new Error('O servidor não confirmou o favorito.');
      }

      toast('Filme adicionado aos favoritos.');
    }

    renderProfile();
    renderTabs();
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.actionBusy = false;
    updateModalActions();
  }
}

async function deleteWatchedFromShelf(movieId) {
  if (state.actionBusy) return;

  const movie = state.movies.find((item) => item.tmdbId === movieId);

  if (!movie) return;

  if (!window.confirm('Tem certeza que deseja remover este item?')) return;

  state.actionBusy = true;

  try {
    await api(`/api/movies/${movieId}/watch`, { method: 'DELETE' });
    state.movies = state.movies.filter((item) => item.tmdbId !== movieId);

    if (state.activeMovie?.tmdbId === movieId) closeModal();

    renderShelf();
    renderTabs();
    toast('Filme removido dos assistidos.');
    await syncDiaryState();
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.actionBusy = false;
  }
}

async function removeRecommendationFromShelf(movieId) {
  if (state.actionBusy) return;

  const existing = state.watchlist.find((item) => item.tmdbId === movieId);

  if (!existing) return;

  if (!window.confirm('Tem certeza que deseja remover este item?')) return;

  state.actionBusy = true;

  try {
    await api(`/api/recommendations/${movieId}`, { method: 'DELETE' });
    state.watchlist = state.watchlist.filter((item) => item.tmdbId !== movieId);
    renderWatchlist();
    renderTabs();
    toast('Indicação removida.');
    await syncDiaryState();
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.actionBusy = false;
    if (state.activeMovie) updateModalActions();
  }
}

async function removeFavoriteFromShelf(movieId) {
  if (state.actionBusy) return;

  state.actionBusy = true;

  try {
    await api(`/api/profile/favorites/${movieId}`, { method: 'DELETE' });
    state.favorites = state.favorites.filter((item) => item.tmdbId !== movieId);
    renderProfile();
    renderTabs();
    toast('Filme removido dos favoritos.');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.actionBusy = false;
    if (state.activeMovie) updateModalActions();
  }
}

function focusSearch() {
  els.searchInput.focus();
  els.searchInput.select();

  if (window.matchMedia('(max-width: 1023px)').matches) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Não foi possível ler essa imagem.'));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function buildAvatarBlob(file) {
  if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) {
    throw new Error('Envie uma imagem PNG, JPG, WEBP ou GIF.');
  }

  if (file.size > 12 * 1024 * 1024) {
    throw new Error('Escolha uma imagem de até 12 MB.');
  }

  const image = await loadImageFromFile(file);
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext('2d');
  const scale = Math.max(size / image.width, size / image.height);
  const width = image.width * scale;
  const height = image.height * scale;

  context.imageSmoothingQuality = 'high';
  context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);

  return (
    (await canvasToBlob(canvas, 'image/webp', 0.86)) ||
    (await canvasToBlob(canvas, 'image/jpeg', 0.88))
  );
}

function updateAvatarControls() {
  const label = els.profileAvatarButton?.querySelector('[data-avatar-label]');

  if (label) {
    label.textContent = state.avatarBusy ? 'Enviando…' : 'Trocar foto';
  }

  if (els.profileAvatarButton) els.profileAvatarButton.disabled = state.avatarBusy;
  if (els.profileAvatarRemove) els.profileAvatarRemove.disabled = state.avatarBusy;
}

async function uploadAvatar(file) {
  if (!file || state.avatarBusy) return;

  state.avatarBusy = true;
  updateAvatarControls();

  try {
    const blob = await buildAvatarBlob(file);

    if (!blob) {
      throw new Error('Não foi possível processar essa imagem.');
    }

    const formData = new FormData();
    formData.append('avatar', blob, `avatar.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`);

    const data = await api('/api/profile/avatar', { method: 'POST', body: formData });

    if (!data?.user) {
      console.error('[logtwo] Upload de avatar sem usuário na resposta.', data);
      throw new Error('O servidor não confirmou a foto.');
    }

    applyProfileUser(data.user);
    toast('Foto de perfil atualizada.');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.avatarBusy = false;
    updateAvatarControls();
    els.profileAvatarInput.value = '';
  }
}

async function removeAvatar() {
  if (state.avatarBusy) return;

  state.avatarBusy = true;
  updateAvatarControls();

  try {
    const data = await api('/api/profile/avatar', { method: 'DELETE' });

    if (!data?.user) {
      console.error('[logtwo] Remoção de avatar sem usuário na resposta.', data);
      throw new Error('O servidor não confirmou a remoção.');
    }

    applyProfileUser(data.user);
    toast('Foto de perfil removida.');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.avatarBusy = false;
    updateAvatarControls();
  }
}

async function saveProfileName(event) {
  event.preventDefault();

  const name = els.profileNameInput.value.trim().replace(/\s+/g, ' ');

  if (name.length < 2 || name.length > 60) {
    toast('Informe um nome entre 2 e 60 caracteres.', 'error');
    els.profileNameInput.focus();
    return;
  }

  const submit = els.profileNameForm.querySelector('button[type="submit"]');
  const originalLabel = submit.textContent;

  submit.disabled = true;
  submit.textContent = 'Salvando…';

  try {
    const data = await api('/api/profile', { method: 'PATCH', body: { name } });

    if (!data?.user) {
      console.error('[logtwo] Perfil sem usuário na resposta.', data);
      throw new Error('O servidor não confirmou o novo nome.');
    }

    applyProfileUser(data.user);
    toast('Nome atualizado.');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    submit.disabled = false;
    submit.textContent = originalLabel;
  }
}

function openMovie(movieId, trigger = document.activeElement) {
  state.modalTrigger = trigger;
  state.activeMovie = null;
  state.draftRating = 0;
  state.isSaving = false;

  els.modal.classList.remove('hidden');
  document.body.classList.add('modal-open');
  renderModalLoading();

  const closeButton = els.modal.querySelector('[data-close-modal-button]');
  closeButton?.focus();

  state.modalAbort?.abort();
  const controller = new AbortController();
  state.modalAbort = controller;

  api(`/api/movies/${movieId}`, { signal: controller.signal })
    .then((data) => {
      if (controller.signal.aborted) return;

      if (!data?.movie || !Array.isArray(data.movie.reviews)) {
        console.error('[logtwo] Ficha do filme inválida.', data);
        renderModalError('O servidor devolveu uma ficha inválida. Tente novamente.');
        return;
      }

      state.activeMovie = data.movie;
      const ownReview = data.movie.reviews.find((review) => review.userId === state.me.id);
      state.draftRating = ownReview?.rating || 0;
      renderModal();
    })
    .catch((error) => {
      if (error.name === 'AbortError') return;

      console.error('[logtwo] Falha ao abrir a ficha do filme', error);
      renderModalError(error.message);
    })
    .finally(() => {
      if (state.modalAbort === controller) state.modalAbort = null;
    });
}

function closeModal() {
  state.modalAbort?.abort();
  state.modalAbort = null;
  state.activeMovie = null;
  state.isSaving = false;

  els.modal.classList.add('hidden');
  document.body.classList.remove('modal-open');

  const trigger = state.modalTrigger;
  state.modalTrigger = null;

  if (trigger?.isConnected) {
    trigger.focus();
  }
}

els.modal.addEventListener('click', (event) => {
  if (event.target.closest('[data-close-modal], [data-close-modal-button]')) {
    closeModal();
    return;
  }

  if (event.target.closest('[data-action-recommend]')) {
    toggleRecommendation();
    return;
  }

  if (event.target.closest('[data-action-favorite]')) {
    toggleFavorite();
    return;
  }

  const star = event.target.closest('#rating-stars [data-rating]');

  if (star) {
    state.draftRating = Number(star.dataset.rating);
    paintStars(state.draftRating);
    updateSaveButton();
    return;
  }

  const saveButton = event.target.closest('[data-save-review]');

  if (saveButton) {
    saveReview();
  }
});

els.modal.addEventListener('input', (event) => {
  if (event.target.id !== 'review-comment') return;

  const counter = els.modal.querySelector('#comment-count');
  if (counter) counter.textContent = `${event.target.value.length}/500`;
});

els.modal.addEventListener('mouseover', (event) => {
  const star = event.target.closest('#rating-stars [data-rating]');

  if (star) {
    paintStars(state.draftRating, Number(star.dataset.rating));
  }
});

els.modal.addEventListener('mouseout', (event) => {
  const stars = event.target.closest('#rating-stars');

  if (stars && !stars.contains(event.relatedTarget)) {
    paintStars(state.draftRating);
  }
});

els.modal.addEventListener('keydown', (event) => {
  if (event.key !== 'Tab') return;

  const focusable = [...els.modal.querySelectorAll('button:not([disabled]), textarea, input, a[href]')].filter(
    (element) => element.offsetParent !== null,
  );

  if (focusable.length === 0) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;

  if (!els.modal.classList.contains('hidden')) {
    closeModal();
    return;
  }

  if (!els.searchPanel.classList.contains('hidden')) {
    hideSearchPanel();
    els.searchInput.focus();
  }
});

for (const button of document.querySelectorAll('[data-logout]')) {
  button.addEventListener('click', () => logout());
}

async function boot() {
  try {
    const data = await api('/api/auth/me');

    if (!data?.user) {
      console.error('[logtwo] Sessão sem usuário no dashboard.', data);
      window.location.replace('/index.html');
      return;
    }

    if (!data.diary || data.diary.status !== 'active') {
      window.location.replace('/connect.html');
      return;
    }

    state.me = data.user;
    state.activeTab = tabFromLocation();
    await loadDashboard();
    renderAll();
    setActiveTab(state.activeTab, { animate: false });

    if (window.location.hash !== TAB_HASH[state.activeTab]) {
      window.history.replaceState({ tab: state.activeTab }, '', TAB_HASH[state.activeTab]);
    }

    hideBootScreen();
  } catch (error) {
    if (error?.status === 409) {
      window.location.replace('/connect.html');
      return;
    }

    if (error?.status === 401) return;

    console.error('[logtwo] Falha ao abrir a estante', error);
    showBootError(error.message || 'Não foi possível abrir a estante.');
  }
}

// A navegação é ligada antes de qualquer chamada de API: as abas funcionam
// mesmo se o carregamento dos dados falhar.
setActiveTab('watched', { animate: false });
boot();
