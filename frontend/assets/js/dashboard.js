import { api, logout } from './api.js';
import {
  daysUntil,
  debounce,
  escapeHtml,
  firstName,
  formatDuration,
  formatHoursShort,
  formatRelativeTime,
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
  profileUserId: null,
  profileUser: null,
  profileFavorites: [],
  partnerProfiles: {},
  profileLoading: false,
  audio: null,
  audioProfileId: null,
  songResults: [],
  songSearchAbort: null,
  songSaving: false,
  rouletteTimer: null,
  rouletteMovies: [],
  rouletteWinner: null,
  searchResults: [],
  searchAbort: null,
  modalAbort: null,
  activeMovie: null,
  draftRating: 0,
  modalTrigger: null,
  isSaving: false,
  actionBusy: false,
  avatarBusy: false,
  timeline: [],
  upcoming: [],
  upcomingLoaded: false,
  notifications: 'unknown',
  pushPublicKey: '',
  pushBusy: false,
  pushTesting: false,
  interestBusy: null,
  trackAudio: null,
  trackPlayingId: null,
  soundtrackResults: [],
  soundtrackAbort: null,
  soundtrackSaving: false,
};

const MAX_FAVORITES = 4;
const SPIN_CLASS = 'animate-[spin_4s_linear_infinite]';
const ROULETTE_TICK_MS = 100;
const ROULETTE_DURATION_MS = 3000;
const ITUNES_SEARCH_URL = 'https://itunes.apple.com/search';
const ITUNES_LIMIT = 5;
const TAB_HASH = {
  watched: '#assistidos',
  watchlist: '#indicacoes',
  upcoming: '#embreve',
  timeline: '#timeline',
  profile: '#perfil',
};
const HASH_TAB = Object.fromEntries(
  Object.entries(TAB_HASH).map(([tab, hash]) => [hash, tab]),
);
const TAB_BY_ID = {
  'tab-watched': 'watched',
  'tab-watchlist': 'watchlist',
  'tab-upcoming': 'upcoming',
  'tab-timeline': 'timeline',
  'tab-profile': 'profile',
};
const PANEL_BY_ID = {
  'panel-watched': 'watched',
  'panel-watchlist': 'watchlist',
  'panel-upcoming': 'upcoming',
  'panel-timeline': 'timeline',
  'panel-profile': 'profile',
};

