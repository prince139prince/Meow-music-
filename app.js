/**
 * MEOW MUSIC — App Logic
 * State, player, navigation, events
 */

'use strict';

const MeowApp = (() => {

  // ── STATE ──────────────────────────────────────────────────────
  const state = {
    currentTrack:   null,
    currentQueue:   [],
    currentIndex:   -1,
    isPlaying:      false,
    isShuffle:      false,
    repeatMode:     0, // 0=off, 1=all, 2=one
    volume:         0.8,
    progress:       0,
    liked:          [],
    library:        [],
    recentlyPlayed: [],
    prefs: {
      darkMode:     true,
      notifications: false,
      autoPlay:     true,
    },
    userProfile: { name: 'Guest User', email: '' },
  };

  // ── STORAGE KEYS ───────────────────────────────────────────────
  const SK = {
    LIKED:   'meow_liked',
    LIBRARY: 'meow_library',
    RECENT:  'meow_recent',
    PREFS:   'meow_prefs',
    PROFILE: 'meow_profile',
  };

  // ── AUDIO ENGINE ───────────────────────────────────────────────
  const audio = document.getElementById('audioPlayer');

  // ── DOM REFS ───────────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  const $$ = sel => document.querySelectorAll(sel);

  // ── INIT ────────────────────────────────────────────────────────
  function init() {
    _loadFromStorage();
    _applyPrefs();
    _bindEvents();
    _updateProfileUI();
    _loadSettingsUI();
    _renderRecentlyPlayed();
    _renderLikedScreen();
    _renderLibraryScreen();

    if (MeowAPI.hasAnyKey()) {
      _loadHomeContent();
    } else {
      _showNoApiState();
    }
  }

  // ── STORAGE ────────────────────────────────────────────────────
  function _loadFromStorage() {
    try {
      state.liked          = JSON.parse(localStorage.getItem(SK.LIKED)   || '[]');
      state.library        = JSON.parse(localStorage.getItem(SK.LIBRARY) || '[]');
      state.recentlyPlayed = JSON.parse(localStorage.getItem(SK.RECENT)  || '[]').slice(0, 30);
      const prefs = JSON.parse(localStorage.getItem(SK.PREFS) || '{}');
      Object.assign(state.prefs, prefs);
      const profile = JSON.parse(localStorage.getItem(SK.PROFILE) || '{}');
      Object.assign(state.userProfile, profile);
    } catch(e) {
      console.warn('Storage load error:', e);
    }
  }

  function _saveState(key, data) {
    try { localStorage.setItem(key, JSON.stringify(data)); } catch {}
  }

  // ── PREFERENCES ────────────────────────────────────────────────
  function _applyPrefs() {
    document.body.classList.toggle('light-mode', !state.prefs.darkMode);
  }

  // ── SETTINGS UI SYNC ───────────────────────────────────────────
  function _loadSettingsUI() {
    // Profile
    $('displayName').value = state.userProfile.name || '';
    $('userEmail').value   = state.userProfile.email || '';

    // API keys (masked, just enable states)
    $('ytApiKey').value        = localStorage.getItem(MeowAPI.KEY.YT_KEY) || '';
    $('ytApiEnabled').checked  = localStorage.getItem(MeowAPI.KEY.YT_ENABLED) === 'true';
    $('spotClientId').value    = localStorage.getItem(MeowAPI.KEY.SPOT_CID) || '';
    $('spotClientSecret').value = localStorage.getItem(MeowAPI.KEY.SPOT_SECRET) || '';
    $('spotApiEnabled').checked = localStorage.getItem(MeowAPI.KEY.SPOT_ENABLED) === 'true';

    // Prefs
    $('darkModeToggle').checked = state.prefs.darkMode;
    $('notifToggle').checked    = state.prefs.notifications;
    $('autoPlayToggle').checked = state.prefs.autoPlay;

    // Volume
    $('volumeSlider').value = Math.round(state.volume * 100);
    audio.volume = state.volume;
  }

  function _updateProfileUI() {
    $('sidebarName').textContent  = state.userProfile.name || 'Guest User';
    $('sidebarEmail').textContent = state.userProfile.email || 'No email set';
  }

  // ── HOME CONTENT ───────────────────────────────────────────────
  async function _loadHomeContent() {
    _loadAlbums();
    _loadRecommended();
  }

  async function _loadAlbums() {
    const wrap = $('albumsScroll');
    try {
      const albums = await MeowAPI.getAlbums();
      if (!albums.length) { wrap.innerHTML = '<p class="empty-state small"><p>No albums found</p></p>'; return; }
      wrap.innerHTML = '';
      albums.slice(0, 10).forEach((item, i) => {
        wrap.appendChild(_createAlbumCard(item, i));
      });
    } catch(e) {
      if (e.message === 'NO_API') return;
      wrap.innerHTML = `<div class="empty-state small"><p>${_safeText(e.message)}</p></div>`;
    }
  }

  async function _loadRecommended() {
    const wrap = $('recommendedList');
    const seedId = state.recentlyPlayed[0]?.id || '';
    try {
      const tracks = await MeowAPI.getRecommended(seedId);
      if (!tracks.length) { wrap.innerHTML = '<div class="empty-state small"><p>Nothing to recommend yet</p></div>'; return; }
      wrap.innerHTML = '';
      tracks.slice(0, 6).forEach((t, i) => {
        if (t) wrap.appendChild(_createFeaturedCard(t, i));
      });
    } catch(e) {
      if (e.message === 'NO_API') return;
      wrap.innerHTML = `<div class="empty-state small"><p>${_safeText(e.message)}</p></div>`;
    }
  }

  function _showNoApiState() {
    const albumsEl = $('albumsScroll');
    const recEl    = $('recommendedList');
    const noApiHTML = `
      <div class="no-api-card">
        <div class="icon">
          <svg viewBox="0 0 24 24" fill="none" width="40" height="40">
            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1" opacity="0.4"/>
            <path d="M12 8v4M12 16h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </div>
        <h3>Add an API Key</h3>
        <p>Connect YouTube Data API or Spotify to start streaming music.</p>
        <button class="btn-primary" style="width:auto;padding:10px 24px" onclick="MeowApp.goToSettings()">Open Settings</button>
      </div>`;
    albumsEl.innerHTML = noApiHTML;
    recEl.innerHTML    = '';
  }

  // ── CARD BUILDERS ──────────────────────────────────────────────
  function _createAlbumCard(item, idx) {
    const card = document.createElement('div');
    card.className = 'album-card';
    card.style.animationDelay = `${idx * 0.05}s`;
    card.innerHTML = `
      <div class="album-thumb-wrap">
        ${item.thumbnail
          ? `<img src="${_safeAttr(item.thumbnail)}" alt="${_safeAttr(item.title)}" loading="lazy" />`
          : '<div class="track-thumb-placeholder"><svg viewBox="0 0 24 24" fill="none" width="32" height="32"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1"/></svg></div>'
        }
        <div class="album-play-overlay">
          <svg viewBox="0 0 24 24" fill="none"><path d="M5 3l14 9-14 9V3z" fill="white"/></svg>
        </div>
        ${item.type ? `<span class="album-badge">${_safeText(item.type.toUpperCase())}</span>` : ''}
      </div>
      <div class="album-title">${_safeText(item.title)}</div>
      <div class="album-artist">${_safeText(item.artist || '')}</div>`;
    card.addEventListener('click', () => _handleAlbumClick(item));
    return card;
  }

  function _createFeaturedCard(track, idx) {
    if (!track) return document.createDocumentFragment();
    const card = document.createElement('div');
    card.className = 'featured-card';
    card.style.animationDelay = `${idx * 0.08}s`;
    card.innerHTML = `
      ${track.thumbnail ? `<img src="${_safeAttr(track.thumbnail)}" alt="${_safeAttr(track.title)}" loading="lazy" />` : ''}
      <div class="featured-card-overlay">
        <span class="featured-label">${track.source === 'youtube' ? 'YouTube' : 'Spotify'}</span>
        <div class="featured-title">${_safeText(track.title)}</div>
        <div class="featured-subtitle">${_safeText(track.artist)}</div>
      </div>
      <button class="featured-play-btn" aria-label="Play">
        <svg viewBox="0 0 24 24" fill="none"><path d="M5 3l14 9-14 9V3z" fill="white"/></svg>
      </button>`;
    card.querySelector('.featured-play-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      playTrack(track, [track]);
    });
    card.addEventListener('click', () => playTrack(track, [track]));
    return card;
  }

  function _createTrackItem(track, queue, idx, opts = {}) {
    if (!track) return document.createDocumentFragment();
    const isPlaying = state.currentTrack?.id === track.id && state.isPlaying;
    const isLiked   = isTrackLiked(track.id);
    const item = document.createElement('div');
    item.className = `track-item${isPlaying ? ' playing' : ''}`;
    item.dataset.trackId = track.id;
    item.style.animationDelay = `${idx * 0.03}s`;
    item.innerHTML = `
      <div class="track-thumb">
        ${track.thumbnail
          ? `<img src="${_safeAttr(track.thumbnail)}" alt="${_safeAttr(track.title)}" loading="lazy" />`
          : '<div class="track-thumb-placeholder"><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1"/><path d="M10 8l6 4-6 4V8z" fill="currentColor" opacity="0.5"/></svg></div>'
        }
        ${isPlaying ? `<div class="playing-indicator"><div class="playing-bars"><span></span><span></span><span></span></div></div>` : ''}
      </div>
      <div class="track-info">
        <div class="track-title">${_safeText(track.title)}</div>
        <div class="track-artist">${_safeText(track.artist)}</div>
      </div>
      ${track.duration ? `<div class="track-duration">${_formatDuration(track.duration)}</div>` : ''}
      <button class="track-options-btn" aria-label="More options">
        <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="5" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="19" r="1.2" fill="currentColor"/></svg>
      </button>`;
    item.querySelector('.track-options-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      _showContextMenu(e, track, queue);
    });
    item.addEventListener('click', () => playTrack(track, queue));
    return item;
  }

  // ── PLAYBACK ───────────────────────────────────────────────────

  function playTrack(track, queue = []) {
    if (!track) return;
    state.currentTrack = track;
    state.currentQueue = queue.filter(Boolean);
    state.currentIndex = state.currentQueue.findIndex(t => t?.id === track.id);
    if (state.currentIndex === -1 && state.currentQueue.length) state.currentIndex = 0;

    _addToRecent(track);
    _updatePlayerUI(track);
    _updateMiniPlayer(track);

    // Try to load audio
    if (track.streamUrl) {
      // Spotify 30s preview
      audio.src = track.streamUrl;
      audio.volume = state.volume;
      audio.play().then(() => {
        state.isPlaying = true;
        _updatePlayState();
      }).catch(e => {
        _handlePlayError(track, e);
      });
    } else if (track.source === 'youtube') {
      // YT: can't stream directly — use HTML5 audio with no src
      // Instead, open player with info only, offer button to open in YT
      state.isPlaying = false;
      audio.src = '';
      _updatePlayState();
      showToast('YouTube: Tap "Open" to play in YouTube', 'info');
      $('openYtBtn').style.display = 'flex';
    } else {
      showToast('No stream available for this track', 'error');
    }

    _updateAllTrackItems();
    openPlayerOverlay();
    _sendNotification(track);
  }

  function _handlePlayError(track, err) {
    console.warn('Play error:', err);
    state.isPlaying = false;
    _updatePlayState();
    if (track.source === 'spotify' && !track.streamUrl) {
      showToast('No preview available — Spotify free preview only', 'error');
    }
  }

  function togglePlayPause() {
    if (!state.currentTrack) return;
    if (state.isPlaying) {
      audio.pause();
      state.isPlaying = false;
    } else {
      if (audio.src) {
        audio.play().catch(() => {});
        state.isPlaying = true;
      }
    }
    _updatePlayState();
  }

  function playNext() {
    if (!state.currentQueue.length) return;
    let next;
    if (state.isShuffle) {
      const idx = Math.floor(Math.random() * state.currentQueue.length);
      next = state.currentQueue[idx];
    } else {
      const ni = state.currentIndex + 1;
      next = state.currentQueue[ni >= state.currentQueue.length ? 0 : ni];
    }
    if (next) playTrack(next, state.currentQueue);
  }

  function playPrev() {
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    if (!state.currentQueue.length) return;
    const pi = state.currentIndex - 1;
    const prev = state.currentQueue[pi < 0 ? state.currentQueue.length - 1 : pi];
    if (prev) playTrack(prev, state.currentQueue);
  }

  // ── PLAYER UI ──────────────────────────────────────────────────
  function _updatePlayerUI(track) {
    $('playerTitle').textContent  = track.title || 'Unknown';
    $('playerArtist').textContent = track.artist || '--';
    $('playerSourceLabel').textContent = track.source === 'youtube' ? 'YOUTUBE' : 'SPOTIFY';

    const img = $('playerArtImg');
    const ph  = $('artworkPlaceholder');
    if (track.thumbnail) {
      img.src = track.thumbnail;
      img.style.display = 'block';
      ph.style.display  = 'none';
      // Set blurred bg
      const bg = $('playerBg');
      bg.innerHTML = `<div class="player-bg-img" style="background-image:url('${_safeAttr(track.thumbnail)}')"></div>`;
    } else {
      img.style.display = 'none';
      ph.style.display  = 'flex';
    }

    // Like state
    _updateLikeButtons(track.id);

    // Reset times
    $('currentTime').textContent = '0:00';
    $('totalTime').textContent   = track.duration ? _formatDuration(track.duration) : '0:00';
    $('progressFill').style.width = '0%';
    $('progressThumb').style.left = '0%';
  }

  function _updateMiniPlayer(track) {
    $('miniTitle').textContent  = track.title || 'Unknown';
    $('miniArtist').textContent = track.artist || '--';

    const thumb = $('miniThumb');
    if (track.thumbnail) {
      thumb.innerHTML = `<img src="${_safeAttr(track.thumbnail)}" alt="${_safeAttr(track.title)}" />`;
    }
    $('miniPlayer').classList.remove('hidden');
    $('miniPlayer').classList.add('slide-up');
    setTimeout(() => $('miniPlayer').classList.remove('slide-up'), 400);

    _updateMiniLikeBtn(track.id);
  }

  function _updatePlayState() {
    const playing = state.isPlaying;
    // Player icon
    $('playPauseIcon').innerHTML = playing
      ? '<rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor"/>'
      : '<path d="M5 3l14 9-14 9V3z" fill="currentColor"/>';

    // Mini icon
    $('miniPlayIcon').innerHTML = playing
      ? '<rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor"/>'
      : '<path d="M5 3l14 9-14 9V3z" fill="currentColor"/>';

    // Artwork scale
    $('playerArtwork').classList.toggle('playing', playing);
  }

  function _updateLikeButtons(trackId) {
    const liked = isTrackLiked(trackId);
    [$('playerLikeBtn'), $('miniLikeBtn')].forEach(btn => {
      if (!btn) return;
      btn.classList.toggle('liked', liked);
    });
  }

  function _updateMiniLikeBtn(trackId) {
    const btn = $('miniLikeBtn');
    if (btn) btn.classList.toggle('liked', isTrackLiked(trackId));
  }

  function _updateAllTrackItems() {
    $$('.track-item').forEach(item => {
      const id = item.dataset.trackId;
      const isActive = state.currentTrack?.id === id;
      item.classList.toggle('playing', isActive && state.isPlaying);
    });
  }

  // ── PLAYER OVERLAY ────────────────────────────────────────────
  function openPlayerOverlay() {
    const overlay = $('playerOverlay');
    overlay.classList.remove('hidden', 'slide-out');
    overlay.classList.add('slide-in');
    setTimeout(() => overlay.classList.remove('slide-in'), 400);
  }

  function closePlayerOverlay() {
    const overlay = $('playerOverlay');
    overlay.classList.add('slide-out');
    setTimeout(() => {
      overlay.classList.add('hidden');
      overlay.classList.remove('slide-out');
    }, 350);
  }

  // ── PROGRESS ──────────────────────────────────────────────────
  function _updateProgress() {
    if (!audio.duration || isNaN(audio.duration)) return;
    const pct = (audio.currentTime / audio.duration) * 100;
    $('progressFill').style.width  = `${pct}%`;
    $('progressThumb').style.left  = `${pct}%`;
    $('miniProgressFill').style.width = `${pct}%`;
    $('currentTime').textContent   = _formatTime(audio.currentTime);
    $('totalTime').textContent     = _formatTime(audio.duration);
    state.progress = pct;
  }

  function _seekFromClick(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    if (audio.duration) audio.currentTime = pct * audio.duration;
  }

  // ── LIKED / LIBRARY ───────────────────────────────────────────
  function isTrackLiked(id) { return state.liked.some(t => t.id === id); }

  function toggleLike(track) {
    if (!track) return;
    const idx = state.liked.findIndex(t => t.id === track.id);
    if (idx === -1) {
      state.liked.unshift(track);
      showToast('Added to Liked Songs', 'success');
    } else {
      state.liked.splice(idx, 1);
      showToast('Removed from Liked Songs');
    }
    _saveState(SK.LIKED, state.liked);
    _updateLikeButtons(track.id);
    _updateMiniLikeBtn(track.id);
    _renderLikedScreen();
  }

  function toggleLibrary(track) {
    if (!track) return;
    const idx = state.library.findIndex(t => t.id === track.id);
    if (idx === -1) {
      state.library.unshift(track);
      showToast('Saved to Library', 'success');
    } else {
      state.library.splice(idx, 1);
      showToast('Removed from Library');
    }
    _saveState(SK.LIBRARY, state.library);
    _renderLibraryScreen();
  }

  function _addToRecent(track) {
    state.recentlyPlayed = state.recentlyPlayed.filter(t => t.id !== track.id);
    state.recentlyPlayed.unshift(track);
    if (state.recentlyPlayed.length > 30) state.recentlyPlayed.pop();
    _saveState(SK.RECENT, state.recentlyPlayed);
    _renderRecentlyPlayed();
  }

  // ── RENDER LISTS ─────────────────────────────────────────────
  function _renderRecentlyPlayed() {
    const wrap  = $('recentlyPlayed');
    const empty = $('recentEmpty');
    if (!state.recentlyPlayed.length) {
      wrap.innerHTML = '';
      wrap.appendChild(empty || document.createDocumentFragment());
      return;
    }
    wrap.innerHTML = '';
    state.recentlyPlayed.slice(0, 8).forEach((t, i) => {
      if (t) wrap.appendChild(_createTrackItem(t, state.recentlyPlayed, i));
    });
  }

  function _renderLikedScreen() {
    const wrap  = $('likedList');
    const empty = $('likedEmpty');
    $('likedCount').textContent = `${state.liked.length} song${state.liked.length !== 1 ? 's' : ''}`;
    if (!state.liked.length) {
      wrap.innerHTML = '<div class="empty-state"><p>No liked songs yet. Tap the heart on any song.</p></div>';
      return;
    }
    wrap.innerHTML = '';
    state.liked.forEach((t, i) => {
      if (t) wrap.appendChild(_createTrackItem(t, state.liked, i));
    });
  }

  function _renderLibraryScreen() {
    const wrap = $('libraryList');
    if (!state.library.length) {
      wrap.innerHTML = '<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" width="48" height="48"><rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1"/><rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1"/><rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1"/><rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1"/></svg><p>Your library is empty. Like songs to save them here.</p></div>';
      return;
    }
    wrap.innerHTML = '';
    state.library.forEach((t, i) => {
      if (t) wrap.appendChild(_createTrackItem(t, state.library, i));
    });
  }

  // ── SEARCH ────────────────────────────────────────────────────
  let _searchTimer = null;

  function _handleSearchInput(e) {
    const q = MeowAPI.sanitize(e.target.value.trim());
    if (_searchTimer) clearTimeout(_searchTimer);
    if (!q) {
      $('searchResults').innerHTML = '<div class="empty-state" id="searchEmpty"><svg viewBox="0 0 24 24" fill="none" width="48" height="48"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1"/><path d="M16.5 16.5L21 21" stroke="currentColor" stroke-width="1" stroke-linecap="round"/></svg><p>Search for songs, artists or albums</p></div>';
      return;
    }
    $('searchResults').innerHTML = '<div class="search-loading"><div class="loading-spinner"></div>Searching...</div>';
    _searchTimer = setTimeout(() => _doSearch(q), 600);
  }

  async function _doSearch(q) {
    if (!MeowAPI.hasAnyKey()) {
      $('searchResults').innerHTML = '<div class="empty-state"><p>Add an API key in Settings to search.</p></div>';
      return;
    }
    try {
      const results = await MeowAPI.search(q);
      const wrap = $('searchResults');
      if (!results.length) {
        wrap.innerHTML = `<div class="empty-state"><p>No results for "${_safeText(q)}"</p></div>`;
        return;
      }
      wrap.innerHTML = '';
      results.forEach((t, i) => {
        if (t) wrap.appendChild(_createTrackItem(t, results, i));
      });
    } catch(e) {
      $('searchResults').innerHTML = `<div class="empty-state"><p>${_safeText(e.message)}</p></div>`;
    }
  }

  // ── NAVIGATION ───────────────────────────────────────────────
  function goToScreen(name) {
    $$('.screen').forEach(s => s.classList.remove('active'));
    $$('.nav-item').forEach(n => n.classList.remove('active'));
    $$('.sidebar-item').forEach(s => s.classList.remove('active'));

    const screen = $(`screen-${name}`);
    if (screen) screen.classList.add('active');

    $$(`[data-screen="${name}"]`).forEach(el => el.classList.add('active'));
    closeSidebar();

    // Trigger data loads when navigating
    if (name === 'search') {
      setTimeout(() => $('searchInputFull')?.focus(), 200);
    }
  }

  function goToSettings() { goToScreen('settings'); }

  // ── SIDEBAR ──────────────────────────────────────────────────
  function openSidebar() {
    $('sidebar').classList.add('open');
    $('sidebarOverlay').classList.add('active');
  }
  function closeSidebar() {
    $('sidebar').classList.remove('open');
    $('sidebarOverlay').classList.remove('active');
  }

  // ── CONTEXT MENU ─────────────────────────────────────────────
  let _activeCtx = null;

  function _showContextMenu(e, track, queue) {
    _removeContextMenu();
    const liked   = isTrackLiked(track.id);
    const inLib   = state.library.some(t => t.id === track.id);
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.innerHTML = `
      <div class="context-item" data-action="play">
        <svg viewBox="0 0 24 24" fill="none"><path d="M5 3l14 9-14 9V3z" fill="currentColor"/></svg>
        Play Now
      </div>
      <div class="context-item" data-action="like">
        <svg viewBox="0 0 24 24" fill="none"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z" stroke="currentColor" stroke-width="1.5" ${liked ? 'fill="currentColor"' : ''}/>
        </svg>
        ${liked ? 'Unlike' : 'Like'}
      </div>
      <div class="context-item" data-action="library">
        <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.5"/></svg>
        ${inLib ? 'Remove from Library' : 'Save to Library'}
      </div>
      ${track.videoId ? `<div class="context-item" data-action="yt">
        <svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        Open in YouTube
      </div>` : ''}`;

    // Position
    const vw = window.innerWidth, vh = window.innerHeight;
    let x = e.clientX, y = e.clientY;
    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    if (x + rect.width > vw) x = vw - rect.width - 8;
    if (y + rect.height > vh) y = vh - rect.height - 8;
    menu.style.left = `${x}px`;
    menu.style.top  = `${y}px`;

    menu.addEventListener('click', (ev) => {
      const action = ev.target.closest('[data-action]')?.dataset.action;
      if (!action) return;
      if (action === 'play')    playTrack(track, queue);
      if (action === 'like')    toggleLike(track);
      if (action === 'library') toggleLibrary(track);
      if (action === 'yt' && track.videoId) window.open(MeowAPI.YouTube.getEmbedUrl(track.videoId), '_blank');
      _removeContextMenu();
    });

    _activeCtx = menu;
    setTimeout(() => document.addEventListener('click', _removeContextMenu, { once: true }), 10);
  }

  function _removeContextMenu() {
    if (_activeCtx) { _activeCtx.remove(); _activeCtx = null; }
  }

  // ── ALBUM CLICK ──────────────────────────────────────────────
  async function _handleAlbumClick(item) {
    const screen = $('screen-artist');
    $('artistBannerName').textContent = item.title || 'Unknown';
    $('artistBannerType').textContent = item.type ? item.type.toUpperCase() : 'PLAYLIST';

    const banner = $('artistBanner');
    if (item.thumbnail) {
      banner.innerHTML = `
        <button class="icon-btn back-btn float-back" id="artistBack"><svg viewBox="0 0 24 24" fill="none"><path d="M19 12H5M5 12l7-7M5 12l7 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <img src="${_safeAttr(item.thumbnail)}" alt="${_safeAttr(item.title)}" style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0"/>
        <div class="artist-banner-info">
          <p class="artist-banner-type" id="artistBannerType">${_safeText(item.type?.toUpperCase() || 'ALBUM')}</p>
          <h1 class="artist-banner-name" id="artistBannerName">${_safeText(item.title)}</h1>
        </div>`;
    }
    $('artistBack').addEventListener('click', () => goToScreen('home'));

    const trackList = $('artistTrackList');
    trackList.innerHTML = '<div class="search-loading"><div class="loading-spinner"></div>Loading...</div>';
    goToScreen('artist');

    try {
      let tracks = [];
      const src = MeowAPI.getActiveSource();
      if (src === 'spotify' && item.spotifyId) {
        tracks = await MeowAPI.Spotify.getPlaylistTracks(item.spotifyId).catch(() => []);
        if (!tracks.length) tracks = await MeowAPI.Spotify.getRecommendations('', 'pop', 20).catch(() => []);
      } else if (src === 'youtube') {
        tracks = await MeowAPI.YouTube.search(item.title, 15);
      }

      trackList.innerHTML = '';
      if (!tracks.length) { trackList.innerHTML = '<div class="empty-state"><p>No tracks found</p></div>'; return; }
      tracks.forEach((t, i) => {
        if (t) trackList.appendChild(_createTrackItem(t, tracks, i));
      });

      $('playAllBtn').onclick   = () => { if (tracks[0]) playTrack(tracks[0], tracks); };
      $('shuffleAllBtn').onclick = () => {
        const shuffled = [...tracks].sort(() => Math.random() - 0.5);
        if (shuffled[0]) playTrack(shuffled[0], shuffled);
      };
    } catch(e) {
      trackList.innerHTML = `<div class="empty-state"><p>${_safeText(e.message)}</p></div>`;
    }
  }

  // ── NOTIFICATIONS ────────────────────────────────────────────
  async function _sendNotification(track) {
    if (!state.prefs.notifications) return;
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      await Notification.requestPermission();
    }
    if (Notification.permission === 'granted') {
      try {
        new Notification('Now Playing — MEOW MUSIC', {
          body: `${track.title} · ${track.artist}`,
          icon: track.thumbnail || '',
          silent: true,
        });
      } catch {}
    }
  }

  // ── TOAST ────────────────────────────────────────────────────
  function showToast(msg, type = '') {
    const container = $('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = _safeText(msg).slice(0, 80);
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('exit');
      setTimeout(() => toast.remove(), 300);
    }, 2800);
  }

  // ── VOICE SEARCH ─────────────────────────────────────────────
  function _initVoiceSearch() {
    const micBtn = $('micBtn');
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      micBtn.style.opacity = '0.4';
      micBtn.title = 'Voice search not supported in this browser';
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SR();
    recognition.lang = 'en-US';
    recognition.interimResults = false;

    micBtn.addEventListener('click', () => {
      micBtn.classList.add('listening');
      recognition.start();
    });
    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      const input = $('searchInput');
      input.value = transcript;
      micBtn.classList.remove('listening');
      goToScreen('search');
      $('searchInputFull').value = transcript;
      _doSearch(MeowAPI.sanitize(transcript));
    };
    recognition.onerror = () => micBtn.classList.remove('listening');
    recognition.onend   = () => micBtn.classList.remove('listening');
  }

  // ── EVENT BINDING ────────────────────────────────────────────
  function _bindEvents() {

    // Sidebar toggles
    ['menuToggle','menuToggle2','menuToggle3','menuToggle4'].forEach(id => {
      $(id)?.addEventListener('click', openSidebar);
    });
    $('sidebarOverlay').addEventListener('click', closeSidebar);

    // Sidebar nav
    $$('.sidebar-item[data-screen]').forEach(item => {
      item.addEventListener('click', () => goToScreen(item.dataset.screen));
    });
    $('logoutBtn')?.addEventListener('click', () => {
      showToast('Logged out');
      closeSidebar();
    });

    // Bottom nav
    $$('.nav-item[data-screen]').forEach(btn => {
      btn.addEventListener('click', () => goToScreen(btn.dataset.screen));
    });

    // Back buttons
    $$('.back-btn[data-back]').forEach(btn => {
      btn.addEventListener('click', () => goToScreen(btn.dataset.back));
    });
    $('artistBack')?.addEventListener('click', () => goToScreen('home'));

    // Mini player: open full player on click (but not control buttons)
    $('miniPlayer').addEventListener('click', (e) => {
      if (e.target.closest('.mini-play-btn') || e.target.closest('.mini-like-btn')) return;
      if (state.currentTrack) openPlayerOverlay();
    });
    $('miniPlayBtn').addEventListener('click', (e) => { e.stopPropagation(); togglePlayPause(); });
    $('miniLikeBtn').addEventListener('click', (e) => { e.stopPropagation(); toggleLike(state.currentTrack); });

    // Full player controls
    $('playerClose').addEventListener('click', closePlayerOverlay);
    $('playPauseBtn').addEventListener('click', togglePlayPause);
    $('nextBtn').addEventListener('click', playNext);
    $('prevBtn').addEventListener('click', playPrev);
    $('playerLikeBtn').addEventListener('click', () => toggleLike(state.currentTrack));

    $('shuffleBtn').addEventListener('click', () => {
      state.isShuffle = !state.isShuffle;
      $('shuffleBtn').classList.toggle('active', state.isShuffle);
      showToast(state.isShuffle ? 'Shuffle on' : 'Shuffle off');
    });

    $('repeatBtn').addEventListener('click', () => {
      state.repeatMode = (state.repeatMode + 1) % 3;
      $('repeatBtn').classList.toggle('active', state.repeatMode > 0);
      const labels = ['Repeat off', 'Repeat all', 'Repeat one'];
      showToast(labels[state.repeatMode]);
    });

    // Progress bar seek
    $('progressBarContainer').addEventListener('click', _seekFromClick);

    // Volume
    $('volumeSlider').addEventListener('input', (e) => {
      state.volume = parseInt(e.target.value) / 100;
      audio.volume = state.volume;
    });

    // Audio events
    audio.addEventListener('timeupdate', _updateProgress);
    audio.addEventListener('ended', () => {
      state.isPlaying = false;
      _updatePlayState();
      if (state.repeatMode === 2) {
        audio.currentTime = 0;
        audio.play().then(() => { state.isPlaying = true; _updatePlayState(); }).catch(() => {});
      } else if (state.prefs.autoPlay) {
        playNext();
      }
    });
    audio.addEventListener('play',  () => { state.isPlaying = true;  _updatePlayState(); _updateAllTrackItems(); });
    audio.addEventListener('pause', () => { state.isPlaying = false; _updatePlayState(); _updateAllTrackItems(); });
    audio.addEventListener('loadedmetadata', () => {
      $('totalTime').textContent = _formatTime(audio.duration);
    });
    audio.addEventListener('error', () => {
      state.isPlaying = false;
      _updatePlayState();
    });

    // Search
    $('searchInput').addEventListener('input', (e) => {
      if (e.target.value.trim()) {
        goToScreen('search');
        $('searchInputFull').value = e.target.value;
        _handleSearchInput({ target: $('searchInputFull') });
      }
    });
    $('searchInputFull').addEventListener('input', _handleSearchInput);

    // Player extras
    $('addToLibraryBtn').addEventListener('click', () => toggleLibrary(state.currentTrack));
    $('openYtBtn').addEventListener('click', () => {
      if (state.currentTrack?.videoId) window.open(MeowAPI.YouTube.getEmbedUrl(state.currentTrack.videoId), '_blank');
    });
    $('shareBtn').addEventListener('click', () => {
      if (!state.currentTrack) return;
      const text = `${state.currentTrack.title} by ${state.currentTrack.artist}`;
      if (navigator.share) {
        navigator.share({ title: 'MEOW MUSIC', text }).catch(() => {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard'));
      }
    });

    // Settings — API tabs
    $$('.api-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('.api-tab').forEach(t => t.classList.remove('active'));
        $$('.api-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        $(`panel-${tab.dataset.api}`)?.classList.add('active');
      });
    });

    // Password visibility toggles
    $$('.toggle-visibility').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = $(btn.dataset.target);
        if (input) input.type = input.type === 'password' ? 'text' : 'password';
      });
    });

    // Save YouTube API
    $('saveYtApiBtn').addEventListener('click', async () => {
      const key     = $('ytApiKey').value.trim();
      const enabled = $('ytApiEnabled').checked;
      const status  = $('ytApiStatus');
      if (!key) { _showApiStatus(status, 'API key cannot be empty', false); return; }
      $('saveYtApiBtn').textContent = 'Validating...';
      try {
        await MeowAPI.YouTube.validate(key);
        MeowAPI.YouTube.save(key, enabled);
        _showApiStatus(status, 'YouTube API connected successfully', true);
        showToast('YouTube API activated', 'success');
        if (enabled) _loadHomeContent();
      } catch(e) {
        _showApiStatus(status, e.message || 'Invalid API key', false);
      } finally {
        $('saveYtApiBtn').textContent = 'Save & Activate';
      }
    });

    // Save Spotify API
    $('saveSpotApiBtn').addEventListener('click', async () => {
      const cid     = $('spotClientId').value.trim();
      const secret  = $('spotClientSecret').value.trim();
      const enabled = $('spotApiEnabled').checked;
      const status  = $('spotApiStatus');
      if (!cid || !secret) { _showApiStatus(status, 'Both Client ID and Secret are required', false); return; }
      $('saveSpotApiBtn').textContent = 'Validating...';
      try {
        MeowAPI.Spotify.save(cid, secret, enabled);
        await MeowAPI.Spotify.validate();
        _showApiStatus(status, 'Spotify API connected successfully', true);
        showToast('Spotify API activated', 'success');
        if (enabled) _loadHomeContent();
      } catch(e) {
        _showApiStatus(status, e.message || 'Invalid credentials', false);
      } finally {
        $('saveSpotApiBtn').textContent = 'Save & Activate';
      }
    });

    // Save profile
    $('saveProfileBtn').addEventListener('click', () => {
      state.userProfile.name  = MeowAPI.sanitize($('displayName').value);
      state.userProfile.email = MeowAPI.sanitize($('userEmail').value);
      _saveState(SK.PROFILE, state.userProfile);
      _updateProfileUI();
      showToast('Profile saved', 'success');
    });

    // Dark mode
    $('darkModeToggle').addEventListener('change', (e) => {
      state.prefs.darkMode = e.target.checked;
      _saveState(SK.PREFS, state.prefs);
      _applyPrefs();
    });

    // Notifications
    $('notifToggle').addEventListener('change', async (e) => {
      state.prefs.notifications = e.target.checked;
      _saveState(SK.PREFS, state.prefs);
      if (e.target.checked && 'Notification' in window) {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') {
          e.target.checked = false;
          state.prefs.notifications = false;
          showToast('Notification permission denied', 'error');
        }
      }
    });

    // Auto play
    $('autoPlayToggle').addEventListener('change', (e) => {
      state.prefs.autoPlay = e.target.checked;
      _saveState(SK.PREFS, state.prefs);
    });

    // Clear data
    $('clearDataBtn').addEventListener('click', () => {
      if (!confirm('Clear all saved data? This will remove liked songs, library, history, and API keys.')) return;
      try {
        localStorage.clear();
        state.liked = []; state.library = []; state.recentlyPlayed = [];
        _renderLikedScreen(); _renderLibraryScreen(); _renderRecentlyPlayed();
        showToast('All data cleared');
        _showNoApiState();
      } catch {}
    });

    // Voice search init
    _initVoiceSearch();

    // Touch: swipe down on player to close
    let _touchStartY = 0;
    $('playerOverlay').addEventListener('touchstart', (e) => {
      _touchStartY = e.touches[0].clientY;
    }, { passive: true });
    $('playerOverlay').addEventListener('touchend', (e) => {
      const diff = e.changedTouches[0].clientY - _touchStartY;
      if (diff > 80) closePlayerOverlay();
    }, { passive: true });
  }

  // ── API STATUS ────────────────────────────────────────────────
  function _showApiStatus(el, msg, success) {
    el.textContent = msg;
    el.className   = `api-status ${success ? 'success' : 'error'}`;
  }

  // ── UTILS ─────────────────────────────────────────────────────
  function _formatTime(sec) {
    if (isNaN(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function _formatDuration(sec) {
    if (!sec) return '';
    return _formatTime(sec);
  }

  function _safeText(str) {
    if (typeof str !== 'string') str = String(str || '');
    const d = document.createElement('div');
    d.appendChild(document.createTextNode(str));
    return d.innerHTML;
  }

  function _safeAttr(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;');
  }

  // ── PUBLIC ───────────────────────────────────────────────────
  return { init, playTrack, toggleLike, toggleLibrary, goToScreen, goToSettings, showToast };

})();

// Boot on DOM ready
document.addEventListener('DOMContentLoaded', () => MeowApp.init());

// Expose for inline handlers
window.MeowApp = MeowApp;
