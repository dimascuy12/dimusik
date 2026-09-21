'use strict';

// ── STATE ──────────────────────────────────────────────────────────────────
const S = {
  currentTrack: null,
  queue: [],
  queueIndex: -1,
  isPlaying: false,
  repeat: 'none', // none | all | one
  shuffle: false,
  favorites: JSON.parse(localStorage.getItem('favs') || '[]'),
  downloads: JSON.parse(localStorage.getItem('downloads') || '[]'),
  recentlyPlayed: JSON.parse(localStorage.getItem('recent') || '[]'),
  globalPool: [],
  isTransitioning: false,
  failStreak: 0,
  indonesiaCache: null,
  chartCache: null,
  theme: localStorage.getItem('theme') || 'dark',
  volume: parseFloat(localStorage.getItem('volume') || '1'),
};

// ── AUDIO ──────────────────────────────────────────────────────────────────
const audio = new Audio();
audio.volume = S.volume;
audio.preload = 'none';

// ── DOM HELPERS ────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

// ── TOAST ──────────────────────────────────────────────────────────────────
function toast(msg, duration = 2500) {
  let t = $('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.style.cssText = `position:fixed;bottom:90px;left:50%;transform:translateX(-50%);
      background:#333;color:#fff;padding:10px 20px;border-radius:20px;
      font-size:13px;z-index:9999;opacity:0;transition:opacity 0.3s;pointer-events:none;
      max-width:80vw;text-align:center;`;
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.opacity = '0'; }, duration);
}

// ── THEME ──────────────────────────────────────────────────────────────────
function applyTheme() {
  document.body.classList.toggle('light', S.theme === 'light');
  const icon = $('themeIcon');
  if (icon) icon.className = S.theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
}
applyTheme();

function toggleTheme() {
  S.theme = S.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('theme', S.theme);
  applyTheme();
}

// ── NAVIGATION ─────────────────────────────────────────────────────────────
function goTo(page) {
  $$('.page').forEach(p => p.classList.remove('active'));
  $$('.nav-btn').forEach(b => b.classList.remove('active'));
  const pg = $(page + 'Page');
  if (pg) pg.classList.add('active');
  const nb = $('nav-' + page);
  if (nb) nb.classList.add('active');
}

// ── SKELETON ───────────────────────────────────────────────────────────────
function showTrackSkeletons(containerId, count = 6) {
  const el = $(containerId);
  if (!el) return;
  el.innerHTML = Array(count).fill(`
    <div class="skeleton-card">
      <div class="skeleton skeleton-img"></div>
      <div class="skeleton skeleton-text"></div>
      <div class="skeleton skeleton-text short"></div>
    </div>`).join('');
}

function showEmpty(containerId, icon, title, sub) {
  const el = $(containerId);
  if (!el) return;
  el.innerHTML = `<div class="empty-state">
    <i class="fas ${icon}"></i>
    <p>${title}</p>
    <small>${sub}</small>
  </div>`;
}

// ── NORMALIZE TRACK ────────────────────────────────────────────────────────
function normalizeTrack(t) {
  return {
    id: t.id,
    title: t.title || 'Unknown',
    artist: typeof t.artist === 'object' ? (t.artist.name || 'Unknown') : (t.artist || 'Unknown'),
    album: typeof t.album === 'object' ? (t.album.title || '') : (t.album || ''),
    cover: (typeof t.album === 'object' ? t.album.cover_big : null) || t.cover || t.cover_big || '',
    duration: t.duration || 0,
    preview: t.preview || '',
  };
}

// ── RENDER TRACK LIST ──────────────────────────────────────────────────────
function renderTrackList(containerId, tracks, horizontal = false) {
  const el = $(containerId);
  if (!el) return;
  if (!tracks || !tracks.length) {
    showEmpty(containerId, 'fa-music', 'Tidak ada lagu', 'Coba yang lain');
    return;
  }
  const normalized = tracks.map(normalizeTrack);
  if (horizontal) {
    el.innerHTML = normalized.map((t, i) => `
      <div class="track-card" onclick="playTrack(${JSON.stringify(JSON.stringify(t))})">
        <div class="track-card-img-wrap">
          <img src="${t.cover || ''}" alt="${t.title}" 
               onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
               loading="lazy"/>
          <div class="img-fallback" style="display:none"><i class="fas fa-music"></i></div>
          <div class="play-overlay"><i class="fas fa-play"></i></div>
        </div>
        <div class="track-card-title">${t.title}</div>
        <div class="track-card-artist">${t.artist}</div>
      </div>`).join('');
  } else {
    el.innerHTML = normalized.map((t, i) => `
      <div class="track-row" onclick="playTrackFromList(${JSON.stringify(JSON.stringify(t))}, '${containerId}', ${i})">
        <div class="track-row-img-wrap">
          <img src="${t.cover || ''}" alt="${t.title}"
               onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
               loading="lazy"/>
          <div class="img-fallback" style="display:none"><i class="fas fa-music"></i></div>
        </div>
        <div class="track-row-info">
          <div class="track-row-title">${t.title}</div>
          <div class="track-row-artist">${t.artist}</div>
        </div>
        <button class="track-menu-btn" onclick="event.stopPropagation();openTrackMenu(${JSON.stringify(JSON.stringify(t))})">
          <i class="fas fa-ellipsis-v"></i>
        </button>
      </div>`).join('');
  }
  // add to global pool
  const ids = new Set(S.globalPool.map(x => x.id));
  normalized.forEach(t => { if (!ids.has(t.id)) S.globalPool.push(t); });
}

function renderTrackCards(containerId, tracks) {
  renderTrackList(containerId, tracks, true);
}

// ── PLAY TRACK ─────────────────────────────────────────────────────────────
function playTrack(trackJson) {
  const t = typeof trackJson === 'string' ? JSON.parse(trackJson) : trackJson;
  const track = normalizeTrack(t);
  _doPlay(track);
}

function playTrackFromList(trackJson, containerId, index) {
  const t = typeof trackJson === 'string' ? JSON.parse(trackJson) : trackJson;
  const track = normalizeTrack(t);
  // build queue from container
  const el = $(containerId);
  if (el) {
    const rows = el.querySelectorAll('.track-row, .track-card');
    // queue is globalPool filtered to tracks in this container — simplified: just use globalPool
  }
  S.queueIndex = index;
  _doPlay(track);
}

function _doPlay(track) {
  S.currentTrack = track;
  S.isTransitioning = false;
  S.failStreak = 0;

  // update recently played
  S.recentlyPlayed = S.recentlyPlayed.filter(x => x.id !== track.id);
  S.recentlyPlayed.unshift(track);
  if (S.recentlyPlayed.length > 50) S.recentlyPlayed.pop();
  localStorage.setItem('recent', JSON.stringify(S.recentlyPlayed));

  // update UI
  updatePlayerUI(track);
  updateMiniPlayer(track);

  // stream
  const url = `/api/stream?title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(track.artist)}`;
  audio.src = url;
  audio.load();
  audio.play().catch(e => {
    console.error('Play error:', e);
    toast('❌ Gagal memutar lagu');
  });
  S.isPlaying = true;
  updatePlayButtons();
}

// ── PLAYER UI ──────────────────────────────────────────────────────────────
function updatePlayerUI(track) {
  const cover = track.cover || '';
  // full player
  const fpCover = $('fpCover');
  const fpBg = $('fpBg');
  const fpTitle = $('fpTitle');
  const fpArtist = $('fpArtist');
  if (fpCover) { fpCover.src = cover; fpCover.onerror = () => { fpCover.style.display='none'; }; }
  if (fpBg) fpBg.style.backgroundImage = `url('${cover}')`;
  if (fpTitle) fpTitle.textContent = track.title;
  if (fpArtist) fpArtist.textContent = track.artist;

  // fav button
  const fpFav = $('fpFav');
  if (fpFav) {
    const isFav = S.favorites.some(f => f.id === track.id);
    fpFav.innerHTML = `<i class="fa${isFav ? 's' : 'r'} fa-heart"></i>`;
    fpFav.style.color = isFav ? '#e91e8c' : '';
  }
}

function updateMiniPlayer(track) {
  const mp = $('miniPlayer');
  const mpCover = $('mpCover');
  const mpTitle = $('mpTitle');
  const mpArtist = $('mpArtist');
  if (mp) mp.style.display = 'flex';
  if (mpCover) { 
    mpCover.src = track.cover || ''; 
    mpCover.onerror = () => { mpCover.style.display='none'; };
  }
  if (mpTitle) mpTitle.textContent = track.title;
  if (mpArtist) mpArtist.textContent = track.artist;
  updatePlayButtons();
}

function updatePlayButtons() {
  const playing = S.isPlaying && !audio.paused;
  $$('.play-btn, #fpPlay, #mpPlay').forEach(btn => {
    if (!btn) return;
    btn.innerHTML = playing 
      ? '<i class="fas fa-pause"></i>' 
      : '<i class="fas fa-play"></i>';
  });
  const mpPlay = $('mpPlay');
  if (mpPlay) mpPlay.innerHTML = playing ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
  const fpPlay = $('fpPlay');
  if (fpPlay) fpPlay.innerHTML = playing ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
}

// ── AUDIO EVENTS ───────────────────────────────────────────────────────────
audio.addEventListener('timeupdate', () => {
  const seekbar = $('fpSeekbar');
  const currentTime = $('fpCurrentTime');
  const duration = $('fpDuration');
  if (!audio.duration) return;
  const pct = (audio.currentTime / audio.duration) * 100;
  if (seekbar) seekbar.value = pct;
  if (currentTime) currentTime.textContent = formatTime(audio.currentTime);
  if (duration) duration.textContent = formatTime(audio.duration);

  // mini seekbar
  const mpSeek = $('mpSeekbar');
  if (mpSeek) mpSeek.style.width = pct + '%';
});

audio.addEventListener('play', () => { S.isPlaying = true; updatePlayButtons(); });
audio.addEventListener('pause', () => { S.isPlaying = false; updatePlayButtons(); });

audio.addEventListener('ended', () => {
  if (S.repeat === 'one') {
    audio.currentTime = 0;
    audio.play();
    return;
  }
  nextTrack();
});

audio.addEventListener('error', (e) => {
  if (S.isTransitioning) return;
  console.error('Audio error:', e);
  S.failStreak++;
  if (S.failStreak >= 4) {
    toast('❌ Terlalu banyak error, berhenti');
    S.failStreak = 0;
    return;
  }
  toast('⚠️ Error, mencoba lagu lain...');
  setTimeout(() => nextTrack(), 1500);
});

// ── NEXT / PREV ────────────────────────────────────────────────────────────
function nextTrack() {
  if (S.isTransitioning) return;
  S.isTransitioning = true;
  setTimeout(() => { S.isTransitioning = false; }, 3000);

  if (S.repeat === 'all' && S.queue.length) {
    S.queueIndex = (S.queueIndex + 1) % S.queue.length;
    _doPlay(S.queue[S.queueIndex]);
    return;
  }
  if (S.queue.length && S.queueIndex < S.queue.length - 1) {
    S.queueIndex++;
    _doPlay(S.queue[S.queueIndex]);
    return;
  }
  // random from global pool
  playRandom();
}

function prevTrack() {
  if (audio.currentTime > 3) {
    audio.currentTime = 0;
    return;
  }
  if (S.queue.length && S.queueIndex > 0) {
    S.queueIndex--;
    _doPlay(S.queue[S.queueIndex]);
    return;
  }
  audio.currentTime = 0;
}

function playRandom() {
  const pool = S.globalPool.filter(t => !S.currentTrack || t.id !== S.currentTrack.id);
  if (!pool.length) {
    toast('Tidak ada lagu lain');
    S.isTransitioning = false;
    return;
  }
  const track = pool[Math.floor(Math.random() * pool.length)];
  _doPlay(track);
}

// ── SEEKBAR ────────────────────────────────────────────────────────────────
function seekTo(val) {
  if (audio.duration) {
    audio.currentTime = (val / 100) * audio.duration;
  }
}

function setVolume(val) {
  S.volume = val;
  audio.volume = val;
  localStorage.setItem('volume', val);
}

// ── FORMAT TIME ────────────────────────────────────────────────────────────
function formatTime(sec) {
  if (!sec || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ── FULL PLAYER ─────────────────────────────────────────────────────────────
function openFullPlayer() {
  const fp = $('fullPlayer');
  if (fp) fp.classList.add('open');
}

function closeFullPlayer() {
  const fp = $('fullPlayer');
  if (fp) fp.classList.remove('open');
}

// ── TOGGLE PLAY ────────────────────────────────────────────────────────────
function togglePlay() {
  if (!S.currentTrack) return;
  if (audio.paused) {
    audio.play().catch(() => toast('❌ Gagal memutar'));
  } else {
    audio.pause();
  }
}

// ── SHUFFLE ────────────────────────────────────────────────────────────────
function toggleShuffle() {
  S.shuffle = !S.shuffle;
  const btn = $('fpShuffle');
  if (btn) btn.style.color = S.shuffle ? '#e91e8c' : '';
  toast(S.shuffle ? '🔀 Acak aktif' : '🔀 Acak nonaktif');
}

// ── REPEAT ─────────────────────────────────────────────────────────────────
function toggleRepeat() {
  const modes = ['none', 'all', 'one'];
  S.repeat = modes[(modes.indexOf(S.repeat) + 1) % modes.length];
  const btn = $('fpRepeat');
  if (btn) {
    btn.style.color = S.repeat !== 'none' ? '#e91e8c' : '';
    btn.innerHTML = S.repeat === 'one' 
      ? '<i class="fas fa-repeat-1"></i>' 
      : '<i class="fas fa-repeat"></i>';
  }
  const labels = { none: 'Ulangi nonaktif', all: 'Ulangi semua', one: 'Ulangi satu' };
  toast(labels[S.repeat]);
}

// ── FAVORITES ──────────────────────────────────────────────────────────────
function toggleFav(track) {
  if (!track) track = S.currentTrack;
  if (!track) return;
  const idx = S.favorites.findIndex(f => f.id === track.id);
  if (idx >= 0) {
    S.favorites.splice(idx, 1);
    toast('💔 Dihapus dari favorit');
  } else {
    S.favorites.unshift(normalizeTrack(track));
    toast('❤️ Ditambahkan ke favorit');
  }
  localStorage.setItem('favs', JSON.stringify(S.favorites));
  if (S.currentTrack && S.currentTrack.id === track.id) {
    updatePlayerUI(S.currentTrack);
  }
  renderFavorites();
}

function renderFavorites() {
  renderTrackList('favList', S.favorites);
  if (!S.favorites.length) showEmpty('favList', 'fa-heart', 'Belum ada favorit', 'Tambahkan lagu ke favorit');
}

// ── DOWNLOADS ──────────────────────────────────────────────────────────────
function downloadTrack(track) {
  if (!track) track = S.currentTrack;
  if (!track) return;
  toast('⬇️ Mengunduh ' + track.title + '...');
  const url = `/api/download?title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(track.artist)}`;
  const a = document.createElement('a');
  a.href = url;
  a.download = `${track.artist} - ${track.title}.mp3`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // save to downloads list
  if (!S.downloads.find(d => d.id === track.id)) {
    S.downloads.unshift(normalizeTrack(track));
    localStorage.setItem('downloads', JSON.stringify(S.downloads));
  }
  renderDownloads();
}

function renderDownloads() {
  renderTrackList('dlList', S.downloads);
  if (!S.downloads.length) showEmpty('dlList', 'fa-download', 'Belum ada unduhan', 'Unduh lagu untuk didengarkan offline');
}

// ── SHARE ──────────────────────────────────────────────────────────────────
function shareTrack(track) {
  if (!track) track = S.currentTrack;
  if (!track) return;
  const text = `🎵 Dengarkan "${track.title}" oleh ${track.artist} di dimusik!`;
  if (navigator.share) {
    navigator.share({ title: track.title, text: text, url: window.location.href });
  } else {
    navigator.clipboard.writeText(text).then(() => toast('📋 Link disalin!'));
  }
}

// ── TRACK MENU ─────────────────────────────────────────────────────────────
function openTrackMenu(trackJson) {
  const track = typeof trackJson === 'string' ? JSON.parse(trackJson) : trackJson;
  const norm = normalizeTrack(track);
  const sheet = $('trackMenuSheet');
  const content = $('trackMenuContent');
  if (!sheet || !content) return;

  const isFav = S.favorites.some(f => f.id === norm.id);
  content.innerHTML = `
    <div class="sheet-track-info">
      <img src="${norm.cover}" onerror="this.style.display='none'" style="width:50px;height:50px;border-radius:8px;object-fit:cover"/>
      <div>
        <div style="font-weight:600;font-size:15px">${norm.title}</div>
        <div style="font-size:13px;opacity:0.7">${norm.artist}</div>
      </div>
    </div>
    <div class="sheet-divider"></div>
    <button class="sheet-btn" onclick="playTrack(${JSON.stringify(JSON.stringify(norm))});closeTrackMenu()">
      <i class="fas fa-play"></i> Putar Sekarang
    </button>
    <button class="sheet-btn" onclick="addToQueue(${JSON.stringify(JSON.stringify(norm))});closeTrackMenu()">
      <i class="fas fa-list"></i> Tambah ke Antrian
    </button>
    <button class="sheet-btn" onclick="toggleFav(${JSON.stringify(JSON.stringify(norm))});closeTrackMenu()">
      <i class="fa${isFav ? 's' : 'r'} fa-heart"></i> ${isFav ? 'Hapus dari Favorit' : 'Tambah ke Favorit'}
    </button>
    <button class="sheet-btn" onclick="downloadTrack(${JSON.stringify(JSON.stringify(norm))});closeTrackMenu()">
      <i class="fas fa-download"></i> Unduh
    </button>
    <button class="sheet-btn" onclick="shareTrack(${JSON.stringify(JSON.stringify(norm))});closeTrackMenu()">
      <i class="fas fa-share-alt"></i> Bagikan
    </button>
  `;
  sheet.classList.add('open');
}

function closeTrackMenu() {
  const sheet = $('trackMenuSheet');
  if (sheet) sheet.classList.remove('open');
}

// ── QUEUE ──────────────────────────────────────────────────────────────────
function addToQueue(trackJson) {
  const track = typeof trackJson === 'string' ? JSON.parse(trackJson) : trackJson;
  const norm = normalizeTrack(track);
  S.queue.push(norm);
  toast('➕ Ditambahkan ke antrian');
  renderQueue();
}

function renderQueue() {
  const el = $('queueList');
  if (!el) return;
  if (!S.queue.length) {
    el.innerHTML = '<div class="empty-state"><i class="fas fa-list"></i><p>Antrian kosong</p></div>';
    return;
  }
  el.innerHTML = S.queue.map((t, i) => `
    <div class="track-row ${i === S.queueIndex ? 'active' : ''}">
      <div class="track-row-img-wrap">
        <img src="${t.cover}" onerror="this.style.display='none'" loading="lazy"/>
      </div>
      <div class="track-row-info">
        <div class="track-row-title">${t.title}</div>
        <div class="track-row-artist">${t.artist}</div>
      </div>
      <button onclick="removeFromQueue(${i})" style="background:none;border:none;color:#e91e8c;padding:8px">
        <i class="fas fa-times"></i>
      </button>
    </div>`).join('');
}

function removeFromQueue(i) {
  S.queue.splice(i, 1);
  if (S.queueIndex >= i) S.queueIndex = Math.max(0, S.queueIndex - 1);
  renderQueue();
}

function openQueue() {
  const sheet = $('queueSheet');
  if (sheet) { sheet.classList.add('open'); renderQueue(); }
}

function closeQueue() {
  const sheet = $('queueSheet');
  if (sheet) sheet.classList.remove('open');
}

// ── SEARCH ─────────────────────────────────────────────────────────────────
let searchTimer = null;
async function doSearch(q) {
  if (!q || q.trim().length < 2) return;
  goTo('search');
  showTrackSkeletons('searchResults');
  try {
    // Filter: musik saja, bukan podcast
    const query = `${q.trim()} music`;
    const r = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=30`);
    const d = await r.json();
    let tracks = (d.data || []).filter(t => {
      // filter out podcasts/episodes
      const title = (t.title || '').toLowerCase();
      const artist = typeof t.artist === 'object' ? (t.artist.name || '') : (t.artist || '');
      return !title.includes('podcast') && !title.includes('episode') && t.duration > 60;
    });
    const ids = new Set(S.globalPool.map(x => x.id));
    tracks.forEach(t => { const n = normalizeTrack(t); if (!ids.has(n.id)) S.globalPool.push(n); });
    renderTrackList('searchResults', tracks);
    if (!tracks.length) showEmpty('searchResults', 'fa-search', 'Tidak ditemukan', 'Coba kata kunci lain');
  } catch(e) {
    toast('❌ Gagal mencari lagu');
    showEmpty('searchResults', 'fa-wifi', 'Koneksi error', 'Periksa koneksi internet');
  }
}