function normalizeNavigationMarkup() {
  const buttons = document.querySelectorAll(
    '#tab-watched, #tab-watchlist, #tab-upcoming, #tab-timeline, #tab-profile, [data-tab]',
  );

  for (const button of buttons) {
    if (!button.dataset.tab && TAB_BY_ID[button.id]) {
      button.dataset.tab = TAB_BY_ID[button.id];
    }
  }

  const panels = document.querySelectorAll(
    '#panel-watched, #panel-watchlist, #panel-upcoming, #panel-timeline, #panel-profile, [data-panel]',
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
  upcomingGrid: document.querySelector('#upcoming-grid'),
  upcomingCount: document.querySelector('#upcoming-count'),
  upcomingEmpty: document.querySelector('#upcoming-empty'),
  upcomingEmptyText: document.querySelector('#upcoming-empty-text'),
  timelineList: document.querySelector('#timeline-list'),
  timelineCount: document.querySelector('#timeline-count'),
  timelineEmpty: document.querySelector('#timeline-empty'),
  notificationsCard: document.querySelector('#notifications-card'),
  notificationsButton: document.querySelector('#notifications-button'),
  notificationsTest: document.querySelector('#notifications-test'),
  notificationsStatus: document.querySelector('#notifications-status'),
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
  profileLoading: document.querySelector('#profile-loading'),
  profileBody: document.querySelector('#profile-body'),
  profileEyebrow: document.querySelector('#profile-eyebrow'),
  profileRole: document.querySelector('#profile-role'),
  profileViewSelf: document.querySelector('#profile-view-self'),
  profileEdit: document.querySelector('#profile-edit'),
  profileMusicDisc: document.querySelector('#profile-music-disc'),
  profileMusicCover: document.querySelector('#profile-music-cover'),
  profileMusicLabel: document.querySelector('#profile-music-label'),
  profileMusicStatus: document.querySelector('#profile-music-status'),
  songSearchForm: document.querySelector('#profile-song-search-form'),
  songSearchInput: document.querySelector('#song-search'),
  songSearchSubmit: document.querySelector('#song-search-submit'),
  songSearchResults: document.querySelector('#search-results'),
  profileFavoritesTitle: document.querySelector('#profile-favorites-title'),
  profileFavoritesHint: document.querySelector('#profile-favorites-hint'),
  rouletteButton: document.querySelector('#watchlist-roulette-btn'),
  rouletteModal: document.querySelector('#roulette-modal'),
  roulettePoster: document.querySelector('#roulette-poster'),
  rouletteMovieTitle: document.querySelector('#roulette-movie-title'),
  rouletteMovieMeta: document.querySelector('#roulette-movie-meta'),
  rouletteStatus: document.querySelector('#roulette-status'),
  rouletteFooter: document.querySelector('#roulette-footer'),
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

const INTEREST_ICON = `
  <svg class="h-2.5 w-2.5 shrink-0 sm:h-3 sm:w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
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

const MUSIC_ICON = `
  <svg class="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
    <path d="M9 18V5l10-2v13"></path>
    <circle cx="6.5" cy="18" r="2.5"></circle>
    <circle cx="16.5" cy="16" r="2.5"></circle>
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

function playIcons(size = 'h-3 w-3') {
  return `
    <svg class="song-icon-play ${size}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z"></path>
    </svg>
    <svg class="song-icon-pause hidden ${size}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7 5h4v14H7zM13 5h4v14h-4z"></path>
    </svg>`;
}

function providersMarkup(providers) {
  const list = Array.isArray(providers) ? providers.filter((item) => item?.logoUrl) : [];

  if (list.length === 0) {
    return `<p class="mt-4 text-[10px] leading-relaxed text-zinc-500" title="Indisponível em streaming BR">Indisponível em streaming BR</p>`;
  }

  return `
    <div class="mt-4 flex flex-wrap items-center gap-2.5">
      <p class="shrink-0 text-[10px] font-semibold tracking-[0.03em] text-zinc-300">Disponível em:</p>
      <div class="flex flex-wrap items-center gap-2">
        ${list
          .slice(0, 8)
          .map(
            (provider) => `<img
              src="${escapeHtml(provider.logoUrl)}"
              alt="${escapeHtml(provider.name)}"
              title="${escapeHtml(provider.name)}"
              loading="lazy"
              decoding="async"
              class="h-8 w-8 rounded-md object-contain"
            />`,
          )
          .join('')}
      </div>
    </div>`;
}

function songPlayButton(movie, className = '') {
  if (!movie?.songAudioUrl) return '';

  return `
    <button
      type="button"
      data-song-play="${movie.tmdbId}"
      aria-pressed="false"
      aria-label="Tocar trilha sonora"
      title="Tocar trilha sonora"
      class="song-play-btn flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-light/20 bg-base/80 text-zinc-100 backdrop-blur transition hover:border-accent/50 hover:text-accent ${className}"
    >
      ${playIcons('h-3 w-3')}
    </button>`;
}

function findPlayableSong(movieId) {
  const movie =
    state.movies.find((item) => item.tmdbId === movieId) ||
    state.watchlist.find((item) => item.tmdbId === movieId) ||
    state.upcoming.find((item) => item.tmdbId === movieId) ||
    (state.activeMovie?.tmdbId === movieId ? state.activeMovie : null);
  const event = state.timeline.find((item) => Number(item.movieId) === movieId);

  return {
    audioUrl: movie?.songAudioUrl || event?.songAudioUrl || null,
    title: movie?.songTitle || event?.songTitle || 'Trilha sonora',
  };
}

function updateTrackButtons() {
  const playingId = state.trackPlayingId;
  const paused = !state.trackAudio || state.trackAudio.paused;
  const isPlaying = Boolean(playingId) && !paused;

  for (const button of document.querySelectorAll('[data-song-play]')) {
    const current = Number(button.dataset.songPlay) === playingId && isPlaying;
    button.setAttribute('aria-pressed', String(current));
    button.setAttribute('aria-label', current ? 'Pausar trilha sonora' : 'Tocar trilha sonora');
    button.title = current ? 'Pausar trilha sonora' : 'Tocar trilha sonora';
    button.classList.toggle('is-playing', current);
    button.querySelector('.song-icon-play')?.classList.toggle('hidden', current);
    button.querySelector('.song-icon-pause')?.classList.toggle('hidden', !current);
  }
}

function stopTrack() {
  if (state.trackAudio) {
    state.trackAudio.pause();
    state.trackAudio.currentTime = 0;
  }

  state.trackAudio = null;
  state.trackPlayingId = null;
  updateTrackButtons();
}

function toggleTrack(movieId) {
  const song = findPlayableSong(movieId);

  if (!song.audioUrl) return;

  if (state.trackAudio && state.trackPlayingId === movieId) {
    if (state.trackAudio.paused) {
      state.trackAudio.play().catch(() => toast('Não foi possível tocar a prévia.', 'error'));
    } else {
      state.trackAudio.pause();
    }

    updateTrackButtons();
    return;
  }

  stopTrack();

  const audio = new Audio(song.audioUrl);
  audio.volume = 0.7;

  audio.addEventListener('ended', () => {
    state.trackAudio = null;
    state.trackPlayingId = null;
    updateTrackButtons();
  });
  audio.addEventListener('pause', updateTrackButtons);
  audio.addEventListener('play', updateTrackButtons);

  state.trackAudio = audio;
  state.trackPlayingId = movieId;

  audio.play().catch(() => {
    toast('Não foi possível tocar a prévia da trilha.', 'error');
    stopTrack();
  });

  updateTrackButtons();
}

const formatAverage = (value) =>
  value === null || value === undefined ? '—' : Number(value).toFixed(1).replace('.', ',');

const formatShortDate = (isoDate) => {
  if (!isoDate) return '';
  // Datas do TMDB são só dia (YYYY-MM-DD): interpreta no fuso local para não voltar um dia.
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(isoDate) ? `${isoDate}T00:00:00` : isoDate);
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
        <button
          type="button"
          data-profile-user="${member.id}"
          title="Ver perfil de ${escapeHtml(member.name)}"
          aria-label="Ver perfil de ${escapeHtml(member.name)}"
          class="shrink-0 rounded-full transition hover:-translate-y-0.5 hover:opacity-90"
        >
          ${avatarMarkup(member, { tone: memberTone(index) })}
        </button>`,
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
          <button
            type="button"
            data-profile-user="${member.id}"
            aria-label="Ver perfil de ${escapeHtml(member.name)}"
            class="shrink-0 rounded-full transition hover:opacity-80"
          >
            ${avatarMarkup(member, {
              size: 'h-6 w-6',
              textSize: 'text-[8px]',
              tone: memberTone(index),
              border: '',
            })}
          </button>
          <span class="min-w-0 flex-1 truncate text-[11px] text-zinc-400">${escapeHtml(memberLabel(member))}</span>
          <span class="flex items-center gap-1 text-accent">
            ${starSvg('h-2.5 w-2.5')}
            <span class="text-[11px] font-semibold">${rating}</span>
          </span>
        </div>`;
    })
    .join('');

  if (state.me) {
    els.sidebarUserAvatar.innerHTML = `
      <button
        type="button"
        data-profile-user="${state.me.id}"
        title="Ver meu perfil"
        aria-label="Ver meu perfil"
        class="block rounded-full transition hover:opacity-90"
      >
        ${avatarMarkup(state.me, {
          size: 'h-9 w-9',
          tone: 'bg-accent/15 text-accent',
          border: 'border border-panel/25',
        })}
      </button>`;
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

function passportStampDate(movie) {
  const timestamps = (movie.reviews || [])
    .map((review) => Date.parse(review.createdAt))
    .filter((time) => Number.isFinite(time));

  if (timestamps.length === 0) return null;

  const markedAt = new Date(Math.min(...timestamps));
  const day = String(markedAt.getDate()).padStart(2, '0');
  const month = new Intl.DateTimeFormat('pt-BR', { month: 'short' })
    .format(markedAt)
    .replace('.', '')
    .toUpperCase();
  const year = String(markedAt.getFullYear()).slice(-2);

  return `${day} ${month} ${year}`;
}

function passportStampMarkup(movie) {
  const date = passportStampDate(movie);
  if (!date) return '';

  return `
    <div class="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-2">
      <span
        class="animate-stamp -rotate-12 whitespace-nowrap rounded-md border-[3px] border-zinc-200/80 px-2.5 py-1.5 text-center text-[10px] font-black uppercase leading-none tracking-widest text-zinc-200/90 mix-blend-overlay sm:px-3 sm:text-[11px]"
      >
        ${date}
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
        <div class="relative aspect-[2/3] overflow-hidden rounded-xl border border-panel/25 bg-panel/10 sm:rounded-2xl">
          ${posterMarkup(movie)}
          <div class="pointer-events-none absolute inset-0 bg-gradient-to-t from-base/75 via-transparent to-transparent"></div>
          ${passportStampMarkup(movie)}
          <div class="pointer-events-none absolute inset-x-0 bottom-0 flex translate-y-2 items-center justify-center p-3 opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100">
            <span class="rounded-full border border-light/20 bg-base/70 px-3 py-1 text-[8px] uppercase tracking-[0.2em] text-zinc-100 backdrop-blur">
              ver notas
            </span>
          </div>
        </div>

        <div class="mt-2 px-0.5 sm:mt-3">
          <h3 class="truncate text-[11px] font-semibold leading-snug text-zinc-100 sm:text-[13px]">
            ${escapeHtml(movie.title)}
          </h3>
          <p class="mt-0.5 truncate text-[8px] uppercase tracking-[0.12em] text-zinc-400 sm:mt-1 sm:text-[9px] sm:tracking-[0.14em]">${escapeHtml(meta)}</p>
          <div class="mt-2 grid grid-cols-1 gap-1 sm:mt-2.5 sm:grid-cols-2 sm:gap-1.5">
            ${state.members
              .map((member, memberIndex) =>
                ratingChip(member, reviews.get(member.id), memberIndex),
              )
              .join('')}
          </div>
        </div>
      </button>
      ${songPlayButton(movie, 'absolute left-2 top-2 z-10')}
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
  updateTrackButtons();
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
        <div class="relative aspect-[2/3] overflow-hidden rounded-xl border border-panel/25 bg-panel/10 sm:rounded-2xl">
          ${posterMarkup(movie)}
          <div class="pointer-events-none absolute inset-0 bg-gradient-to-t from-base/75 via-transparent to-transparent"></div>
          <span class="absolute left-2 top-2 rounded-full border border-accent/25 bg-base/70 px-1.5 py-0.5 text-[7px] uppercase tracking-[0.14em] text-accent backdrop-blur sm:left-2.5 sm:top-2.5 sm:px-2 sm:text-[8px]">
            na fila
          </span>
          <div class="pointer-events-none absolute inset-x-0 bottom-0 flex translate-y-2 items-center justify-center p-3 opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100">
            <span class="rounded-full border border-light/20 bg-base/70 px-3 py-1 text-[8px] uppercase tracking-[0.2em] text-zinc-100 backdrop-blur">
              abrir ficha
            </span>
          </div>
        </div>

        <div class="mt-2 px-0.5 sm:mt-3">
          <h3 class="truncate text-[11px] font-semibold leading-snug text-zinc-100 sm:text-[13px]">
            ${escapeHtml(movie.title)}
          </h3>
          <p class="mt-0.5 truncate text-[8px] uppercase tracking-[0.12em] text-zinc-400 sm:mt-1 sm:text-[9px] sm:tracking-[0.14em]">${escapeHtml(meta)}</p>
        </div>
      </button>

      ${cardDeleteButton('data-remove-recommendation', movie, 'das indicações')}

      <p class="mt-2 min-w-0 truncate px-0.5 text-[8px] uppercase tracking-[0.1em] text-zinc-400 sm:mt-2.5 sm:text-[9px] sm:tracking-[0.12em]" title="Indicado por ${escapeHtml(recommender)}">
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

  if (els.rouletteButton) {
    const canSpin = count >= 2;
    els.rouletteButton.disabled = !canSpin;
    els.rouletteButton.title = canSpin
      ? 'Sortear um filme da lista'
      : 'Adicione pelo menos 2 indicações para sortear';
  }

  els.watchlistGrid.classList.toggle('hidden', count === 0);
  els.watchlistEmpty.classList.toggle('hidden', count > 0);

  if (count === 0) {
    els.watchlistGrid.innerHTML = '';
    return;
  }

  els.watchlistGrid.innerHTML = state.watchlist.map(renderWatchlistCard).join('');
  updateTrackButtons();
}

function upcomingCountdown(movie) {
  const days = daysUntil(movie.releaseDate);

  if (days === null) return null;
  if (days < 0) return 'já estreou';
  if (days === 0) return 'estreia';
  if (days === 1) return 'estreia amanhã';
  return `faltam ${days} dias`;
}

function renderUpcomingCard(movie, index) {
  const delay = Math.min(index * 45, 360);
  const countdown = upcomingCountdown(movie);
  const meta = [countdown, movie.year].filter(Boolean).join(' · ');
  const date = formatShortDate(movie.releaseDate);
  const interested = Boolean(movie.interested);
  const busy = state.interestBusy === movie.tmdbId;

  return `
    <article class="card-enter group relative" style="animation-delay:${delay}ms">
      <button
        type="button"
        data-movie-id="${movie.tmdbId}"
        class="group block w-full text-left"
        aria-label="Abrir ${escapeHtml(movie.title)}"
      >
        <div class="relative aspect-[2/3] overflow-hidden rounded-xl border border-panel/25 bg-panel/10 sm:rounded-2xl">
          ${posterMarkup(movie)}
          <div class="pointer-events-none absolute inset-0 bg-gradient-to-t from-base/75 via-transparent to-transparent"></div>
          ${
            date
              ? `<span class="absolute left-2 top-2 rounded-full border border-accent/25 bg-base/70 px-1.5 py-0.5 text-[7px] uppercase tracking-[0.1em] text-accent backdrop-blur sm:left-2.5 sm:top-2.5 sm:px-2 sm:text-[8px]">${escapeHtml(date)}</span>`
              : ''
          }
        </div>

        <div class="mt-2 px-0.5 sm:mt-3">
          <h3 class="truncate text-[11px] font-semibold leading-snug text-zinc-100 sm:text-[13px]">
            ${escapeHtml(movie.title)}
          </h3>
          <p class="mt-0.5 truncate text-[8px] uppercase tracking-[0.12em] text-zinc-400 sm:mt-1 sm:text-[9px] sm:tracking-[0.14em]">
            ${escapeHtml(meta || 'data a confirmar')}
          </p>
        </div>
      </button>

      <button
        type="button"
        data-interest-id="${movie.tmdbId}"
        aria-pressed="${interested}"
        title="${interested ? 'Remover da sua lista de interesse' : 'Marcar que você pretende assistir'}"
        ${busy ? 'disabled' : ''}
        class="mt-2 flex w-full items-center justify-center gap-1 rounded-full border px-1.5 py-1.5 text-[7px] font-semibold uppercase tracking-[0.04em] transition disabled:cursor-wait disabled:opacity-60 sm:px-2 sm:text-[9px] sm:tracking-[0.08em] ${
          interested
            ? 'border-accent/50 bg-accent/10 text-accent hover:bg-accent/15'
            : 'border-panel/30 bg-zinc-800/70 text-zinc-100 hover:border-panel/60 hover:bg-zinc-700'
        }"
      >
        ${INTEREST_ICON}
        <span class="truncate">${interested ? 'Na lista ✓' : 'Pretendo assistir'}</span>
      </button>
    </article>`;
}

function renderUpcoming() {
  const count = state.upcoming.length;

  els.upcomingCount.textContent =
    count === 0 ? 'Nenhum lançamento futuro na base' : `${count} ${count === 1 ? 'título chegando' : 'títulos chegando'}`;

  els.upcomingGrid.classList.toggle('hidden', count === 0);
  els.upcomingEmpty.classList.toggle('hidden', count > 0);

  if (els.upcomingEmptyText && count === 0) {
    els.upcomingEmptyText.textContent =
      'Não encontramos estreias futuras agora. Assim que um título com data futura entrar na base, ele aparece aqui.';
  }

  els.upcomingGrid.innerHTML = count === 0 ? '' : state.upcoming.map(renderUpcomingCard).join('');
}

const TIMELINE_COPY = {
  added: { verb: 'adicionou', suffix: 'às indicações' },
  rated: { verb: 'avaliou', suffix: 'na estante' },
  favorited: { verb: 'favoritou', suffix: 'no perfil' },
  interested: { verb: 'marcou interesse em', suffix: '' },
};

function renderTimelineItem(event, index) {
  const copy = TIMELINE_COPY[event.actionType] || { verb: 'registrou', suffix: '' };
  const movieId = Number(event.movieId);
  const hasMovie = Number.isSafeInteger(movieId) && movieId > 0;
  const delay = Math.min(index * 40, 320);

  return `
    <li
      class="card-enter flex items-start gap-3 rounded-2xl border border-panel/25 bg-panel/[0.04] p-4 sm:gap-4 sm:p-5"
      style="animation-delay:${delay}ms"
    >
      ${avatarMarkup(event.user, {
        size: 'h-9 w-9 sm:h-10 sm:w-10',
        textSize: 'text-[10px]',
        tone: 'bg-accent/15 text-accent',
        border: 'border border-panel/40',
      })}
      <div class="min-w-0 flex-1">
        <p class="text-sm leading-relaxed text-zinc-300">
          <span class="font-semibold text-zinc-100">${escapeHtml(firstName(event.user?.name) || 'Alguém')}</span>
          ${copy.verb}
          ${
            hasMovie
              ? `<button type="button" data-movie-id="${movieId}" class="font-medium text-accent underline-offset-4 transition hover:underline">${escapeHtml(event.mediaTitle)}</button>`
              : `<span class="font-medium text-zinc-100">${escapeHtml(event.mediaTitle)}</span>`
          }
          ${copy.suffix ? `<span class="text-zinc-400"> ${copy.suffix}</span>` : ''}
          ${
            hasMovie && event.songAudioUrl
              ? `<button
                   type="button"
                   data-song-play="${movieId}"
                   aria-pressed="false"
                   aria-label="Tocar trilha de ${escapeHtml(event.mediaTitle)}"
                   title="Tocar trilha sonora${event.songTitle ? `: ${escapeHtml(event.songTitle)}` : ''}"
                   class="song-play-btn ml-1.5 inline-flex h-5 w-5 translate-y-0.5 items-center justify-center rounded-full border border-panel/40 bg-base/60 align-middle text-zinc-300 transition hover:border-accent/50 hover:text-accent"
                 >
                   ${playIcons('h-2.5 w-2.5')}
                 </button>`
              : ''
          }
        </p>
        <p class="mt-1 text-[9px] uppercase tracking-[0.14em] text-zinc-400/60">
          ${escapeHtml(formatRelativeTime(event.createdAt))}
        </p>
      </div>
    </li>`;
}

function renderTimeline() {
  const events = state.timeline;

  els.timelineCount.textContent =
    events.length === 0
      ? 'Nenhum registro recente'
      : `${events.length} ${events.length === 1 ? 'registro recente' : 'registros recentes'}`;

  els.timelineList.classList.toggle('hidden', events.length === 0);
  els.timelineEmpty.classList.toggle('hidden', events.length > 0);
  els.timelineList.innerHTML = events.map(renderTimelineItem).join('');
  updateTrackButtons();
}

async function refreshTimeline() {
  try {
    const data = await api('/api/timeline');
    if (Array.isArray(data?.events)) {
      state.timeline = data.events;
      renderTimeline();
    }
  } catch (error) {
    console.warn('[logtwo] Não foi possível atualizar a timeline.', error);
  }
}

function roulettePosterMarkup(movie) {
  if (movie.posterUrl) {
    return `<img src="${escapeHtml(movie.posterUrl)}" alt="" class="h-full w-full object-cover" />`;
  }

  return `
    <div class="poster-sheen flex h-full w-full flex-col items-center justify-center gap-3 p-4 text-center">
      <span class="text-accent/50">${FILM_ICON}</span>
      <span class="line-clamp-4 font-display text-lg leading-tight text-zinc-100/75">
        ${escapeHtml(movie.title)}
      </span>
    </div>`;
}

function setRouletteFrame(movie, { final = false } = {}) {
  if (!movie) return;

  els.roulettePoster.innerHTML = roulettePosterMarkup(movie);
  els.roulettePoster.classList.toggle('roulette-winner', final);
  els.rouletteMovieTitle.textContent = movie.title || '';
  els.rouletteMovieTitle.title = movie.title || '';

  const runtime = movie.runtime ? formatDuration(movie.runtime) : null;
  els.rouletteMovieMeta.textContent = [movie.year, runtime].filter(Boolean).join(' · ');
}

function finishRoulette() {
  if (state.rouletteTimer !== null) {
    window.clearInterval(state.rouletteTimer);
    state.rouletteTimer = null;
  }

  const movies = state.rouletteMovies;

  if (!movies.length) {
    closeRoulette();
    return;
  }

  const winner = movies[Math.floor(Math.random() * movies.length)];
  state.rouletteWinner = winner;
  setRouletteFrame(winner, { final: true });
  els.rouletteStatus.textContent = 'a escolhida é…';
  els.rouletteFooter.classList.remove('hidden');
  els.rouletteFooter.querySelector('button')?.focus();
}

function startRoulette() {
  if (state.rouletteTimer !== null) {
    window.clearInterval(state.rouletteTimer);
  }

  const startedAt = Date.now();
  let lastIndex = -1;

  state.rouletteTimer = window.setInterval(() => {
    const movies = state.rouletteMovies;

    if (!movies.length) {
      finishRoulette();
      return;
    }

    if (Date.now() - startedAt >= ROULETTE_DURATION_MS) {
      finishRoulette();
      return;
    }

    let index = Math.floor(Math.random() * movies.length);

    if (movies.length > 1 && index === lastIndex) {
      index = (index + 1) % movies.length;
    }

    lastIndex = index;
    setRouletteFrame(movies[index]);
  }, ROULETTE_TICK_MS);
}

function openRoulette() {
  if (state.watchlist.length < 2) {
    toast('Adicione pelo menos 2 indicações para sortear.', 'error');
    return;
  }

  state.rouletteMovies = [...state.watchlist];
  state.rouletteWinner = null;

  setRouletteFrame(state.rouletteMovies[0], { final: false });
  els.roulettePoster.classList.remove('roulette-winner');
  els.rouletteStatus.textContent = 'sorteando…';
  els.rouletteFooter.classList.add('hidden');
  els.rouletteModal.classList.remove('hidden');
  document.body.classList.add('modal-open');

  startRoulette();
}

function closeRoulette() {
  if (state.rouletteTimer !== null) {
    window.clearInterval(state.rouletteTimer);
    state.rouletteTimer = null;
  }

  state.rouletteWinner = null;
  els.rouletteModal.classList.add('hidden');

  if (els.modal.classList.contains('hidden')) {
    document.body.classList.remove('modal-open');
  }
}

function renderFavoriteSlot(movie, { editable = true } = {}) {
  if (!movie) {
    if (!editable) {
      return `
        <div class="flex aspect-[2/3] w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-panel/25 bg-panel/[0.02] px-1.5 text-center sm:gap-3 sm:rounded-2xl sm:px-3">
          <span class="flex h-6 w-6 items-center justify-center rounded-full border border-panel/25 text-zinc-400/40 sm:h-9 sm:w-9">
            ${FILM_ICON}
          </span>
          <span class="text-[7px] uppercase tracking-[0.1em] text-zinc-400/40 sm:text-[9px] sm:tracking-[0.16em]">vaga livre</span>
        </div>`;
    }

    return `
      <button
        type="button"
        data-empty-favorite
        aria-label="Adicionar um filme favorito"
        class="group flex aspect-[2/3] w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-panel/30 bg-panel/[0.03] px-1.5 text-center transition hover:border-accent/40 hover:bg-accent/[0.04] sm:gap-3 sm:rounded-2xl sm:px-3"
      >
        <span class="flex h-6 w-6 items-center justify-center rounded-full border border-panel/35 text-zinc-400 transition group-hover:border-accent/40 group-hover:text-accent sm:h-9 sm:w-9">
          ${PLUS_ICON}
        </span>
        <span class="text-[7px] uppercase tracking-[0.1em] text-zinc-400/70 sm:text-[9px] sm:tracking-[0.16em]">vaga livre</span>
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
        <div class="relative aspect-[2/3] overflow-hidden rounded-xl border border-panel/25 bg-panel/10 sm:rounded-2xl">
          ${posterMarkup(movie)}
          <div class="pointer-events-none absolute inset-0 bg-gradient-to-t from-base/85 via-transparent to-transparent"></div>
          <div class="pointer-events-none absolute inset-x-0 bottom-0 p-2 sm:p-3">
            <p class="line-clamp-2 text-[9px] font-semibold leading-snug text-zinc-100 sm:text-[11px]">
              ${escapeHtml(movie.title)}
            </p>
            ${movie.year ? `<p class="mt-0.5 text-[7px] uppercase tracking-[0.12em] text-zinc-400 sm:mt-1 sm:text-[8px] sm:tracking-[0.14em]">${escapeHtml(movie.year)}</p>` : ''}
          </div>
        </div>
      </button>
      ${
        editable
          ? `<button
               type="button"
               data-remove-favorite="${movie.tmdbId}"
               aria-label="Remover ${escapeHtml(movie.title)} dos favoritos"
               class="absolute right-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-light/15 bg-base/75 text-zinc-300 opacity-100 backdrop-blur transition hover:border-danger/40 hover:text-danger focus-visible:opacity-100 sm:right-2 sm:top-2 sm:h-7 sm:w-7 sm:opacity-0 sm:group-hover:opacity-100"
             >
               <svg class="h-3 w-3 sm:h-3.5 sm:w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                 <path d="M6 6l12 12M18 6 6 18"></path>
               </svg>
             </button>`
          : ''
      }
    </div>`;
}

const NOTIFICATION_COPY = {
  idle: 'Receba um aviso quando sua dupla registrar algo.',
  subscribed: 'Ativo neste dispositivo — avisamos quando sua dupla registrar algo.',
  denied: 'Permissão bloqueada. Libere as notificações nas configurações do site.',
  unavailable: 'As notificações ainda não estão configuradas no servidor.',
  unsupported: 'Este navegador não suporta notificações push.',
};

function renderNotifications() {
  if (!els.notificationsCard) return;

  const hide =
    !viewingSelfProfile() ||
    state.notifications === 'unknown' ||
    state.notifications === 'unsupported' ||
    state.notifications === 'unavailable';

  els.notificationsCard.classList.toggle('hidden', hide);
  els.notificationsCard.classList.toggle('flex', !hide);

  if (hide) return;

  const active = state.notifications === 'subscribed';
  const blocked = state.notifications === 'denied';

  els.notificationsStatus.textContent = NOTIFICATION_COPY[state.notifications] || NOTIFICATION_COPY.idle;
  els.notificationsButton.textContent = state.pushBusy
    ? 'Ativando…'
    : active
      ? 'Ativado'
      : blocked
        ? 'Bloqueado'
        : 'Ativar Notificações';
  els.notificationsButton.disabled = state.pushBusy || active || blocked;

  if (els.notificationsTest) {
    els.notificationsTest.disabled = state.pushBusy || state.pushTesting || !active;
    els.notificationsTest.textContent = state.pushTesting
      ? 'Enviando teste…'
      : 'Testar Notificação Push';
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);

  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

async function setupNotifications() {
  if (
    !('Notification' in window) ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window)
  ) {
    state.notifications = 'unsupported';
    renderNotifications();
    return;
  }

  try {
    const data = await api('/api/notifications/key', { redirectOn401: false });

    if (!data?.enabled || !data?.publicKey) {
      state.notifications = 'unavailable';
      renderNotifications();
      return;
    }

    state.pushPublicKey = data.publicKey;

    if (Notification.permission === 'denied') {
      state.notifications = 'denied';
    } else {
      const registration = await navigator.serviceWorker.getRegistration('/');
      const subscription = registration ? await registration.pushManager.getSubscription() : null;
      state.notifications =
        subscription && Notification.permission === 'granted' ? 'subscribed' : 'idle';
    }
  } catch (error) {
    console.warn('[logtwo] Não foi possível consultar o status das notificações.', error);
    state.notifications = 'unavailable';
  }

  renderNotifications();
}

async function enableNotifications() {
  if (state.pushBusy || !state.pushPublicKey) return;
  if (state.notifications === 'subscribed' || state.notifications === 'denied') return;

  state.pushBusy = true;
  renderNotifications();

  try {
    const permission = await Notification.requestPermission();

    if (permission !== 'granted') {
      state.notifications = permission === 'denied' ? 'denied' : 'idle';
      toast('Permissão de notificação não concedida.', 'error');
      return;
    }

    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(state.pushPublicKey),
      });
    }

    await api('/api/notifications/subscribe', {
      method: 'POST',
      body: { subscription: subscription.toJSON() },
    });

    state.notifications = 'subscribed';
    toast('Notificações ativadas.');
  } catch (error) {
    console.error('[logtwo] Falha ao ativar notificações.', error);
    toast('Não foi possível ativar as notificações.', 'error');
  } finally {
    state.pushBusy = false;
    renderNotifications();
  }
}

async function testNotification() {
  if (state.pushTesting || state.pushBusy) return;

  state.pushTesting = true;
  renderNotifications();

  try {
    const data = await api('/api/notifications/test', { method: 'POST' });

    if (Number(data?.delivered) > 0) {
      toast('Teste enviado! A notificação deve aparecer neste dispositivo.');
    } else {
      toast('A inscrição foi encontrada, mas o envio falhou. Verifique as chaves VAPID.', 'error');
    }
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.pushTesting = false;
    renderNotifications();
  }
}

function profileDisplayUser() {
  if (!state.me) return null;
  if (!state.profileUserId || state.profileUserId === state.me.id) return state.me;
  return state.profileUser;
}

function viewingSelfProfile() {
  return !state.me || !state.profileUserId || state.profileUserId === state.me.id;
}

function songLabel(profile) {
  if (!profile?.profileSongAudioUrl) return 'Sem música ainda';
  return profile.profileSongTitle || 'Música do perfil';
}

function musicCoverMarkup(profile) {
  if (profile?.profileSongCoverUrl) {
    return `<img src="${escapeHtml(profile.profileSongCoverUrl)}" alt="" class="h-full w-full object-cover" loading="lazy" decoding="async" />`;
  }

  return `<span class="flex h-full w-full items-center justify-center bg-gradient-to-br from-panel/30 to-base text-accent/60">${MUSIC_ICON}</span>`;
}

function updateMusicUI() {
  if (!els.profileMusicDisc) return;

  const profile = profileDisplayUser();
  if (!profile) return;

  const isPlaying = Boolean(
    state.audio && state.audioProfileId === profile.id && !state.audio.paused,
  );
  const hasSong = Boolean(profile.profileSongAudioUrl);

  els.profileMusicDisc.classList.toggle(SPIN_CLASS, isPlaying);
  els.profileMusicDisc.setAttribute('aria-pressed', String(isPlaying));
  els.profileMusicDisc.setAttribute(
    'aria-label',
    isPlaying ? 'Pausar música do perfil' : 'Tocar música do perfil',
  );

  if (els.profileMusicLabel) {
    els.profileMusicLabel.textContent = songLabel(profile);
  }

  if (els.profileMusicStatus) {
    els.profileMusicStatus.textContent = isPlaying
      ? 'Tocando agora · toque no disco para pausar'
      : hasSong
        ? 'Toque no disco para ouvir.'
        : viewingSelfProfile()
          ? 'Adicione um link de áudio abaixo para tocar.'
          : 'Nenhuma música escolhida.';
  }
}

function stopSong() {
  if (state.audio) {
    state.audio.pause();
    state.audio = null;
  }

  state.audioProfileId = null;
  updateMusicUI();
}

function toggleProfileSong() {
  const profile = profileDisplayUser();
  if (!profile) return;

  if (!profile.profileSongAudioUrl) {
    toast(
      viewingSelfProfile()
        ? 'Escolha uma música para o seu perfil.'
        : 'Esse perfil ainda não escolheu uma música.',
      'error',
    );
    return;
  }

  const isPlayingThis =
    state.audio && state.audioProfileId === profile.id && !state.audio.paused;

  if (isPlayingThis) {
    stopSong();
    return;
  }

  stopSong();

  const audio = new Audio(profile.profileSongAudioUrl);
  audio.loop = true;
  audio.preload = 'auto';
  audio.volume = 0.9;
  state.audio = audio;
  state.audioProfileId = profile.id;

  audio.addEventListener(
    'error',
    () => {
      if (state.audio !== audio) return;
      toast('Não foi possível carregar essa música.', 'error');
      stopSong();
    },
    { once: true },
  );

  audio.play().then(updateMusicUI).catch(() => {
    if (state.audio !== audio) return;
    toast('O navegador bloqueou o áudio. Toque no disco novamente.', 'error');
    stopSong();
  });

  updateMusicUI();
}

async function openProfileFor(userId) {
  if (!state.me || !Number.isSafeInteger(userId)) return;

  const isSelf = userId === state.me.id;
  const member = state.members.find((item) => item.id === userId) || (isSelf ? state.me : null);

  if (!isSelf && !member) return;

  if (state.audioProfileId !== null && state.audioProfileId !== userId) stopSong();
  if (!els.modal.classList.contains('hidden')) closeModal();

  hideSongResults();
  state.profileUserId = userId;
  setActiveTab('profile', { push: true });

  if (isSelf) {
    state.profileUser = state.me;
    state.profileFavorites = state.favorites;
    state.profileLoading = false;
    renderProfile();
    return;
  }

  const cached = state.partnerProfiles[userId];

  if (cached) {
    state.profileUser = cached.user;
    state.profileFavorites = Array.isArray(cached.favorites) ? cached.favorites : [];
    state.profileLoading = false;
    renderProfile();
    return;
  }

  state.profileUser = member;
  state.profileFavorites = [];
  state.profileLoading = true;
  renderProfile();

  try {
    const data = await api(`/api/profile/${userId}`);

    if (!data?.user) {
      throw new Error('O servidor devolveu um perfil inválido.');
    }

    state.partnerProfiles[userId] = {
      user: data.user,
      favorites: Array.isArray(data.favorites) ? data.favorites : [],
    };

    if (state.profileUserId === userId) {
      state.profileUser = state.partnerProfiles[userId].user;
      state.profileFavorites = state.partnerProfiles[userId].favorites;
    }
  } catch (error) {
    console.error('[logtwo] Não foi possível carregar o perfil da dupla.', error);
    toast(error.message, 'error');

    if (state.profileUserId === userId) {
      state.profileUser = member;
      state.profileFavorites = [];
    }
  } finally {
    if (state.profileUserId === userId) {
      state.profileLoading = false;
      renderProfile();
    }
  }
}

function renderProfile() {
  if (!state.me) return;

  if (els.profileLoading) {
    els.profileLoading.classList.toggle('hidden', !state.profileLoading);
  }

  if (els.profileBody) {
    els.profileBody.classList.toggle('hidden', state.profileLoading);
    els.profileBody.classList.toggle('grid', !state.profileLoading);
  }

  if (state.profileLoading) return;

  const isSelf = viewingSelfProfile();
  const person = profileDisplayUser() || state.me;
  const favorites = isSelf ? state.favorites : state.profileFavorites;
  const displayName = person.name || 'Perfil';
  const first = firstName(displayName);

  els.profileAvatar.innerHTML = avatarMarkup(person, {
    size: 'h-20 w-20 sm:h-28 sm:w-28',
    textSize: 'text-2xl sm:text-3xl',
    tone: 'bg-accent/15 text-accent',
    border: 'border border-panel/40',
  });
  els.profileName.textContent = displayName;
  els.profileEmail.textContent = isSelf ? person.email || '' : 'perfil da dupla';
  els.profileEmail.classList.toggle('hidden', !isSelf);
  els.profileRole.textContent = isSelf ? 'uma das duas poltronas' : 'a outra poltrona';
  els.profileEyebrow.textContent = isSelf ? 'seu perfil' : `perfil de ${first}`;

  if (els.profileViewSelf) {
    els.profileViewSelf.classList.toggle('hidden', isSelf);
    els.profileViewSelf.classList.toggle('inline-flex', !isSelf);
  }

  if (els.profileEdit) {
    els.profileEdit.classList.toggle('hidden', !isSelf);
  }

  if (isSelf) {
    if (document.activeElement !== els.profileNameInput) {
      els.profileNameInput.value = state.me.name;
    }
  }

  const hasAvatar = Boolean(state.me.avatarUrl);
  els.profileAvatarRemove.classList.toggle('hidden', !isSelf || !hasAvatar);
  els.profileAvatarRemove.classList.toggle('inline-flex', isSelf && hasAvatar);

  if (els.profileMusicCover) {
    els.profileMusicCover.innerHTML = musicCoverMarkup(person);
  }
  updateMusicUI();

  if (els.profileFavoritesTitle) {
    els.profileFavoritesTitle.innerHTML = isSelf
      ? 'Quatro filmes para levar<span class="text-accent">.</span>'
      : `Favoritos de ${escapeHtml(first)}<span class="text-accent">.</span>`;
  }

  if (els.profileFavoritesHint) {
    els.profileFavoritesHint.textContent = isSelf
      ? 'Escolha até quatro títulos que definem o seu lado da estante. Você pode trocar quando quiser.'
      : `Os títulos que ${first} escolheu para a estante.`;
  }

  const safeFavorites = Array.isArray(favorites) ? favorites : [];
  els.favoritesCount.textContent = `${safeFavorites.length}/${MAX_FAVORITES}`;
  els.favoritesGrid.innerHTML = Array.from({ length: MAX_FAVORITES }, (_, index) =>
    renderFavoriteSlot(safeFavorites[index], { editable: isSelf }),
  ).join('');

  renderNotifications();
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

  if (next !== 'profile') {
    if (state.audio) stopSong();
    hideSongResults();
  }

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

  const activePanel = document.querySelector(`[data-panel="${next}"]`);

  if (activePanel && animate) {
    // O header é sticky: desconta a altura dele para o painel não ficar coberto.
    const header = document.querySelector('#dashboard-tabs')?.closest('header');
    activePanel.style.scrollMarginTop = `${(header?.offsetHeight ?? 0) + 16}px`;
    activePanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
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
  renderUpcoming();
  renderTimeline();
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
  const [data, recommendationsData, profileData, timelineData, upcomingData] = await Promise.all([
    api('/api/diary'),
    api('/api/recommendations').catch((error) => {
      console.error('[logtwo] Não foi possível carregar as indicações.', error);
      return null;
    }),
    api('/api/profile').catch((error) => {
      console.error('[logtwo] Não foi possível carregar o perfil.', error);
      return null;
    }),
    api('/api/timeline').catch((error) => {
      console.error('[logtwo] Não foi possível carregar a timeline.', error);
      return null;
    }),
    state.upcomingLoaded
      ? Promise.resolve(null)
      : api('/api/movies/upcoming').catch((error) => {
          console.error('[logtwo] Não foi possível carregar os lançamentos.', error);
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

  if (Array.isArray(timelineData?.events)) {
    state.timeline = timelineData.events;
  }

  if (upcomingData) {
    state.upcoming = Array.isArray(upcomingData.movies) ? upcomingData.movies : [];
    state.upcomingLoaded = true;
  }

  if (profileData?.user) {
    state.me = { ...state.me, ...profileData.user };
    syncMember(state.me);
  }

  if (!state.profileUserId && state.me) {
    state.profileUserId = state.me.id;
  }

  if (viewingSelfProfile()) {
    state.profileUser = state.me;
    state.profileFavorites = state.favorites;
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

on(els.upcomingGrid, 'click', (event) => {
  const interest = event.target.closest('[data-interest-id]');

  if (interest) {
    toggleInterest(Number(interest.dataset.interestId));
    return;
  }

  const card = event.target.closest('[data-movie-id]');
  if (card) openMovie(Number(card.dataset.movieId), card);
});

on(els.timelineList, 'click', (event) => {
  const target = event.target.closest('[data-movie-id]');
  if (target) openMovie(Number(target.dataset.movieId), target);
});

on(els.notificationsButton, 'click', enableNotifications);
on(els.notificationsTest, 'click', testNotification);

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
on(els.songSearchForm, 'submit', submitSongSearch);
on(els.songSearchResults, 'click', (event) => {
  const button = event.target.closest('[data-song-result]');
  if (button) selectSongResult(Number(button.dataset.songResult));
});
on(els.profileMusicDisc, 'click', toggleProfileSong);
on(els.profileViewSelf, 'click', () => {
  if (state.me) openProfileFor(state.me.id);
});

on(els.rouletteButton, 'click', openRoulette);
on(els.rouletteModal, 'click', (event) => {
  if (event.target.closest('[data-close-roulette]')) closeRoulette();
});

document.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-profile-user]');
  if (!trigger) return;

  event.preventDefault();
  openProfileFor(Number(trigger.dataset.profileUser));
});

// Captura o clique antes dos cards: o play não deve abrir a ficha do filme.
document.addEventListener(
  'click',
  (event) => {
    const playButton = event.target.closest('[data-song-play]');
    if (!playButton) return;

    event.preventDefault();
    event.stopPropagation();
    toggleTrack(Number(playButton.dataset.songPlay));
  },
  true,
);

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

  // Qualquer filme que você ainda não avaliou pode ser guardado em Em Breve,
  // inclusive títulos cuja data de estreia já passou.
  const ownReview = movie.reviews?.some((review) => review.userId === state.me.id);
  const showInterest = !ownReview;
  const interested = Boolean(movie.interested);
  const interestDisabled = busy || state.interestBusy === movie.tmdbId;

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
      showInterest
        ? `<button
             type="button"
             data-action-interest
             aria-pressed="${interested}"
             title="${interested ? 'Remover da sua lista de interesse' : 'Marcar que você pretende assistir'}"
             ${interestDisabled ? 'disabled' : ''}
             class="${base} ${interested ? selected : neutral}"
           >
             ${BOOKMARK_ICON}
             ${escapeHtml(interested ? 'Na lista ✓' : 'Pretendo assistir')}
           </button>`
        : ''
    }

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

function soundtrackCurrentMarkup(movie) {
  if (!movie.songAudioUrl) {
    return `<p class="mt-2 text-[10px] leading-relaxed text-zinc-400/70">
      Nenhuma faixa escolhida ainda. Busque no iTunes e guarde uma prévia de 30 segundos.
    </p>`;
  }

  return `
    <div class="mt-2 flex items-center gap-2.5 rounded-xl border border-panel/25 bg-base/40 p-2.5">
      ${songPlayButton(movie)}
      <div class="min-w-0 flex-1">
        <p class="truncate text-[11px] font-medium text-zinc-100">${escapeHtml(movie.songTitle || 'Trilha sonora')}</p>
        <p class="mt-0.5 text-[8px] uppercase tracking-[0.14em] text-zinc-400/60">prévia de 30s · iTunes</p>
      </div>
      <button
        type="button"
        data-soundtrack-remove
        class="shrink-0 rounded-full border border-panel/35 px-2 py-1 text-[8px] uppercase tracking-[0.1em] text-zinc-400 transition hover:border-danger/40 hover:text-danger"
      >
        remover
      </button>
    </div>`;
}

function soundtrackSectionMarkup(movie) {
  const suggested = `${movie.title} soundtrack`;

  return `
    <div class="mt-5 border-t border-panel/20 pt-4" data-soundtrack>
      <p class="micro-label">trilha sonora</p>
      <div data-soundtrack-current>${soundtrackCurrentMarkup(movie)}</div>
      <form data-soundtrack-form class="mt-3 flex flex-col gap-2 sm:flex-row" novalidate>
        <input
          type="text"
          data-soundtrack-input
          value="${escapeHtml(movie.songAudioUrl ? '' : suggested)}"
          placeholder="${escapeHtml(suggested)}"
          maxlength="120"
          autocomplete="off"
          class="min-w-0 flex-1 rounded-xl border border-panel/30 bg-base/50 px-3 py-2 text-[12px] text-zinc-100 placeholder:text-zinc-400/40 transition focus:border-accent/60 focus:outline-none"
        />
        <button
          type="submit"
          class="shrink-0 rounded-full border border-accent/40 bg-accent/[0.08] px-3.5 py-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-accent transition hover:border-accent hover:bg-accent/15"
        >
          Buscar
        </button>
      </form>
      <div data-soundtrack-results class="mt-2 hidden overflow-hidden rounded-xl border border-panel/25 bg-base/40"></div>
    </div>`;
}

function renderSoundtrackResults(results) {
  const container = els.modal.querySelector('[data-soundtrack-results]');
  if (!container) return;

  container.classList.remove('hidden');

  if (!results.length) {
    container.innerHTML = `<p class="px-4 py-6 text-center text-[11px] leading-relaxed text-zinc-400">Nenhuma faixa encontrada. Tente outro termo.</p>`;
    return;
  }

  container.innerHTML = results
    .map((track, index) => {
      const title = track.trackName || 'Faixa sem nome';
      const artist = track.artistName || '';
      const thumb = String(track.artworkUrl100 || '').trim();
      const unavailable = !track.previewUrl;

      return `
        <button
          type="button"
          data-soundtrack-result="${index}"
          ${unavailable ? 'disabled' : ''}
          class="flex w-full items-center gap-2.5 border-b border-panel/20 p-2.5 text-left transition last:border-b-0 hover:bg-panel/15 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span class="h-9 w-9 shrink-0 overflow-hidden rounded-md bg-panel/20">
            ${thumb ? `<img src="${escapeHtml(thumb)}" alt="" class="h-full w-full object-cover" loading="lazy" decoding="async" />` : ''}
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-[12px] font-medium text-zinc-100">${escapeHtml(title)}</span>
            <span class="mt-0.5 block truncate text-[9px] text-zinc-400">${escapeHtml(artist)}</span>
          </span>
          <span class="shrink-0 text-accent">${playIcons('h-3 w-3')}</span>
        </button>`;
    })
    .join('');
}

async function searchMovieSoundtrack(term) {
  state.soundtrackAbort?.abort();
  const controller = new AbortController();
  state.soundtrackAbort = controller;

  const container = els.modal.querySelector('[data-soundtrack-results]');
  if (!container) return;

  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="flex items-center justify-center gap-2 px-4 py-5">
      <span class="spinner spinner-light"></span>
      <span class="text-[10px] text-zinc-400">Buscando no iTunes…</span>
    </div>`;

  try {
    const url = `${ITUNES_SEARCH_URL}?term=${encodeURIComponent(term)}&entity=song&limit=${ITUNES_LIMIT}`;
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      throw new Error('O iTunes não respondeu agora. Tente novamente.');
    }

    const data = await response.json();

    if (state.soundtrackAbort !== controller) return;

    state.soundtrackResults = Array.isArray(data?.results) ? data.results : [];
    renderSoundtrackResults(state.soundtrackResults);
  } catch (error) {
    if (error?.name === 'AbortError') return;

    console.error('[logtwo] Falha na busca da trilha', error);

    if (els.modal.querySelector('[data-soundtrack-results]') === container) {
      container.innerHTML = `<p class="px-4 py-6 text-center text-[11px] leading-relaxed text-danger">${escapeHtml(
        error instanceof TypeError ? 'Não foi possível falar com o iTunes.' : error.message,
      )}</p>`;
    }
  } finally {
    if (state.soundtrackAbort === controller) state.soundtrackAbort = null;
  }
}

