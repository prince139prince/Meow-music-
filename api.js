/**
 * MEOW MUSIC — JAMENDO API VERSION
 * Only Jamendo (no YouTube / Spotify)
 */

'use strict';

const MeowAPI = (() => {

  // ── CONSTANTS ─────────────────────────────
  const JAMENDO_BASE = 'https://api.jamendo.com/v3.0';

  const KEY = {
    JAMENDO_ID: 'meow_jamendo_client_id',
    JAMENDO_ENABLED: 'meow_jamendo_enabled',
  };

  // ── STORAGE ───────────────────────────────
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

  async function _fetchJSON(url) {
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  }

  function getActiveSource() {
    if (_get(KEY.JAMENDO_ENABLED) === 'true' && _get(KEY.JAMENDO_ID)) return 'jamendo';
    return null;
  }

  // ── JAMENDO ───────────────────────────────
  const Jamendo = {

    getClientId() {
      return _get(KEY.JAMENDO_ID);
    },

    save(clientId, enabled) {
      _set(KEY.JAMENDO_ID, _sanitize(clientId));
      _set(KEY.JAMENDO_ENABLED, enabled ? 'true' : 'false');
    },

    async validate(clientId) {
      const id = _sanitize(clientId);
      if (!id) throw new Error('Client ID required');

      const url = `${JAMENDO_BASE}/tracks/?client_id=${id}&limit=1`;
      await _fetchJSON(url);
      return true;
    },

    async search(query, limit = 20) {
      const id = this.getClientId();
      if (!id) throw new Error('Jamendo client_id not set');

      const q = encodeURIComponent(_sanitize(query));
      const url = `${JAMENDO_BASE}/tracks/?client_id=${id}&format=json&limit=${limit}&namesearch=${q}`;

      const data = await _fetchJSON(url);
      return (data.results || []).map(_jamendoToTrack);
    },

    async trending(limit = 20) {
      const id = this.getClientId();
      if (!id) throw new Error('Jamendo client_id not set');

      const url = `${JAMENDO_BASE}/tracks/?client_id=${id}&format=json&limit=${limit}&order=popularity_total`;

      const data = await _fetchJSON(url);
      return (data.results || []).map(_jamendoToTrack);
    },

    async getAlbums(limit = 10) {
      const id = this.getClientId();
      if (!id) throw new Error('Jamendo client_id not set');

      const url = `${JAMENDO_BASE}/albums/?client_id=${id}&format=json&limit=${limit}`;

      const data = await _fetchJSON(url);
      return (data.results || []).map(a => ({
        id: a.id,
        title: a.name,
        artist: a.artist_name,
        thumbnail: a.image,
        type: 'album',
      }));
    }

  };

  // ── MAP FUNCTION ──────────────────────────
  function _jamendoToTrack(item) {
    return {
      id: item.id,
      source: 'jamendo',
      title: item.name,
      artist: item.artist_name,
      album: item.album_name,
      thumbnail: item.image,
      streamUrl: item.audio, // 🔥 DIRECT STREAM LINK
      duration: item.duration,
      jamendoUrl: item.shareurl,
    };
  }

  // ── UNIFIED API ───────────────────────────
  async function search(query) {
    if (!getActiveSource()) throw new Error('NO_API');
    return Jamendo.search(query);
  }

  async function getTrending() {
    if (!getActiveSource()) throw new Error('NO_API');
    return Jamendo.trending();
  }

  async function getAlbums() {
    if (!getActiveSource()) throw new Error('NO_API');
    return Jamendo.getAlbums();
  }

  async function getRecommended() {
    return Jamendo.trending(10);
  }

  return {
    Jamendo,
    getActiveSource,
    search,
    getTrending,
    getAlbums,
    getRecommended,
    KEY,
  };

})();

window.MeowAPI = MeowAPI;
