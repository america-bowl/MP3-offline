(function () {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const audio = $('#audio');
  const el = {
    onlineDot: $('#onlineDot'), onlineText: $('#onlineText'),
    searchForm: $('#searchForm'), searchInput: $('#searchInput'), searchButton: $('#searchButton'),
    searchMessage: $('#searchMessage'), searchResults: $('#searchResults'),
    fileInput: $('#fileInput'), addButton: $('#addButton'), clearButton: $('#clearButton'),
    trackList: $('#trackList'), emptyMessage: $('#emptyMessage'), trackCount: $('#trackCount'),
    nowTitle: $('#nowTitle'), nowMeta: $('#nowMeta'),
    previousButton: $('#previousButton'), nextButton: $('#nextButton'), repeatButton: $('#repeatButton')
  };

  const DB_NAME = 'offline-music-library';
  const STORE_NAME = 'tracks';
  let dbPromise;
  let tracks = [];
  let currentId = null;
  let repeatOne = false;
  let statusTimer;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) { reject(new Error('このブラウザは保存に対応してへん')); return; }
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('保存領域を開けへん'));
    });
    return dbPromise;
  }

  async function storeRequest(mode, action) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      let request;
      try { request = action(store); } catch (e) { reject(e); return; }
      let result;
      if (request) {
        request.onsuccess = () => { result = request.result; };
        request.onerror = () => reject(request.error || new Error('保存処理に失敗'));
      }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || new Error('保存処理に失敗'));
      tx.onabort = () => reject(tx.error || new Error('保存容量が足りない可能性がある'));
    });
  }

  function showMessage(target, text, isError) {
    target.textContent = text || '';
    target.classList.toggle('error', !!isError);
    clearTimeout(statusTimer);
    if (target === el.searchMessage && text) {
      statusTimer = setTimeout(() => { target.textContent = ''; target.classList.remove('error'); }, 8000);
    }
  }

  function formatTime(value) {
    if (!Number.isFinite(value) || value < 0) return '--:--';
    const seconds = Math.floor(value);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const rest = String(seconds % 60).padStart(2, '0');
    return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
  }

  function makeId() {
    return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `track-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function cleanName(name) {
    return String(name || '').replace(/\.[^.]+$/, '').trim() || '名前のない曲';
  }

  function trackById(id) { return tracks.find((track) => track.id === id) || null; }

  function updateConnection() {
    const online = navigator.onLine;
    el.onlineText.textContent = online ? 'オンライン' : 'オフライン';
    el.onlineDot.classList.toggle('on', online);
    el.onlineDot.classList.toggle('off', !online);
    el.searchButton.disabled = !online;
    if (!online) showMessage(el.searchMessage, 'オフラインやから検索は使えへん。保存済みの曲は再生できるで。', false);
  }

  function renderPlayer() {
    const track = trackById(currentId);
    if (!track) {
      el.nowTitle.textContent = '曲を選んでください';
      el.nowMeta.textContent = '曲を追加すると、ここに表示されます';
      if (audio.src) audio.removeAttribute('src');
      audio.load();
      el.previousButton.disabled = true;
      el.nextButton.disabled = true;
      el.repeatButton.disabled = true;
      el.repeatButton.textContent = 'くり返し: オフ';
      el.repeatButton.setAttribute('aria-pressed', 'false');
      return;
    }
    el.nowTitle.textContent = track.title;
    el.nowMeta.textContent = `${track.type || '音声ファイル'}${track.duration ? ` ・ ${formatTime(track.duration)}` : ''}`;
    el.previousButton.disabled = tracks.length < 2;
    el.nextButton.disabled = tracks.length < 2;
    el.repeatButton.disabled = false;
    el.repeatButton.textContent = `くり返し: ${repeatOne ? '1曲' : 'オフ'}`;
    el.repeatButton.setAttribute('aria-pressed', String(repeatOne));
  }

  function renderTracks() {
    el.trackList.replaceChildren();
    const fragment = document.createDocumentFragment();
    tracks.forEach((track, index) => {
      const row = document.createElement('li');
      row.className = 'track-row' + (track.id === currentId ? ' current' : '');

      const number = document.createElement('span');
      number.className = 'track-number';
      number.textContent = String(index + 1);

      const body = document.createElement('div');
      const play = document.createElement('button');
      play.type = 'button';
      play.className = 'track-name';
      play.textContent = track.title;
      play.setAttribute('aria-label', `${track.title} を再生`);
      play.addEventListener('click', () => playTrack(track.id, true));

      const info = document.createElement('div');
      info.className = 'track-info';
      info.textContent = `${track.duration ? formatTime(track.duration) + ' ・ ' : ''}${track.type || '音声ファイル'}`;
      body.append(play, info);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'button remove-button';
      remove.textContent = '×';
      remove.title = '曲をリストから削除';
      remove.setAttribute('aria-label', `${track.title} を削除`);
      remove.addEventListener('click', () => removeTrack(track.id));

      row.append(number, body, remove);
      fragment.appendChild(row);
    });
    el.trackList.appendChild(fragment);
    el.trackCount.textContent = `${tracks.length}曲`;
    el.emptyMessage.hidden = tracks.length > 0;
    el.clearButton.disabled = tracks.length === 0;
    renderPlayer();
  }

  async function playTrack(id, autoplay) {
    const track = trackById(id);
    if (!track) return;
    currentId = track.id;
    audio.src = track.url;
    renderTracks();
    if (autoplay) {
      try { await audio.play(); }
      catch (_) { showMessage(el.searchMessage, '再生できへんかった。ファイル形式を確かめてな。', true); }
    }
  }

  function stepTrack(delta) {
    if (tracks.length < 2) return;
    const currentIndex = tracks.findIndex((track) => track.id === currentId);
    const base = currentIndex < 0 ? 0 : currentIndex;
    const nextIndex = (base + delta + tracks.length) % tracks.length;
    playTrack(tracks[nextIndex].id, true);
  }

  async function addFiles(fileList) {
    const files = Array.from(fileList || []).filter((file) => file.type.startsWith('audio/') || /\.(mp3|m4a|aac|ogg|opus|wav|flac)$/i.test(file.name));
    if (!files.length) { showMessage(el.searchMessage, '音楽ファイルが見つからんかった。', true); return; }
    try {
      const now = Date.now();
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const record = {
          id: makeId(), name: file.name, title: cleanName(file.name), type: file.type || '音声ファイル',
          blob: file, duration: 0, addedAt: now + i
        };
        await storeRequest('readwrite', (store) => store.put(record));
        record.url = URL.createObjectURL(record.blob);
        tracks.push(record);
      }
      if (!currentId && tracks.length) await playTrack(tracks[0].id, false);
      renderTracks();
      showMessage(el.searchMessage, `${files.length}曲をこの端末に保存したで。次からオフラインでも再生できるで。`, false);
      if (navigator.storage && navigator.storage.persist) {
        try { await navigator.storage.persist(); } catch (_) { /* 対応せん環境もある */ }
      }
      probeDurations();
    } catch (error) {
      showMessage(el.searchMessage, '保存できへんかった。端末の空き容量か学校のブラウザ設定を確認してな。', true);
    }
  }

  async function removeTrack(id) {
    const track = trackById(id);
    if (!track) return;
    const index = tracks.findIndex((item) => item.id === id);
    if (id === currentId) {
      if (tracks.length > 1) {
        const next = tracks[(index + 1) % tracks.length];
        currentId = next.id;
        audio.src = next.url;
        audio.pause();
      } else {
        currentId = null;
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      }
    }
    try { await storeRequest('readwrite', (store) => store.delete(id)); } catch (_) {}
    try { URL.revokeObjectURL(track.url); } catch (_) {}
    tracks = tracks.filter((item) => item.id !== id);
    renderTracks();
  }

  async function clearLibrary() {
    if (!tracks.length || !window.confirm('保存した曲のリストを空にするで。ええ？')) return;
    try { await storeRequest('readwrite', (store) => store.clear()); } catch (_) {}
    tracks.forEach((track) => { try { URL.revokeObjectURL(track.url); } catch (_) {} });
    tracks = [];
    currentId = null;
    renderTracks();
  }

  function probeDurations() {
    tracks.filter((track) => !track.duration).forEach((track) => {
      const probe = new Audio();
      const finish = async () => {
        if (Number.isFinite(probe.duration) && probe.duration > 0) {
          track.duration = probe.duration;
          try { await storeRequest('readwrite', (store) => store.put({
            id: track.id, name: track.name, title: track.title, type: track.type,
            blob: track.blob, duration: track.duration, addedAt: track.addedAt
          })); } catch (_) {}
          renderTracks();
        }
        probe.removeAttribute('src');
      };
      probe.addEventListener('loadedmetadata', finish, { once: true });
      probe.addEventListener('error', () => probe.removeAttribute('src'), { once: true });
      probe.src = track.url;
    });
  }

  function videoUrl(id) { return `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`; }

  function renderSearchResults(items) {
    el.searchResults.replaceChildren();
    const fragment = document.createDocumentFragment();
    items.forEach((item) => {
      const li = document.createElement('li');
      li.className = 'search-result';
      const body = document.createElement('div');
      const titleLink = document.createElement('a');
      titleLink.className = 'result-title';
      titleLink.href = videoUrl(item.videoId);
      titleLink.target = '_blank';
      titleLink.rel = 'noopener noreferrer';
      titleLink.textContent = item.title || 'タイトル不明';
      const channel = document.createElement('span');
      channel.className = 'result-meta';
      channel.textContent = item.channelTitle || 'チャンネル名なし';
      const url = document.createElement('span');
      url.className = 'result-url';
      url.textContent = videoUrl(item.videoId);
      body.append(titleLink, channel, url);

      const actions = document.createElement('div');
      actions.className = 'result-actions';
      const open = document.createElement('a');
      open.href = videoUrl(item.videoId);
      open.target = '_blank';
      open.rel = 'noopener noreferrer';
      open.textContent = 'YouTubeで見る';
      actions.appendChild(open);
      li.append(body, actions);
      fragment.appendChild(li);
    });
    el.searchResults.appendChild(fragment);
  }

  async function searchYouTube(query) {
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
      method: 'GET', headers: { 'Accept': 'application/json' }, cache: 'no-store'
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `検索に失敗した（${response.status}）`);
    return Array.isArray(data.items) ? data.items : [];
  }

  el.searchForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const query = el.searchInput.value.trim();
    if (!query) { showMessage(el.searchMessage, '曲名かアーティスト名を入れてな。', true); return; }
    if (!navigator.onLine) { showMessage(el.searchMessage, 'オフラインやから検索は使えへん。', true); return; }
    el.searchButton.disabled = true;
    el.searchResults.replaceChildren();
    showMessage(el.searchMessage, '検索中…', false);
    try {
      const items = await searchYouTube(query);
      renderSearchResults(items);
      showMessage(el.searchMessage, items.length ? `${items.length}件見つかったで。` : '見つからんかった。別の言葉でも試してな。', false);
    } catch (error) {
      showMessage(el.searchMessage, error.message || '検索できへんかった。ネットワーク設定を確認してな。', true);
    } finally {
      el.searchButton.disabled = !navigator.onLine;
    }
  });

  el.addButton.addEventListener('click', () => el.fileInput.click());
  el.fileInput.addEventListener('change', () => {
    if (el.fileInput.files && el.fileInput.files.length) addFiles(el.fileInput.files);
    el.fileInput.value = '';
  });
  el.clearButton.addEventListener('click', clearLibrary);
  el.previousButton.addEventListener('click', () => stepTrack(-1));
  el.nextButton.addEventListener('click', () => stepTrack(1));
  el.repeatButton.addEventListener('click', () => {
    repeatOne = !repeatOne;
    audio.loop = repeatOne;
    renderPlayer();
  });
  audio.addEventListener('ended', () => { if (!repeatOne) stepTrack(1); });
  audio.addEventListener('loadedmetadata', () => {
    const track = trackById(currentId);
    if (track && Number.isFinite(audio.duration) && audio.duration > 0) {
      track.duration = audio.duration;
      renderTracks();
    }
  });

  async function restoreLibrary() {
    try {
      const records = await storeRequest('readonly', (store) => store.getAll());
      tracks = (records || []).sort((a, b) => a.addedAt - b.addedAt).map((record) => ({
        ...record, url: URL.createObjectURL(record.blob)
      }));
      renderTracks();
      if (tracks.length) await playTrack(tracks[0].id, false);
      renderTracks();
    } catch (_) {
      showMessage(el.searchMessage, 'このブラウザでは曲を保存できへんみたいや。', true);
    }
  }

  window.addEventListener('online', updateConnection);
  window.addEventListener('offline', updateConnection);
  updateConnection();
  restoreLibrary();

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // ページ再生は続行。初回のオンライン利用後にもう一度開いてみてな。
      });
    });
  }
})();