function submitSoundtrackSearch(event) {
  event.preventDefault();

  const input = els.modal.querySelector('[data-soundtrack-input]');
  const term = String(input?.value || '').trim();

  if (term.length < 2) {
    toast('Digite pelo menos 2 caracteres para buscar no iTunes.', 'error');
    input?.focus();
    return;
  }

  searchMovieSoundtrack(term);
}

function refreshSoundtrackSection() {
  const movie = state.activeMovie;
  if (!movie) return;

  const current = els.modal.querySelector('[data-soundtrack-current]');
  if (current) current.innerHTML = soundtrackCurrentMarkup(movie);

  state.soundtrackResults = [];

  const results = els.modal.querySelector('[data-soundtrack-results]');
  if (results) {
    results.classList.add('hidden');
    results.innerHTML = '';
  }

  updateTrackButtons();
}

async function saveSoundtrack(songTitle, songAudioUrl) {
  const movie = state.activeMovie;
  if (!movie || state.soundtrackSaving) return false;

  state.soundtrackSaving = true;

  for (const button of els.modal.querySelectorAll('[data-soundtrack-result]')) {
    button.disabled = true;
  }

  try {
    const data = await api(`/api/movies/${movie.tmdbId}/soundtrack`, {
      method: 'PUT',
      body: { songTitle, songAudioUrl },
    });

    if (!data?.soundtrack) {
      console.error('[logtwo] Trilha salva sem confirmação do servidor.', data);
      throw new Error('O servidor não confirmou a trilha sonora.');
    }

    if (state.trackPlayingId === movie.tmdbId) stopTrack();

    movie.songTitle = data.soundtrack.title;
    movie.songAudioUrl = data.soundtrack.audioUrl;
    refreshSoundtrackSection();
    await syncDiaryState();
    toast(songAudioUrl ? 'Trilha sonora salva.' : 'Trilha sonora removida.');
    return true;
  } catch (error) {
    toast(error.message, 'error');

    if (state.soundtrackResults.length) {
      renderSoundtrackResults(state.soundtrackResults);
    }

    return false;
  } finally {
    state.soundtrackSaving = false;
  }
}