// ── INDONESIA HITS ─────────────────────────────────────────────────────────
const INDO_ARTISTS = [
  'Raim Laode', 'Tulus', 'Bernadya', 'Rizky Febian', 'Raisa',
  'Tiara Andini', 'Nadin Amizah', 'Pamungkas', 'Mahalini', 'Judika',
  'Afgan', 'Isyana Sarasvati', 'Lyodra', 'Yura Yunita', 'Hindia',
  'Fourtwnty', 'Reality Club', 'Danilla', 'Ardhito Pramono', 'Nadhif Basalamah'
];

async function loadIndonesiaHits() {
  if (S.indonesiaCache) {
    renderTrackCards('indonesiaHits', S.indonesiaCache);
    return;
  }
  showTrackSkeletons('indonesiaHits');
  try {
    // Pick 5 random artists and search each
    const picked = [...INDO_ARTISTS].sort(() => Math.random() - 0.5).slice(0, 5);
    const results = await Promise.all(
      picked.map(artist =>
        fetch(`/api/search?q=${encodeURIComponent(artist)}&limit=5`)
          .then(r => r.json())
          .then(d => (d.data || []).filter(t => {
            const artistName = typeof t.artist === 'object' ? (t.artist.name || '') : (t.artist || '');
            // Only include tracks where artist name matches
            return artistName.toLowerCase().includes(artist.toLowerCase().split(' ')[0])
              && t.duration > 60
              && !t.title.toLowerCase().includes('podcast');
          }))
          .catch(() => [])
      )
    );
    const tracks = results.flat().slice(0, 20);
    if (tracks.length) {
      S.indonesiaCache = tracks;
      renderTrackCards('indonesiaHits', tracks);
    } else {
      showEmpty('indonesiaHits', 'fa-music', 'Gagal memuat', 'Coba refresh halaman');
    }
  } catch(e) {
    showEmpty('indonesiaHits', 'fa-wifi', 'Koneksi error', 'Periksa internet');
  }
}

