'use strict';

// ── STATE ────────────────────────────────────────────────────────────────────
const S = {
  track: null,
  queue: [],
  qi: -1,
  repeat: 'none',
  shuffle: false,
  favs: JSON.parse(localStorage.getItem('favs') || '[]'),
  dls: JSON.parse(localStorage.getItem('dls') || '[]'),
  recent: JSON.parse(localStorage.getItem('recent') || '[]'),
  pool: [],
  trans: false,
  fails: 0,
  indoCache: null,
  chartCache: null,
  theme: localStorage.getItem('theme') || 'dark',
  vol: parseFloat(localStorage.getItem('vol') || '1'),
  sleepTimer: null,
  sleepEnd: null,
};

// ── AUDIO ────────────────────────────────────────────────────────────────────
const AUD = new Audio();
AUD.volume = S.vol;
AUD.preload = 'none';

// ── UTILS ────────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const fmt = s => {
  if (!s || isNaN(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = String(Math.floor(s % 60)).padStart(2, '0');
  return `${m}:${sec}`;
};
const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const norm = t => {
  const artist = typeof t.artist === 'object' ? (t.artist?.name || 'Unknown') : (t.artist || 'Unknown');
  const album = typeof t.album === 'object' ? (t.album?.title || '') : (t.album || '');
  const cover = (typeof t.album === 'object' ? t.album?.cover_big : null) || t.cover || t.cover_big || '';
  return { id: t.id, title: t.title || 'Unknown', artist, album, cover, duration: t.duration || 0 };
};
const addPool = list => {
  const ids = new Set(S.pool.map(x => x.id));
  list.forEach(t => { if (!ids.has(t.id)) { S.pool.push(t); ids.add(t.id); } });
};

// ── TOAST ────────────────────────────────────────────────────────────────────
let toastTimer;
function toast(msg) {
  const el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.opacity = '0'; }, 2500);
}

// ── THEME ────────────────────────────────────────────────────────────────────
function applyTheme() {
  document.body.classList.toggle('light', S.theme === 'light');
  const ic = $('themeIcon');
  if (ic) ic.className = S.theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
}
function toggleTheme() {
  S.theme = S.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('theme', S.theme);
  applyTheme();
}
applyTheme();

// ── GREETING ─────────────────────────────────────────────────────────────────
function setGreeting() {
  const h = new Date().getHours();
  const el = $('heroGreeting');
  if (!el) return;
  if (h < 12) el.textContent = '🌅 Selamat pagi';
  else if (h < 15) el.textContent = '☀️ Selamat siang';
  else if (h < 18) el.textContent = '🌤️ Selamat sore';
  else el.textContent = '🌙 Selamat malam';
}

// ── NAV ──────────────────────────────────────────────────────────────────────
function goTo(pg) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const p = $('pg-' + pg);
  if (p) p.classList.add('active');
  const b = $('nb-' + pg);
  if (b) b.classList.add('active');
}
function goSearch() {
  goTo('cari');
  setTimeout(() => { const si = $('searchInput'); if (si) si.focus(); }, 150);
}

// ── SKELETON ─────────────────────────────────────────────────────────────────
function skelCards(id, n = 5) {
  const el = $(id);
  if (!el) return;
  el.innerHTML = Array(n).fill(`
    <div class="skel-card">
      <div class="skel skel-sq"></div>
      <div class="skel skel-line" style="width:85%"></div>
      <div class="skel skel-line" style="width:60%"></div>
    </div>`).join('');
}

// ── RENDER CARDS ─────────────────────────────────────────────────────────────
function renderCards(id, tracks) {
  const el = $(id);
  if (!el) return;
  const list = tracks.map(norm);
  addPool(list);
  if (!list.length) {
    el.innerHTML = '<div class="empty" style="padding:16px 0"><i class="fas fa-music"></i><p>Tidak ada lagu</p></div>';
    return;
  }
  el.innerHTML = list.map(t => {
    const tj = JSON.stringify(JSON.stringify(t));
    return `<div class="card" onclick='playT(${tj})'>
      <div class="card-img">
        ${t.cover
          ? `<img src="${esc(t.cover)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/>
             <div class="card-icon" style="display:none"><i class="fas fa-music"></i></div>`
          : `<div class="card-icon"><i class="fas fa-music"></i></div>`
        }
        <div class="card-play-overlay"><i class="fas fa-play"></i></div>
      </div>
      <div class="card-title">${esc(t.title)}</div>
      <div class="card-artist">${esc(t.artist)}</div>
    </div>`;
  }).join('');
}

