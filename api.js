/**
 * MEOW MUSIC — API Layer
 * Supports: YouTube Data API v3, Spotify Web API
 * No hardcoded keys — all from localStorage only
 */

'use strict';

const MeowAPI = (() => {

  // ── CONSTANTS ──────────────────────────────────────────────────
  const YT_BASE    = 'https://www.googleapis.com/youtube/v3';
  const SPOT_AUTH  = 'https://accounts.spotify.com/api/token';
  const SPOT_BASE  = 'https://api.spotify.com/v1';
  const YT_EMBED   = 'https://www.youtube.com/watch?v=';

  // ── STORAGE KEYS ───────────────────────────────────────────────
  const KEY = {
    YT_KEY:        'meow_yt_key',
    YT_ENABLED:    'meow_yt_enabled',
    SPOT_CID:      'meow_spot_cid',
    SPOT_SECRET:   'meow_spot_secret',
    SPOT_ENABLED:  'meow_spot_enabled',
    SPOT_TOKEN:    'meow_spot_token',
    SPOT_EXPIRY:   'meow_spot_expiry',
  };

  // ── HELPERS ────────────────────────────────────────────────────

  function _get(key) {
    try { return localStorage.getItem(key) || ''; }
    catch { return ''; }
  }

  function _set(key, val) {
    try { localStorage.setItem(key, val); } catch {}
  }

  function _sanitize(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[<>"'`]/g, '').trim().slice(0, 200);
  }

  async function _fetchJSON(url, options = {}) {
    const resp = await fetch(url, { ...options, signal: AbortSignal.timeout(12000) });
    if (!resp.ok) {
      const errBody = await resp.json().catch(() => ({}));
      throw new Error(errBody?.error?.message || `HTTP ${resp.status}`);
    }
    return resp.json();
  }

  // ── ACTIVE SOURCE ──────────────────────────────────────────────

  function getActiveSource() {
    if (_get(KEY.YT_ENABLED) === 'true' && _get(KEY.YT_KEY)) return 'youtube';
    if (_get(KEY.SPOT_ENABLED) === 'true' && _get(KEY.SPOT_CID)) return 'spotify';
    return null;
  }

  function hasAnyKey() { return !!getActiveSource(); }

  // ── YOUTUBE ────────────────────────────────────────────────────

  const YouTube = {

    getKey() { return _get(KEY.YT_KEY); },

    async validate(apiKey) {
      const key = _sanitize(apiKey);
      if (!key) throw new Error('API key cannot be empty');
      const url = `${YT_BASE}/videos?part=id&chart=mostPopular&maxResults=1&key=${encodeURIComponent(key)}`;
      await _fetchJSON(url);
      return true;
    },

    save(apiKey, enabled) {
      _set(KEY.YT_KEY, _sanitize(apiKey));
      _set(KEY.YT_ENABLED, enabled ? 'true' : 'false');
    },

    /**
     * Search videos
     * @param {string} query
     * @param {number} maxResults
     * @returns {Promise<Array>}
     */
    async search(query, maxResults = 20) {
      const key = this.getKey();
      if (!key) throw new Error('YouTube API key not configured');
      const q = encodeURIComponent(_sanitize(query));
      const url = `${YT_BASE}/search?part=snippet&type=video&videoCategoryId=10&maxResults=${maxResults}&q=${q}&key=${encodeURIComponent(key)}`;
      const data = await _fetchJSON(url);
      return (data.items || []).map(_ytItemToTrack);
    },

    /**
     * Trending music videos
     */
    async trending(maxResults = 20, regionCode = 'US') {
      const key = this.getKey();
      if (!key) throw new Error('YouTube API key not configured');
      const url = `${YT_BASE}/videos?part=snippet,contentDetails,statistics&chart=mostPopular&videoCategoryId=10&maxResults=${maxResults}&regionCode=${regionCode}&key=${encodeURIComponent(key)}`;
      const data = await _fetchJSON(url);
      return (data.items || []).map(_ytVideoToTrack);
    },

    /**
     * Fetch videos by channel / artist
     */
    async artistVideos(channelId, maxResults = 15) {
      const key = this.getKey();
      if (!key) throw new Error('YouTube API key not configured');
      const url = `${YT_BASE}/search?part=snippet&type=video&channelId=${encodeURIComponent(channelId)}&maxResults=${maxResults}&order=viewCount&key=${encodeURIComponent(key)}`;
      const data = await _fetchJSON(url);
      return (data.items || []).map(_ytItemToTrack);
    },

    /**
     * Get video details (for duration)
     */
    async getVideoDetails(videoIds) {
      const key = this.getKey();
      if (!key || !videoIds.length) return [];
      const ids = videoIds.slice(0, 50).map(id => encodeURIComponent(id)).join(',');
      const url = `${YT_BASE}/videos?part=contentDetails,snippet&id=${ids}&key=${encodeURIComponent(key)}`;
      const data = await _fetchJSON(url);
      return data.items || [];
    },

    getEmbedUrl(videoId) {
      return `${YT_EMBED}${videoId}`;
    },
  };

  // Map YouTube search item → track object
  function _ytItemToTrack(item) {
    const s = item.snippet;
    const videoId = item.id?.videoId || item.id;
    return {
      id:        videoId,
      source:    'youtube',
      title:     _decodeHTML(s.title || 'Unknown'),
      artist:    _decodeHTML(s.channelTitle || 'Unknown Artist'),
      album:     _decodeHTML(s.channelTitle || ''),
      thumbnail: s.thumbnails?.high?.url || s.thumbnails?.medium?.url || s.thumbnails?.default?.url || '',
      videoId,
      streamUrl: null, // YT doesn't provide direct stream — user opens in YT
      duration:  null,
      publishedAt: s.publishedAt,
    };
  }

  function _ytVideoToTrack(item) {
    const s = item.snippet;
    return {
      id:        item.id,
      source:    'youtube',
      title:     _decodeHTML(s.title || 'Unknown'),
      artist:    _decodeHTML(s.channelTitle || 'Unknown Artist'),
      album:     _decodeHTML(s.channelTitle || ''),
      thumbnail: s.thumbnails?.high?.url || s.thumbnails?.medium?.url || '',
      videoId:   item.id,
      streamUrl: null,
      duration:  _parseYTDuration(item.contentDetails?.duration),
      publishedAt: s.publishedAt,
    };
  }

  function _parseYTDuration(iso) {
    if (!iso) return null;
    const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!m) return null;
    const h = parseInt(m[1] || 0);
    const min = parseInt(m[2] || 0);
    const sec = parseInt(m[3] || 0);
    return h * 3600 + min * 60 + sec;
  }

  function _decodeHTML(str) {
    const d = document.createElement('textarea');
    d.innerHTML = str;
    return d.value;
  }

  // ── SPOTIFY ────────────────────────────────────────────────────

  const Spotify = {

    getCredentials() {
      return { cid: _get(KEY.SPOT_CID), secret: _get(KEY.SPOT_SECRET) };
    },

    save(cid, secret, enabled) {
      _set(KEY.SPOT_CID, _sanitize(cid));
      _set(KEY.SPOT_SECRET, _sanitize(secret));
      _set(KEY.SPOT_ENABLED, enabled ? 'true' : 'false');
    },

    async _getToken() {
      const now = Date.now();
      const expiry = parseInt(_get(KEY.SPOT_EXPIRY) || '0');
      const cached = _get(KEY.SPOT_TOKEN);
      if (cached && now < expiry - 60000) return cached;

      const { cid, secret } = this.getCredentials();
      if (!cid || !secret) throw new Error('Spotify credentials not configured');

      const body = new URLSearchParams({ grant_type: 'client_credentials' });
      const resp = await fetch(SPOT_AUTH, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + btoa(`${cid}:${secret}`),
        },
        body,
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) throw new Error('Spotify auth failed — check credentials');
      const data = await resp.json();
      _set(KEY.SPOT_TOKEN, data.access_token);
      _set(KEY.SPOT_EXPIRY, String(now + data.expires_in * 1000));
      return data.access_token;
    },

    async _spotFetch(endpoint) {
      const token = await this._getToken();
      return _fetchJSON(`${SPOT_BASE}${endpoint}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
    },

    async validate() {
      await this._spotFetch('/browse/new-releases?limit=1');
      return true;
    },

    async search(query, types = 'track', limit = 20) {
      const q = encodeURIComponent(_sanitize(query));
      const data = await this._spotFetch(`/search?q=${q}&type=${types}&limit=${limit}&market=US`);
      return (data.tracks?.items || []).map(_spotTrackToTrack);
    },

    async featuredPlaylists(limit = 6) {
      const data = await this._spotFetch(`/browse/featured-playlists?limit=${limit}&market=US`);
      return data.playlists?.items || [];
    },

    async newReleases(limit = 10) {
      const data = await this._spotFetch(`/browse/new-releases?limit=${limit}&market=US`);
      return (data.albums?.items || []).map(_spotAlbumToAlbum);
    },

    async getRecommendations(seedTracks = '', seedGenres = 'pop', limit = 20) {
      let url = `/recommendations?limit=${limit}&market=US&seed_genres=${encodeURIComponent(seedGenres)}`;
      if (seedTracks) url += `&seed_tracks=${encodeURIComponent(seedTracks)}`;
      const data = await this._spotFetch(url);
      return (data.tracks || []).map(_spotTrackToTrack);
    },

    async getArtistTopTracks(artistId) {
      const data = await this._spotFetch(`/artists/${artistId}/top-tracks?market=US`);
      return (data.tracks || []).map(_spotTrackToTrack);
    },

    async getPlaylistTracks(playlistId) {
      const data = await this._spotFetch(`/playlists/${playlistId}/tracks?limit=50&market=US`);
      return (data.items || [])
        .filter(i => i.track)
        .map(i => _spotTrackToTrack(i.track));
    },

    async getTrending(limit = 20) {
      // Use Spotify's "Global Top 50" playlist for trending
      const data = await this._spotFetch(`/playlists/37i9dQZEVXbMDoHDwVN2tF/tracks?limit=${limit}&market=US`);
      return (data.items || [])
        .filter(i => i.track)
        .map(i => _spotTrackToTrack(i.track));
    },

    async getCategories() {
      const data = await this._spotFetch('/browse/categories?limit=12&country=US');
      return data.categories?.items || [];
    },
  };

  function _spotTrackToTrack(item) {
    if (!item) return null;
    return {
      id:        item.id,
      source:    'spotify',
      title:     item.name || 'Unknown',
      artist:    (item.artists || []).map(a => a.name).join(', ') || 'Unknown Artist',
      album:     item.album?.name || '',
      thumbnail: item.album?.images?.[0]?.url || item.album?.images?.[1]?.url || '',
      videoId:   null,
      streamUrl: item.preview_url || null,
      duration:  item.duration_ms ? Math.floor(item.duration_ms / 1000) : null,
      spotifyUrl: item.external_urls?.spotify || null,
      explicit:  item.explicit,
      spotifyId: item.id,
    };
  }

  function _spotAlbumToAlbum(item) {
    return {
      id:        item.id,
      source:    'spotify',
      title:     item.name,
      artist:    (item.artists || []).map(a => a.name).join(', '),
      thumbnail: item.images?.[0]?.url || item.images?.[1]?.url || '',
      type:      item.album_type,
      spotifyId: item.id,
    };
  }

  // ── UNIFIED API ────────────────────────────────────────────────

  async function search(query) {
    const src = getActiveSource();
    if (!src) throw new Error('NO_API');
    if (src === 'youtube') return YouTube.search(query);
    return Spotify.search(query);
  }

  async function getTrending() {
    const src = getActiveSource();
    if (!src) throw new Error('NO_API');
    if (src === 'youtube') return YouTube.trending(20);
    return Spotify.getTrending(20);
  }

  async function getAlbums() {
    const src = getActiveSource();
    if (!src) throw new Error('NO_API');
    if (src === 'youtube') {
      // For YT, use trending as albums (no native album concept)
      const tracks = await YouTube.trending(10);
      return tracks.map(t => ({ ...t, type: 'video' }));
    }
    return Spotify.newReleases(12);
  }

  async function getRecommended(seedTrackId = '') {
    const src = getActiveSource();
    if (!src) throw new Error('NO_API');
    if (src === 'youtube') return YouTube.search('top music 2024', 10);
    return Spotify.getRecommendations(seedTrackId, 'pop,hip-hop,indie', 10);
  }

  // ── EXPORTS ────────────────────────────────────────────────────

  return {
    YouTube,
    Spotify,
    getActiveSource,
    hasAnyKey,
    search,
    getTrending,
    getAlbums,
    getRecommended,
    KEY,
    sanitize: _sanitize,
    decodeHTML: _decodeHTML,
  };

})();

// Expose globally
window.MeowAPI = MeowAPI;