// ── CHART GLOBAL ───────────────────────────────────────────────────────────
async function loadChart() {
  if (S.chartCache) {
    renderTrackCards('chartTracks', S.chartCache);
    return;
  }
  showTrackSkeletons('chartTracks');
  try {
    const r = await fetch('/api/chart?limit=20');
    const d = await r.json();
    const tracks = (d.data || []).filter(t => t.duration > 60);
    if (tracks.length) {
      S.chartCache = tracks;
      renderTrackCards('chartTracks', tracks);
    } else {
      showEmpty('chartTracks', 'fa-fire', 'Gagal memuat chart', 'Coba refresh');
    }
  } catch(e) {
    showEmpty('chartTracks', 'fa-wifi', 'Koneksi error', 'Periksa internet');
  }
}

// ── GENRE ──────────────────────────────────────────────────────────────────
$$('.gpill').forEach(btn => {
  btn.addEventListener('click', async () => {
    $$('.gpill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    goTo('search');
    showTrackSkeletons('searchResults');
    try {
      const genre = btn.dataset.genre;
      const r = await fetch(`/api/search?q=${encodeURIComponent(genre + ' musik indonesia')}&limit=20`);
      const d = await r.json();
      const tracks = (d.data || []).filter(t => t.duration > 60 && !t.title.toLowerCase().includes('podcast'));
      renderTrackList('searchResults', tracks);
      if (!tracks.length) showEmpty('searchResults', 'fa-music', 'Tidak ada lagu', 'Coba genre lain');
    } catch(e) { toast('❌ Gagal memuat genre'); }
  });
});

// ── RECENTLY PLAYED ────────────────────────────────────────────────────────
function renderRecentlyPlayed() {
  renderTrackCards('recentTracks', S.recentlyPlayed.slice(0, 10));
  if (!S.recentlyPlayed.length) {
    showEmpty('recentTracks', 'fa-clock', 'Belum ada riwayat', 'Putar lagu untuk memulai');
  }
}

// ── SEE ALL ────────────────────────────────────────────────────────────────
function seeAll(section) {
  goTo('search');
  showTrackSkeletons('searchResults');
  if (section === 'indonesia') {
    if (S.indonesiaCache) renderTrackList('searchResults', S.indonesiaCache);
    else loadIndonesiaHits().then(() => { if (S.indonesiaCache) renderTrackList('searchResults', S.indonesiaCache); });
  } else if (section === 'chart') {
    if (S.chartCache) renderTrackList('searchResults', S.chartCache);
    else loadChart().then(() => { if (S.chartCache) renderTrackList('searchResults', S.chartCache); });
  }
}

// ── HERO BUTTON ────────────────────────────────────────────────────────────
function playHero() {
  if (S.globalPool.length) {
    playRandom();
  } else {
    toast('⏳ Memuat lagu...');
    setTimeout(() => { if (S.globalPool.length) playRandom(); }, 2000);
  }
}

// ── EVENT LISTENERS ────────────────────────────────────────────────────────
// Search input
const searchInput = $('searchInput');
if (searchInput) {
  searchInput.addEventListener('input', e => {
    clearTimeout(searchTimer);
    const q = e.target.value.trim();
    if (q.length >= 2) {
      searchTimer = setTimeout(() => doSearch(q), 500);
    }
  });
  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      clearTimeout(searchTimer);
      doSearch(searchInput.value.trim());
    }
  });
}