// ── RENDER ROWS ──────────────────────────────────────────────────────────────
function renderRows(id, tracks, showNum = false) {
  const el = $(id);
  if (!el) return;
  const list = tracks.map(norm);
  addPool(list);
  if (!list.length) {
    el.innerHTML = '<div class="empty"><i class="fas fa-music"></i><p>Tidak ada lagu</p><small>Coba kata kunci lain</small></div>';
    return;
  }
  el.innerHTML = list.map((t, i) => {
    const tj = JSON.stringify(JSON.stringify(t));
    const isPlaying = S.track && S.track.id === t.id;
    return `<div class="trow${isPlaying ? ' playing' : ''}" onclick='playTFromList(${tj},"${id}",${i})'>
      ${showNum ? `<div class="trow-num">${isPlaying ? '<i class="fas fa-volume-up" style="font-size:11px;color:var(--accent)"></i>' : i + 1}</div>` : ''}
      <div class="trow-img">
        ${t.cover
          ? `<img src="${esc(t.cover)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/>
             <div class="trow-icon" style="display:none"><i class="fas fa-music"></i></div>`
          : `<div class="trow-icon"><i class="fas fa-music"></i></div>`
        }
      </div>
      <div class="trow-info">
        <div class="trow-t">${esc(t.title)}</div>
        <div class="trow-a">${esc(t.artist)}</div>
      </div>
      ${t.duration ? `<div class="trow-dur">${fmt(t.duration)}</div>` : ''}
      <button class="trow-menu" onclick='event.stopPropagation();openMenu(${tj})'><i class="fas fa-ellipsis-vertical"></i></button>
    </div>`;
  }).join('');
}

// ── PLAY ─────────────────────────────────────────────────────────────────────
function playT(tj) {
  const t = typeof tj === 'string' ? JSON.parse(tj) : tj;
  _play(norm(t));
}

function playTFromList(tj, listId, idx) {
  const t = typeof tj === 'string' ? JSON.parse(tj) : tj;
  const nt = norm(t);
  // Build queue from pool items visible in this list
  const el = $(listId);
  if (el) {
    const rows = el.querySelectorAll('.trow');
    if (rows.length > 0) {
      // Use global pool filtered to tracks in this render — simplified
    }
  }
  S.qi = idx;
  _play(nt);
}

function _play(t) {
  S.track = t;
  S.trans = false;
  S.fails = 0;

  // Recently played
  S.recent = S.recent.filter(x => x.id !== t.id);
  S.recent.unshift(t);
  if (S.recent.length > 30) S.recent.pop();
  localStorage.setItem('recent', JSON.stringify(S.recent));
  renderRecent();

  updateFPUI(t);
  updateMP(t);

  // Stream with retry — use track title + artist for accurate search
  const url = `/api/stream?title=${encodeURIComponent(t.title)}&artist=${encodeURIComponent(t.artist)}`;
  AUD.src = url;
  AUD.load();
  AUD.play().catch(e => {
    console.error('Play error:', e);
    toast('❌ Gagal memutar, coba lagi');
  });

  // Update queue next display
  updateQueueNext();
}

function updateFPUI(t) {
  const cover = t.cover || '';
  $('fp-bg').style.backgroundImage = cover ? `url('${esc(cover)}')` : '';
  const img = $('fpImg');
  if (img) { img.style.display = cover ? 'block' : 'none'; img.src = cover; }
  $('fpTitle').textContent = t.title;
  $('fpArtist').textContent = t.artist;
  const albumEl = $('fpAlbum');
  if (albumEl) albumEl.textContent = t.album || '';
  updateFavBtn();
}

function updateFavBtn() {
  const t = S.track;
  const fav = t && S.favs.some(f => f.id === t.id);
  const fpFav = $('fpFav');
  if (fpFav) {
    fpFav.innerHTML = `<i class="fa${fav ? 's' : 'r'} fa-heart"></i>`;
    fpFav.classList.toggle('active', fav);
  }
  const mpFav = $('mpFav');
  if (mpFav) {
    mpFav.innerHTML = `<i class="fa${fav ? 's' : 'r'} fa-heart" style="font-size:16px;${fav ? 'color:var(--accent)' : ''}"></i>`;
  }
}