async function selectSoundtrack(index) {
  const track = state.soundtrackResults[index];

  if (!track || state.soundtrackSaving) return;

  const audioUrl = String(track.previewUrl || '').trim();

  if (!audioUrl) {
    toast('Essa faixa não tem prévia de áudio.', 'error');
    return;
  }

  const title = [track.trackName, track.artistName]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' - ');

  await saveSoundtrack(title || 'Trilha sonora', audioUrl);
}

async function clearSoundtrack() {
  if (!state.activeMovie || state.soundtrackSaving) return;
  if (!window.confirm('Remover a trilha sonora deste filme?')) return;

  await saveSoundtrack('', '');
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
          <button
            type="button"
            data-profile-user="${state.me.id}"
            aria-label="Ver perfil de ${escapeHtml(state.me.name)}"
            class="shrink-0 rounded-full transition hover:opacity-80"
          >
            ${avatarMarkup(state.me, {
              size: 'h-8 w-8',
              textSize: 'text-[9px]',
              tone: memberTone(ownMemberIndex),
              border: 'border border-accent/25',
            })}
          </button>
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

      ${soundtrackSectionMarkup(movie)}
    </section>`;

  const partnerPanel = `
    <section class="rounded-2xl border border-panel/25 bg-panel/[0.06] p-5">
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-2.5">
          ${
            partner
              ? `<button
                   type="button"
                   data-profile-user="${partner.id}"
                   aria-label="Ver perfil de ${escapeHtml(partner.name)}"
                   class="shrink-0 rounded-full transition hover:opacity-80"
                 >
                   ${avatarMarkup(partner, {
                     size: 'h-8 w-8',
                     textSize: 'text-[9px]',
                     tone: memberTone(partnerIndex),
                     border: 'border border-panel/25',
                   })}
                 </button>`
              : avatarMarkup({ name: '?' }, {
                  size: 'h-8 w-8',
                  textSize: 'text-[9px]',
                  tone: memberTone(partnerIndex),
                  border: 'border border-panel/25',
                })
          }
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

      ${providersMarkup(movie.providers)}

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
    await refreshTimeline();
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

function hideSongResults() {
  state.songSearchAbort?.abort();
  state.songSearchAbort = null;
  state.songResults = [];

  if (!els.songSearchResults) return;

  els.songSearchResults.classList.add('hidden');
  els.songSearchResults.innerHTML = '';
  els.songSearchSubmit.disabled = false;
}

function showSongSearchMessage(message) {
  els.songSearchResults.innerHTML = `
    <p class="px-5 py-8 text-center text-[11px] leading-relaxed text-zinc-400">${escapeHtml(message)}</p>`;
  els.songSearchResults.classList.remove('hidden');
}

function renderSongResults(results) {
  if (results.length === 0) {
    showSongSearchMessage('Nenhuma música encontrada. Tente outro termo.');
    return;
  }

  els.songSearchResults.innerHTML = results
    .map((track, index) => {
      const title = track.trackName || 'Faixa sem nome';
      const artist = track.artistName || '';
      const thumb = String(track.artworkUrl100 || '').trim();
      const unavailable = !track.previewUrl;

      return `
        <button
          type="button"
          data-song-result="${index}"
          ${unavailable ? 'disabled' : ''}
          class="flex w-full items-center gap-3 border-b border-panel/20 p-3 text-left transition last:border-b-0 hover:bg-panel/15 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span class="h-11 w-11 shrink-0 overflow-hidden rounded-md bg-panel/20">
            ${thumb ? `<img src="${escapeHtml(thumb)}" alt="" class="h-full w-full object-cover" loading="lazy" decoding="async" />` : ''}
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-[13px] font-medium text-zinc-100">${escapeHtml(title)}</span>
            <span class="mt-0.5 block truncate text-[10px] text-zinc-400">${escapeHtml(artist)}</span>
          </span>
          <svg class="h-3.5 w-3.5 shrink-0 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <path d="M8 5v14l11-7z"></path>
          </svg>
        </button>`;
    })
    .join('');

  els.songSearchResults.classList.remove('hidden');
}

async function searchSongs(term) {
  state.songSearchAbort?.abort();
  const controller = new AbortController();
  state.songSearchAbort = controller;

  els.songSearchSubmit.disabled = true;
  els.songSearchResults.innerHTML = `
    <div class="flex items-center justify-center gap-3 px-5 py-8">
      <span class="spinner spinner-light"></span>
      <span class="text-[11px] text-zinc-400">Buscando no iTunes…</span>
    </div>`;
  els.songSearchResults.classList.remove('hidden');

  try {
    const url = `${ITUNES_SEARCH_URL}?term=${encodeURIComponent(term)}&entity=song&limit=${ITUNES_LIMIT}`;
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      throw new Error('O iTunes não respondeu agora. Tente novamente.');
    }

    const data = await response.json();

    if (state.songSearchAbort !== controller) return;

    state.songResults = Array.isArray(data?.results) ? data.results : [];
    renderSongResults(state.songResults);
  } catch (error) {
    if (error?.name === 'AbortError') return;

    console.error('[logtwo] Falha na busca do iTunes', error);
    showSongSearchMessage(
      error instanceof TypeError
        ? 'Não foi possível falar com o iTunes. Tente novamente.'
        : error.message || 'Não foi possível buscar agora.',
    );
  } finally {
    if (state.songSearchAbort === controller) {
      state.songSearchAbort = null;
      els.songSearchSubmit.disabled = false;
    }
  }
}