// Search icon in header
const searchIcon = $('searchIcon');
if (searchIcon) searchIcon.addEventListener('click', () => {
  goTo('search');
  setTimeout(() => searchInput && searchInput.focus(), 100);
});

// Nav buttons
const navBeranda = $('nav-beranda');
const navCari = $('nav-cari');
const navFavorit = $('nav-favorit');
const navUnduhan = $('nav-unduhan');

if (navBeranda) navBeranda.addEventListener('click', () => goTo('beranda'));
if (navCari) navCari.addEventListener('click', () => { goTo('search'); setTimeout(() => searchInput && searchInput.focus(), 100); });
if (navFavorit) navFavorit.addEventListener('click', () => { goTo('favorit'); renderFavorites(); });
if (navUnduhan) navUnduhan.addEventListener('click', () => { goTo('unduhan'); renderDownloads(); });

// Mini player
const miniPlayer = $('miniPlayer');
if (miniPlayer) miniPlayer.addEventListener('click', e => {
  if (e.target.closest('#mpPlay') || e.target.closest('#mpNext')) return;
  openFullPlayer();
});

const mpPlay = $('mpPlay');
if (mpPlay) mpPlay.addEventListener('click', e => { e.stopPropagation(); togglePlay(); });

const mpNext = $('mpNext');
if (mpNext) mpNext.addEventListener('click', e => { e.stopPropagation(); nextTrack(); });