function updateMP(t) {
  $('miniPlayer').style.display = 'flex';
  const img = $('mpImg');
  if (img) {
    img.style.display = t.cover ? 'block' : 'none';
    img.src = t.cover || '';
  }
  $('mpTitle').textContent = t.title;
  $('mpArtist').textContent = t.artist;
  updatePlayUI();
  updateFavBtn();
}

function updatePlayUI() {
  const pl = !AUD.paused;
  const ic = `<i class="fas fa-${pl ? 'pause' : 'play'}"></i>`;
  const mpPlay = $('mpPlay');
  if (mpPlay) mpPlay.innerHTML = ic;
  const fpPlay = $('fpPlayBtn');
  if (fpPlay) fpPlay.innerHTML = ic;
}

function updateQueueNext() {
  const el = $('fpQueueNext');
  if (!el) return;
  const next = S.queue[S.qi + 1];
  el.textContent = next ? `${next.title} — ${next.artist}` : 'Lagu acak berikutnya';
}

// ── AUDIO EVENTS ─────────────────────────────────────────────────────────────
AUD.addEventListener('play', updatePlayUI);
AUD.addEventListener('pause', updatePlayUI);

AUD.addEventListener('timeupdate', () => {
  if (!AUD.duration) return;
  const p = (AUD.currentTime / AUD.duration) * 100;
  const seek = $('fpSeek');
  if (seek) seek.value = p;
  const cur = $('fpCur');
  if (cur) cur.textContent = fmt(AUD.currentTime);
  const dur = $('fpDur');
  if (dur) dur.textContent = fmt(AUD.duration);
  const prog = $('mpProg');
  if (prog) prog.style.width = p + '%';

  // Sleep timer check
  if (S.sleepEnd && Date.now() >= S.sleepEnd) {
    AUD.pause();
    S.sleepEnd = null;
    clearInterval(S.sleepTimer);
    S.sleepTimer = null;
    toast('😴 Timer tidur selesai');
  }
});

AUD.addEventListener('ended', () => {
  if (S.repeat === 'one') { AUD.currentTime = 0; AUD.play(); return; }
  nextTrack();
});

AUD.addEventListener('error', () => {
  if (S.trans) return;
  S.fails++;
  if (S.fails >= 4) {
    toast('❌ Terlalu banyak error, berhenti');
    S.fails = 0;
    return;
  }
  toast('⚠️ Error streaming, mencoba lagu lain...');
  setTimeout(() => nextTrack(), 1500);
});

// ── CONTROLS ─────────────────────────────────────────────────────────────────
function togglePlay() {
  if (!S.track) { toast('Pilih lagu terlebih dahulu'); return; }
  AUD.paused ? AUD.play().catch(() => {}) : AUD.pause();
}

function nextTrack() {
  if (S.trans) return;
  S.trans = true;
  setTimeout(() => S.trans = false, 3000);
  if (S.repeat === 'all' && S.queue.length) {
    S.qi = (S.qi + 1) % S.queue.length;
    _play(S.queue[S.qi]);
    return;
  }
  if (S.queue.length && S.qi < S.queue.length - 1) {
    S.qi++;
    _play(S.queue[S.qi]);
    return;
  }
  if (S.shuffle) {
    playRandom();
  } else {
    playRandom();
  }
}

function prevTrack() {
  if (AUD.currentTime > 3) { AUD.currentTime = 0; return; }
  if (S.queue.length && S.qi > 0) { S.qi--; _play(S.queue[S.qi]); return; }
  AUD.currentTime = 0;
}

function playRandom() {
  const pool = S.pool.filter(t => !S.track || t.id !== S.track.id);
  if (!pool.length) { toast('Tidak ada lagu lain di pool'); S.trans = false; return; }
  _play(pool[Math.floor(Math.random() * pool.length)]);
}

function seekTo(v) {
  if (AUD.duration) AUD.currentTime = (v / 100) * AUD.duration;
}

function setVol(v) {
  S.vol = parseFloat(v);
  AUD.volume = S.vol;
  localStorage.setItem('vol', v);
}

function toggleShuffle() {
  S.shuffle = !S.shuffle;
  $('fpShuffle').classList.toggle('active', S.shuffle);
  toast(S.shuffle ? '🔀 Acak aktif' : '🔀 Acak nonaktif');
}

function toggleRepeat() {
  const modes = ['none', 'all', 'one'];
  S.repeat = modes[(modes.indexOf(S.repeat) + 1) % modes.length];
  const btn = $('fpRepeat');
  btn.classList.toggle('active', S.repeat !== 'none');
  btn.innerHTML = S.repeat === 'one' ? '<i class="fas fa-repeat-1"></i>' : '<i class="fas fa-repeat"></i>';
  const labels = { none: '🔁 Ulangi nonaktif', all: '🔁 Ulangi semua', one: '🔂 Ulangi satu lagu' };
  toast(labels[S.repeat]);
}