function submitSongSearch(event) {
  event.preventDefault();

  const term = els.songSearchInput.value.trim();

  if (term.length < 2) {
    toast('Digite pelo menos 2 caracteres para buscar.', 'error');
    els.songSearchInput.focus();
    return;
  }

  searchSongs(term);
}

async function selectSongResult(index) {
  const track = state.songResults[index];

  if (!track || state.songSaving) return;

  const audioUrl = String(track.previewUrl || '').trim();

  if (!audioUrl) {
    toast('Essa faixa não tem prévia de áudio.', 'error');
    return;
  }

  const coverUrl = String(track.artworkUrl100 || '')
    .replace('100x100bb', '600x600bb')
    .trim();

  const trackTitle = [track.trackName, track.artistName]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' - ');

  state.songSaving = true;
  for (const button of els.songSearchResults.querySelectorAll('[data-song-result]')) {
    button.disabled = true;
  }

  try {
    const data = await api('/api/profile', {
      method: 'PUT',
      body: {
        profileSongAudioUrl: audioUrl,
        profileSongCoverUrl: coverUrl,
        profileSongTitle: trackTitle || null,
      },
    });

    if (!data?.user) {
      console.error('[logtwo] Perfil sem usuário na resposta.', data);
      throw new Error('O servidor não confirmou a música do perfil.');
    }

    if (state.audioProfileId === state.me.id) stopSong();

    applyProfileUser(data.user);
    els.songSearchInput.value = '';
    hideSongResults();
    toast('Música do perfil atualizada.');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.songSaving = false;

    for (const button of els.songSearchResults.querySelectorAll('[data-song-result]')) {
      button.disabled = false;
    }
  }
}