// Full player controls
const fpPlay = $('fpPlay');
if (fpPlay) fpPlay.addEventListener('click', togglePlay);

const fpPrev = $('fpPrev');
if (fpPrev) fpPrev.addEventListener('click', prevTrack);

const fpNext = $('fpNext');
if (fpNext) fpNext.addEventListener('click', nextTrack);

const fpShuffle = $('fpShuffle');
if (fpShuffle) fpShuffle.addEventListener('click', toggleShuffle);

const fpRepeat = $('fpRepeat');
if (fpRepeat) fpRepeat.addEventListener('click', toggleRepeat);

const fpFav = $('fpFav');
if (fpFav) fpFav.addEventListener('click', () => toggleFav(S.currentTrack));

const fpDownload = $('fpDownload');
if (fpDownload) fpDownload.addEventListener('click', () => downloadTrack(S.currentTrack));

const fpShare = $('fpShare');
if (fpShare) fpShare.addEventListener('click', () => shareTrack(S.currentTrack));

const fpQueue = $('fpQueue');
if (fpQueue) fpQueue.addEventListener('click', openQueue);

const fpClose = $('fpClose');
if (fpClose) fpClose.addEventListener('click', closeFullPlayer);

const fpSeekbar = $('fpSeekbar');
if (fpSeekbar) fpSeekbar.addEventListener('input', e => seekTo(e.target.value));

const fpVolume = $('fpVolume');
if (fpVolume) { 
  fpVolume.value = S.volume; 
  fpVolume.addEventListener('input', e => setVolume(parseFloat(e.target.value)));
}

const themeBtn = $('themeBtn');
if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

// Close sheets on backdrop click
$$('.sheet-backdrop').forEach(el => {
  el.addEventListener('click', () => {
    closeTrackMenu();
    closeQueue();
  });
});

// ── INIT ───────────────────────────────────────────────────────────────────
async function init() {
  goTo('beranda');
  renderRecentlyPlayed();
  await Promise.all([loadIndonesiaHits(), loadChart()]);
}

init();