// ── FULL PLAYER ───────────────────────────────────────────────────────────────
function openFP() { $('fullPlayer').classList.add('open'); }
function closeFP() { $('fullPlayer').classList.remove('open'); }

// ── HERO BUTTONS ──────────────────────────────────────────────────────────────
function playHero() {
  if (S.pool.length) playRandom();
  else { toast('⏳ Sedang memuat lagu...'); }
}

function playIndoRandom() {
  const indo = S.indoCache;
  if (indo && indo.length) {
    const t = indo[Math.floor(Math.random() * indo.length)];
    _play(t);
  } else {
    toast('⏳ Indonesia Hits sedang dimuat...');
  }
}

// ── MOOD ─────────────────────────────────────────────────────────────────────
async function playMood(query) {
  toast('🎵 Memuat lagu sesuai mood...');
  try {
    const r = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=20`);
    const d = await r.json();
    const tracks = (d.data || []).filter(t => t.duration > 60).map(norm);
    if (tracks.length) {
      addPool(tracks);
      _play(tracks[Math.floor(Math.random() * tracks.length)]);
    } else {
      toast('❌ Tidak ada lagu ditemukan');
    }
  } catch (e) {
    toast('❌ Koneksi error');
  }
}

// ── FAVORITES ────────────────────────────────────────────────────────────────
function toggleFav(tj) {
  const t = tj ? (typeof tj === 'string' ? JSON.parse(tj) : tj) : S.track;
  if (!t) { toast('Tidak ada lagu yang diputar'); return; }
  const nt = norm(t);
  const idx = S.favs.findIndex(f => f.id === nt.id);
  if (idx >= 0) { S.favs.splice(idx, 1); toast('💔 Dihapus dari favorit'); }
  else { S.favs.unshift(nt); toast('❤️ Ditambah ke favorit'); }
  localStorage.setItem('favs', JSON.stringify(S.favs));
  if (S.track && S.track.id === nt.id) updateFavBtn();
  renderFavs();
}

function renderFavs() {
  const header = $('favHeader');
  const count = $('favCount');
  if (S.favs.length) {
    if (header) header.style.display = 'flex';
    if (count) count.textContent = `${S.favs.length} lagu`;
    renderRows('favResults', S.favs, true);
  } else {
    if (header) header.style.display = 'none';
    $('favResults').innerHTML = '<div class="empty"><i class="fas fa-heart"></i><p>Belum ada favorit</p><small>Ketuk ikon hati pada lagu</small></div>';
  }
}

function shuffleFavs() {
  if (!S.favs.length) { toast('Belum ada favorit'); return; }
  const shuffled = [...S.favs].sort(() => Math.random() - 0.5);
  S.queue = shuffled;
  S.qi = 0;
  S.shuffle = true;
  _play(S.queue[0]);
  toast('🔀 Memutar favorit secara acak');
}

function playAllFavs() {
  if (!S.favs.length) return;
  S.queue = [...S.favs];
  S.qi = 0;
  _play(S.queue[0]);
  toast('▶️ Memutar semua favorit');
}

// ── DOWNLOADS ────────────────────────────────────────────────────────────────
function dlTrack(tj) {
  const t = tj ? (typeof tj === 'string' ? JSON.parse(tj) : tj) : S.track;
  if (!t) { toast('Tidak ada lagu yang diputar'); return; }
  const nt = norm(t);
  toast('⬇️ Mengunduh ' + nt.title + '...');
  const a = document.createElement('a');
  a.href = `/api/download?title=${encodeURIComponent(nt.title)}&artist=${encodeURIComponent(nt.artist)}`;
  a.download = `${nt.artist} - ${nt.title}.mp3`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  if (!S.dls.find(d => d.id === nt.id)) {
    S.dls.unshift(nt);
    localStorage.setItem('dls', JSON.stringify(S.dls));
  }
  renderDls();
}

function renderDls() {
  const header = $('dlHeader');
  const count = $('dlCount');
  if (S.dls.length) {
    if (header) header.style.display = 'flex';
    if (count) count.textContent = `${S.dls.length} lagu`;
    renderRows('dlResults', S.dls, true);
  } else {
    if (header) header.style.display = 'none';
    $('dlResults').innerHTML = '<div class="empty"><i class="fas fa-download"></i><p>Belum ada unduhan</p><small>Unduh lagu untuk didengarkan offline</small></div>';
  }
}

function clearDls() {
  if (!S.dls.length) return;
  S.dls = [];
  localStorage.setItem('dls', JSON.stringify(S.dls));
  renderDls();
  toast('🗑️ Semua unduhan dihapus dari daftar');
}

function playAllDls() {
  if (!S.dls.length) return;
  S.queue = [...S.dls];
  S.qi = 0;
  _play(S.queue[0]);
  toast('▶️ Memutar semua unduhan');
}

// ── RECENTLY PLAYED ──────────────────────────────────────────────────────────
function renderRecent() {
  const sec = $('recentSec');
  if (S.recent.length) {
    if (sec) sec.style.display = 'block';
    renderCards('recentCards', S.recent.slice(0, 10));
  } else {
    if (sec) sec.style.display = 'none';
  }
}

// ── QUICK ACCESS GRID ────────────────────────────────────────────────────────
function renderQuickGrid() {
  const el = $('quickGrid');
  if (!el) return;
  const items = [
    { name: 'Favorit Saya', icon: 'fas fa-heart', color: '#e91e8c', action: "goTo('favorit');renderFavs()" },
    { name: 'Diputar Terakhir', icon: 'fas fa-clock-rotate-left', color: '#9b59b6', action: "scrollToRecent()" },
    { name: 'Indo Hits', icon: 'fas fa-flag', color: '#27ae60', action: "seeAll('indo')" },
    { name: 'Chart Global', icon: 'fas fa-fire', color: '#e67e22', action: "seeAll('chart')" },
  ];
  el.innerHTML = items.map(item => `
    <div class="quick-item" onclick="${item.action}">
      <div class="quick-item-img-icon" style="background:${item.color}20;color:${item.color}">
        <i class="${item.icon}"></i>
      </div>
      <div class="quick-item-name">${item.name}</div>
    </div>`).join('');
}

function scrollToRecent() {
  const el = $('recentSec');
  if (el) el.scrollIntoView({ behavior: 'smooth' });
}

// ── SHARE ────────────────────────────────────────────────────────────────────
function shareTrack() {
  if (!S.track) return;
  const text = `🎵 "${S.track.title}" - ${S.track.artist}\nDidengarkan di dimusik`;
  if (navigator.share) {
    navigator.share({ title: S.track.title, text, url: location.href }).catch(() => {});
  } else {
    navigator.clipboard.writeText(text).then(() => toast('📋 Link disalin!')).catch(() => toast('❌ Gagal menyalin'));
  }
}

// ── QUEUE ────────────────────────────────────────────────────────────────────
function addQueue(tj) {
  const t = typeof tj === 'string' ? JSON.parse(tj) : tj;
  S.queue.push(norm(t));
  toast('➕ Ditambah ke antrian');
  renderQueue();
  updateQueueNext();
}

function renderQueue() {
  const nowEl = $('queueNowPlaying');
  if (nowEl && S.track) {
    nowEl.innerHTML = `
      <div class="queue-now-label">Sedang Diputar</div>
      <div class="trow" style="cursor:default;border:none;padding:8px 0">
        <div class="trow-img">
          ${S.track.cover ? `<img src="${esc(S.track.cover)}" onerror="this.style.display='none'"/>` : ''}
          <div class="trow-icon" style="${S.track.cover ? 'display:none' : ''}"><i class="fas fa-music"></i></div>
        </div>
        <div class="trow-info">
          <div class="trow-t" style="color:var(--accent)">${esc(S.track.title)}</div>
          <div class="trow-a">${esc(S.track.artist)}</div>
        </div>
        <i class="fas fa-volume-up" style="color:var(--accent);font-size:14px;padding:8px"></i>
      </div>`;
  }

  const el = $('queueList');
  if (!el) return;
  if (!S.queue.length) {
    el.innerHTML = '<div class="empty"><i class="fas fa-list-music"></i><p>Antrian kosong</p><small>Tambahkan lagu dari menu ⋯</small></div>';
    return;
  }
  el.innerHTML = S.queue.map((t, i) => `
    <div class="trow${i === S.qi ? ' playing' : ''}">
      <div class="trow-img">
        ${t.cover ? `<img src="${esc(t.cover)}" onerror="this.style.display='none'"/>` : ''}
        <div class="trow-icon" style="${t.cover ? 'display:none' : ''}"><i class="fas fa-music"></i></div>
      </div>
      <div class="trow-info">
        <div class="trow-t" onclick="_play(S.queue[${i}]);S.qi=${i};closeQueue()">${esc(t.title)}</div>
        <div class="trow-a">${esc(t.artist)}</div>
      </div>
      <button class="trow-menu" onclick="S.queue.splice(${i},1);if(S.qi>=${i})S.qi--;renderQueue();updateQueueNext()">
        <i class="fas fa-times"></i>
      </button>
    </div>`).join('');
}

function clearQueue() {
  S.queue = [];
  S.qi = -1;
  renderQueue();
  updateQueueNext();
  toast('🗑️ Antrian dikosongkan');
}

function openQueue() { $('queueSheet').classList.add('open'); renderQueue(); }
function closeQueue() { $('queueSheet').classList.remove('open'); }

// ── TRACK MENU ────────────────────────────────────────────────────────────────
function openMenu(tj, fromFP = false) {
  const t = tj ? (typeof tj === 'string' ? JSON.parse(tj) : tj) : S.track;
  if (!t) return;
  const nt = norm(t);
  const fav = S.favs.some(f => f.id === nt.id);
  const ntj = JSON.stringify(JSON.stringify(nt));
  $('menuContent').innerHTML = `
    <div class="bsheet-track">
      ${nt.cover
        ? `<img src="${esc(nt.cover)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/>
           <div class="bsheet-track-icon" style="display:none"><i class="fas fa-music"></i></div>`
        : `<div class="bsheet-track-icon"><i class="fas fa-music"></i></div>`
      }
      <div class="bsheet-track-info">
        <div>${esc(nt.title)}</div>
        <div>${esc(nt.artist)}</div>
      </div>
    </div>
    <button class="bsheet-btn" onclick='playT(${ntj});closeMenu()'>
      <i class="fas fa-play"></i>Putar Sekarang
    </button>
    <button class="bsheet-btn" onclick='addQueue(${ntj});closeMenu()'>
      <i class="fas fa-list-end"></i>Tambah ke Antrian
    </button>
    <button class="bsheet-btn" onclick='toggleFav(${ntj});closeMenu()'>
      <i class="fa${fav ? 's' : 'r'} fa-heart"></i>${fav ? 'Hapus dari Favorit' : 'Tambah ke Favorit'}
    </button>
    <button class="bsheet-btn" onclick='dlTrack(${ntj});closeMenu()'>
      <i class="fas fa-download"></i>Unduh Lagu
    </button>
    <div class="bsheet-sep"></div>
    <button class="bsheet-btn" onclick='shareTrack();closeMenu()'>
      <i class="fas fa-share-nodes"></i>Bagikan
    </button>
    <button class="bsheet-btn" onclick='openTimer();closeMenu()'>
      <i class="fas fa-moon"></i>Timer Tidur
    </button>`;
  $('menuSheet').classList.add('open');
}
function closeMenu() { $('menuSheet').classList.remove('open'); }

// ── SLEEP TIMER ──────────────────────────────────────────────────────────────
function openTimer() { $('timerSheet').classList.add('open'); updateTimerStatus(); }
function closeTimer() { $('timerSheet').classList.remove('open'); }

function setSleepTimer(minutes) {
  if (S.sleepTimer) clearInterval(S.sleepTimer);
  S.sleepEnd = Date.now() + minutes * 60 * 1000;
  S.sleepTimer = setInterval(updateTimerStatus, 1000);
  updateTimerStatus();
  toast(`😴 Timer tidur ${minutes} menit diaktifkan`);
  document.querySelectorAll('.timer-btn').forEach(b => b.classList.remove('active-timer'));
}

function cancelSleepTimer() {
  if (S.sleepTimer) clearInterval(S.sleepTimer);
  S.sleepTimer = null;
  S.sleepEnd = null;
  updateTimerStatus();
  toast('⏰ Timer tidur dibatalkan');
}

function updateTimerStatus() {
  const el = $('timerStatus');
  if (!el) return;
  if (!S.sleepEnd) { el.textContent = 'Timer tidak aktif'; return; }
  const rem = Math.max(0, S.sleepEnd - Date.now());
  const m = Math.floor(rem / 60000);
  const s = Math.floor((rem % 60000) / 1000);
  el.textContent = `⏳ Berhenti dalam ${m}:${String(s).padStart(2, '0')}`;
}

// ── SEARCH ────────────────────────────────────────────────────────────────────
let stimer = null;
const searchInput = $('searchInput');
if (searchInput) {
  searchInput.addEventListener('input', e => {
    const q = e.target.value.trim();
    const clearBtn = $('searchClear');
    if (clearBtn) clearBtn.style.display = q ? 'flex' : 'none';
    const sugg = $('searchSuggestions');
    const res = $('searchResults');
    if (!q) {
      if (sugg) sugg.style.display = 'block';
      if (res) res.style.display = 'none';
      return;
    }
    if (sugg) sugg.style.display = 'none';
    if (res) res.style.display = 'flex';
    clearTimeout(stimer);
    if (q.length >= 2) stimer = setTimeout(() => doSearch(q), 500);
  });
  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { clearTimeout(stimer); doSearch(searchInput.value.trim()); }
  });
}

function clearSearch() {
  if (searchInput) searchInput.value = '';
  const clearBtn = $('searchClear');
  if (clearBtn) clearBtn.style.display = 'none';
  const sugg = $('searchSuggestions');
  const res = $('searchResults');
  if (sugg) sugg.style.display = 'block';
  if (res) res.style.display = 'none';
}

async function doSearch(q) {
  if (!q) return;
  const res = $('searchResults');
  if (res) {
    res.style.display = 'flex';
    res.innerHTML = '<div class="empty"><i class="fas fa-spinner fa-spin"></i><p>Mencari...</p></div>';
  }
  try {
    const r = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=30`);
    const d = await r.json();
    const tracks = (d.data || []).filter(t =>
      t.duration > 60 &&
      !(t.title || '').toLowerCase().includes('podcast') &&
      !(t.title || '').toLowerCase().includes('episode')
    );
    renderRows('searchResults', tracks, true);
    if (!tracks.length && res) {
      res.innerHTML = '<div class="empty"><i class="fas fa-search"></i><p>Tidak ditemukan</p><small>Coba kata kunci lain</small></div>';
    }
  } catch (e) {
    if (res) res.innerHTML = '<div class="empty"><i class="fas fa-wifi"></i><p>Koneksi error</p><small>Periksa internet</small></div>';
  }
}