async function toggleInterest(movieId) {
  if (!movieId || state.actionBusy || state.interestBusy) return;

  const upcomingMovie = state.upcoming.find((movie) => movie.tmdbId === movieId);
  const current = upcomingMovie
    ? Boolean(upcomingMovie.interested)
    : Boolean(state.activeMovie?.interested);

  state.interestBusy = movieId;
  renderUpcoming();
  updateModalActions();

  try {
    const data = await api(`/api/movies/${movieId}/interest`, {
      method: current ? 'DELETE' : 'POST',
    });
    const interested = Boolean(data?.interested);

    for (const movie of state.upcoming) {
      if (movie.tmdbId === movieId) movie.interested = interested;
    }

    if (state.activeMovie?.tmdbId === movieId) {
      state.activeMovie.interested = interested;
    }

    toast(
      interested
        ? 'Marcado como “pretendo assistir”.'
        : 'Interesse removido da sua lista.',
    );
    await refreshTimeline();
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.interestBusy = null;
    renderUpcoming();
    if (state.activeMovie?.tmdbId === movieId) updateModalActions();
  }
}

function openMovie(movieId, trigger = document.activeElement) {
  state.modalTrigger = trigger;
  state.activeMovie = null;
  state.draftRating = 0;
  state.isSaving = false;
  state.soundtrackAbort?.abort();
  state.soundtrackAbort = null;
  state.soundtrackResults = [];
  state.soundtrackSaving = false;

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
  state.soundtrackAbort?.abort();
  state.soundtrackAbort = null;
  state.soundtrackResults = [];
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

  if (event.target.closest('[data-action-interest]')) {
    toggleInterest(state.activeMovie?.tmdbId);
    return;
  }

  if (event.target.closest('[data-soundtrack-remove]')) {
    clearSoundtrack();
    return;
  }

  const soundtrackResult = event.target.closest('[data-soundtrack-result]');

  if (soundtrackResult) {
    selectSoundtrack(Number(soundtrackResult.dataset.soundtrackResult));
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

els.modal.addEventListener('submit', (event) => {
  if (!event.target.matches('[data-soundtrack-form]')) return;
  submitSoundtrackSearch(event);
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

  if (!els.rouletteModal.classList.contains('hidden')) {
    closeRoulette();
    return;
  }

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
    setupNotifications();

    navigator.serviceWorker?.addEventListener('message', (event) => {
      if (event.data?.type === 'notification-click') {
        setActiveTab('timeline', { push: true });
      }
    });
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