// ── SEARCH SUGGESTIONS ────────────────────────────────────────────────────────
const SUGG_TAGS = ['Tulus', 'Bernadya', 'Raim Laode', 'Mahalini', 'Pamungkas', 'Hindia', 'Raisa', 'Afgan', 'Isyana', 'Lyodra', 'Nadhif Basalamah', 'Reality Club'];
function renderSuggestions() {
  const el = $('suggTags');
  if (!el) return;
  el.innerHTML = SUGG_TAGS.map(tag =>
    `<button class="sugg-tag" onclick="$('searchInput').value='${tag}';doSearch('${tag}');$('searchSuggestions').style.display='none';$('searchResults').style.display='flex'">${tag}</button>`
  ).join('');
}

// ── GENRE ─────────────────────────────────────────────────────────────────────
document.querySelectorAll('.gpill').forEach(btn => {
  btn.addEventListener('click', async () => {
    document.querySelectorAll('.gpill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    goSearch();
    const res = $('searchResults');
    if (res) {
      res.style.display = 'flex';
      res.innerHTML = '<div class="empty"><i class="fas fa-spinner fa-spin"></i><p>Memuat...</p></div>';
    }
    const sugg = $('searchSuggestions');
    if (sugg) sugg.style.display = 'none';
    try {
      const r = await fetch(`/api/search?q=${encodeURIComponent(btn.dataset.genre)}&limit=25`);
      const d = await r.json();
      const tracks = (d.data || []).filter(t => t.duration > 60 && !(t.title || '').toLowerCase().includes('podcast'));
      renderRows('searchResults', tracks, true);
      if (!tracks.length && res) res.innerHTML = '<div class="empty"><i class="fas fa-music"></i><p>Tidak ada lagu</p></div>';
    } catch (e) {
      toast('❌ Gagal memuat genre');
    }
  });
});

// ── SEE ALL ──────────────────────────────────────────────────────────────────
function seeAll(sec) {
  goSearch();
  const res = $('searchResults');
  const sugg = $('searchSuggestions');
  if (sugg) sugg.style.display = 'none';
  if (res) res.style.display = 'flex';
  if (sec === 'indo' && S.indoCache) renderRows('searchResults', S.indoCache, true);
  else if (sec === 'chart' && S.chartCache) renderRows('searchResults', S.chartCache, true);
}

// ── INDONESIA HITS ────────────────────────────────────────────────────────────
const ARTISTS = [
  'Raim Laode', 'Tulus', 'Bernadya', 'Rizky Febian', 'Raisa',
  'Tiara Andini', 'Nadin Amizah', 'Pamungkas', 'Mahalini', 'Judika',
  'Afgan', 'Isyana Sarasvati', 'Lyodra', 'Yura Yunita', 'Hindia',
  'Fourtwnty', 'Reality Club', 'Danilla', 'Ardhito Pramono', 'Nadhif Basalamah'
];

async function loadIndo() {
  skelCards('indoCards');
  try {
    const picked = [...ARTISTS].sort(() => Math.random() - 0.5).slice(0, 14);
    const results = await Promise.all(picked.map(async artist => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(artist + ' ' + artist.split(' ')[0])}&limit=10`);
        const d = await r.json();
        const tracks = (d.data || []).filter(t => {
          const an = typeof t.artist === 'object' ? (t.artist?.name || '') : (t.artist || '');
          const words = artist.toLowerCase().split(' ');
          const anLow = an.toLowerCase();
          // Match at least first name
          return words.some(w => w.length > 2 && anLow.includes(w)) && t.duration > 60;
        });
        return tracks.length ? [tracks[0]] : [];
      } catch (e) { return []; }
    }));
    const tracks = results.flat().filter(Boolean);
    if (tracks.length) {
      S.indoCache = tracks.map(norm);
      renderCards('indoCards', tracks);
    } else {
      $('indoCards').innerHTML = '<div class="empty" style="padding:16px 0"><i class="fas fa-music"></i><p>Gagal memuat</p></div>';
    }
  } catch (e) {
    $('indoCards').innerHTML = '<div class="empty" style="padding:16px 0"><i class="fas fa-wifi"></i><p>Error koneksi</p></div>';
  }
}

async function loadChart() {
  skelCards('chartCards');
  try {
    const r = await fetch('/api/chart?limit=20');
    const d = await r.json();
    const tracks = (d.data || []).filter(t => t.duration > 60);
    if (tracks.length) {
      S.chartCache = tracks.map(norm);
      renderCards('chartCards', tracks);
    } else {
      $('chartCards').innerHTML = '<div class="empty" style="padding:16px 0"><i class="fas fa-fire"></i><p>Gagal memuat</p></div>';
    }
  } catch (e) {
    $('chartCards').innerHTML = '<div class="empty" style="padding:16px 0"><i class="fas fa-wifi"></i><p>Error koneksi</p></div>';
  }
}

// ── VOL SLIDER INIT ──────────────────────────────────────────────────────────
const volSl = $('volSlider');
if (volSl) volSl.value = S.vol;

// ── KEYBOARD SHORTCUTS ───────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
  if (e.code === 'ArrowRight') nextTrack();
  if (e.code === 'ArrowLeft') prevTrack();
});

// ── MEDIA SESSION API ─────────────────────────────────────────────────────────
function updateMediaSession(t) {
  if (!navigator.mediaSession) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: t.title,
    artist: t.artist,
    album: t.album || 'dimusik',
    artwork: t.cover ? [{ src: t.cover, sizes: '512x512', type: 'image/jpeg' }] : []
  });
  navigator.mediaSession.setActionHandler('play', () => AUD.play());
  navigator.mediaSession.setActionHandler('pause', () => AUD.pause());
  navigator.mediaSession.setActionHandler('nexttrack', nextTrack);
  navigator.mediaSession.setActionHandler('previoustrack', prevTrack);
}

// Patch _play to update media session
const _playOrig = _play;
// eslint-disable-next-line no-global-assign
window._playWithSession = t => {
  _playOrig(t);
  setTimeout(() => updateMediaSession(t), 500);
};

// ── INIT ─────────────────────────────────────────────────────────────────────
window.addEventListener('load', () => {
  // Splash
  setTimeout(() => {
    const sp = $('splash');
    if (sp) {
      sp.style.opacity = '0';
      setTimeout(() => {
        sp.style.display = 'none';
        $('app').style.visibility = 'visible';
      }, 700);
    } else {
      $('app').style.visibility = 'visible';
    }
  }, 2800);

  setGreeting();
  renderQuickGrid();
  renderSuggestions();
  renderRecent();
  renderFavs();
  renderDls();

  // Load data
  Promise.all([loadIndo(), loadChart()]);
});
