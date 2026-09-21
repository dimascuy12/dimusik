'use strict';

// ── STATE ────────────────────────────────────────────────────────
const S = {
  queue: [], idx: -1,
  playing: false, shuffle: false, repeat: 'none',
  favs: JSON.parse(localStorage.getItem('nada_favs') || '[]'),
  dls: JSON.parse(localStorage.getItem('nada_dls') || '[]'),
  recent: JSON.parse(localStorage.getItem('nada_recent') || '[]'),
  current: null,
  searchTmr: null,
  indonesiaCache: [],
  chartCache: [],
  globalPool: [],
  // Anti-loop: track berapa kali gagal berturut-turut
  failStreak: 0,
  isTransitioning: false // cegah double-trigger ended
};

const audio = document.getElementById('audio');
const $ = id => document.getElementById(id);

// ── UTILS ────────────────────────────────────────────────────────
const fmt = s => {
  if (!s || isNaN(s)) return '0:00';
  return `${Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2,'0')}`;
};

function toast(msg, dur = 2400) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.add('hidden'), dur);
}

function escHtml(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showEmpty(id, icon, title, sub) {
  $(id).innerHTML = `
    <div class="empty-state">
      <div class="es-icon"><i class="fa-solid ${icon}"></i></div>
      <p class="es-title">${title}</p>
      <p class="es-sub">${sub}</p>
    </div>`;
}

function greet() {
  const h = new Date().getHours();
  const g = h < 11 ? 'Selamat pagi ☀️' : h < 15 ? 'Selamat siang 🌤' : h < 18 ? 'Selamat sore 🌇' : 'Selamat malam 🌙';
  const el = $('greetTime');
  if (el) el.textContent = g;
}

// ── NAVIGATION ────────────────────────────────────────────────────
function goTo(pg) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.bnav-btn').forEach(b => b.classList.remove('active'));
  const p = $(`pg-${pg}`);
  if (p) p.classList.add('active');
  document.querySelectorAll(`[data-pg="${pg}"]`).forEach(b => b.classList.add('active'));
  if (pg === 'fav') renderFavs();
  if (pg === 'dl') renderDls();
}

document.querySelectorAll('.bnav-btn').forEach(b => {
  b.addEventListener('click', () => goTo(b.dataset.pg));
});
$('searchTopBtn').addEventListener('click', () => goTo('search'));

// ── SKELETON ──────────────────────────────────────────────────────
function showSkeletons(id, count = 6) {
  const el = $(id);
  if (!el) return;
  el.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const s = document.createElement('div');
    s.className = 'skel';
    el.appendChild(s);
  }
}

function showTrackSkeletons(id, count = 5) {
  const el = $(id);
  if (!el) return;
  el.innerHTML = '';
  for (let i = 0; i < count; i++) {
    el.innerHTML += `
      <div class="loading-track">
        <div class="lt-cover"></div>
        <div class="lt-lines">
          <div class="lt-line"></div>
          <div class="lt-line short"></div>
        </div>
      </div>`;
  }
}

// ── LOAD HOME ─────────────────────────────────────────────────────
async function loadHome() {
  greet();
  showSkeletons('rowIndonesia');
  showSkeletons('rowChart');

  // ── Artis Indonesia terkenal & lagu hits asli ──
  // Query spesifik ke artis Indonesia supaya hasil dari artis aslinya
  const indoArtistQueries = [
    'Raim Laode',
    'Tulus',
    'Bernadya',
    'Rizky Febian',
    'Raisa',
    'Tiara Andini',
    'Nadin Amizah',
    'Pamungkas',
    'Mahalini',
    'Judika',
    'Afgan',
    'Isyana Sarasvati',
    'Lyodra',
    'Yura Yunita',
    'Hindia',
    'Reality Club',
    'Fourtwnty',
    'Danilla'
  ];

  let indoAll = [];
  // Ambil 2 lagu per artis supaya hasilnya dari artis asli
  for (const artist of indoArtistQueries) {
    try {
      const r = await fetch(`/api/search?q=${encodeURIComponent(artist)}&limit=3`);
      const d = await r.json();
      if (d.data && d.data.length) {
        // Filter: pastikan nama artis ada di hasil
        const filtered = d.data.filter(t =>
          t.artist.toLowerCase().includes(artist.split(' ')[0].toLowerCase()) ||
          artist.toLowerCase().includes(t.artist.split(' ')[0].toLowerCase())
        );
        indoAll.push(...(filtered.length ? filtered : d.data.slice(0,2)));
      }
    } catch(e) {}
  }

  // Dedupe
  const seen = new Set();
  S.indonesiaCache = indoAll.filter(t => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });

  // Tambahkan ke global pool
  S.globalPool.push(...S.indonesiaCache);
  renderHScroll('rowIndonesia', S.indonesiaCache);

  // ── Chart Global ──
  try {
    const r = await fetch('/api/chart');
    const d = await r.json();
    S.chartCache = d.data || [];
    // Tambah yang belum ada di pool
    const poolIds = new Set(S.globalPool.map(t => t.id));
    S.globalPool.push(...S.chartCache.filter(t => !poolIds.has(t.id)));
    renderHScroll('rowChart', S.chartCache);
  } catch(e) {
    const el = $('rowChart');
    if (el) el.innerHTML = `<p style="padding:12px 0;color:var(--txt2);font-size:13px">Gagal memuat</p>`;
  }

  renderRecent();
}

function renderRecent() {
  if (!S.recent.length) return;
  const section = $('recentSection');
  if (section) section.style.display = 'block';
  renderHScroll('rowRecent', S.recent.slice(0, 15));
}

// ── RENDER H-SCROLL ───────────────────────────────────────────────
function renderHScroll(id, tracks) {
  const el = $(id);
  if (!el) return;
  el.innerHTML = '';
  const ph = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><rect fill='%23282828' width='140' height='140' rx='8'/><text x='70' y='85' text-anchor='middle' fill='%23e8175d' font-size='44' font-family='Arial'>♪</text></svg>`;

  tracks.slice(0, 20).forEach((t, i) => {
    const card = document.createElement('div');
    card.className = 'mcard';
    card.innerHTML = `
      <img class="mcard-img" src="${t.cover || ph}" alt="" loading="lazy"
        onerror="this.src='${ph}'"/>
      <p class="mcard-title">${escHtml(t.title)}</p>
      <p class="mcard-artist">${escHtml(t.artist)}</p>`;
    card.addEventListener('click', () => play(t, tracks, i));
    el.appendChild(card);
  });
}

// ── GENRE ─────────────────────────────────────────────────────────
document.querySelectorAll('.gpill').forEach(btn => {
  btn.addEventListener('click', async () => {
    document.querySelectorAll('.gpill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    goTo('search');
    showTrackSkeletons('searchResults');
    try {
      const r = await fetch(`/api/genre/${btn.dataset.genre}`);
      const d = await r.json();
      const tracks = d.data || [];
      const poolIds = new Set(S.globalPool.map(t => t.id));
      S.globalPool.push(...tracks.filter(t => !poolIds.has(t.id)));
      renderTrackList('searchResults', tracks);
      if (!tracks.length) showEmpty('searchResults','fa-music','Tidak ada lagu','Coba genre lain');
    } catch(e) { toast('❌ Gagal memuat genre'); }
  });
});

// ── SEE ALL ───────────────────────────────────────────────────────
document.querySelectorAll('.see-all').forEach(btn => {
  btn.addEventListener('click', () => {
    const sec = btn.dataset.section;
    goTo('search');
    $('searchInput').value = '';
    $('searchClear').classList.add('hidden');
    if (sec === 'indonesia') renderTrackList('searchResults', S.indonesiaCache);
    if (sec === 'chart') renderTrackList('searchResults', S.chartCache);
  });
});

// ── HERO PLAY ─────────────────────────────────────────────────────
$('heroPlayBtn').addEventListener('click', () => {
  if (S.indonesiaCache.length) {
    // Shuffle & play dari indonesia cache
    const shuffled = [...S.indonesiaCache].sort(() => Math.random() - 0.5);
    play(shuffled[0], shuffled, 0);
  } else {
    toast('⏳ Masih memuat, tunggu sebentar...');
  }
});

// ── SEARCH ────────────────────────────────────────────────────────
const si = $('searchInput');
si.addEventListener('input', () => {
  const q = si.value.trim();
  $('searchClear').classList.toggle('hidden', !q);
  clearTimeout(S.searchTmr);
  if (q.length < 2) { $('searchResults').innerHTML = ''; return; }
  S.searchTmr = setTimeout(() => doSearch(q), 500);
});
$('searchClear').addEventListener('click', () => {
  si.value = '';
  $('searchClear').classList.add('hidden');
  $('searchResults').innerHTML = '';
  si.focus();
});
si.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(si.value.trim()); });

async function doSearch(q) {
  if (!q) return;
  showTrackSkeletons('searchResults');
  try {
    const r = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=25`);
    const d = await r.json();
    const tracks = d.data || [];
    const poolIds = new Set(S.globalPool.map(t => t.id));
    S.globalPool.push(...tracks.filter(t => !poolIds.has(t.id)));
    renderTrackList('searchResults', tracks);
    if (!tracks.length) showEmpty('searchResults','fa-magnifying-glass','Tidak ditemukan','Coba kata kunci lain');
  } catch(e) {
    showEmpty('searchResults','fa-triangle-exclamation','Gagal mencari','Periksa koneksi internet');
  }
}

// ── RENDER TRACK LIST ─────────────────────────────────────────────
function renderTrackList(containerId, tracks) {
  const el = $(containerId);
  if (!el) return;
  el.innerHTML = '';
  el._tracks = tracks; // simpan referensi untuk track menu

  const ph = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='50' height='50'><rect fill='%23282828' width='50' height='50' rx='6'/><text x='25' y='32' text-anchor='middle' fill='%23e8175d' font-size='22' font-family='Arial'>♪</text></svg>`;

  tracks.forEach((t, i) => {
    const isNow = S.current && S.current.id === t.id;
    const div = document.createElement('div');
    div.className = `titem${isNow ? ' now-playing' : ''}`;
    div.dataset.tid = t.id;
    div.dataset.idx = i;
    div.innerHTML = `
      <div class="titem-num">
        ${isNow
          ? `<div class="eq-wrap">
               <span class="eq-bar" style="animation-delay:0s"></span>
               <span class="eq-bar" style="height:10px;animation-delay:.15s"></span>
               <span class="eq-bar" style="animation-delay:.3s"></span>
             </div>`
          : `<span>${i+1}</span>`
        }
      </div>
      <img class="titem-cover" src="${t.cover||ph}" alt="" loading="lazy"
        onerror="this.src='${ph}'"/>
      <div class="titem-info">
        <p class="titem-title">${escHtml(t.title)}</p>
        <p class="titem-artist">${escHtml(t.artist)}</p>
      </div>
      <span class="titem-dur">${fmt(t.duration)}</span>
      <button class="titem-more" data-idx="${i}" data-container="${containerId}">
        <i class="fa-solid fa-ellipsis-vertical"></i>
      </button>`;

    div.addEventListener('click', e => {
      if (e.target.closest('.titem-more')) return;
      play(t, tracks, i);
    });

    div.querySelector('.titem-more').addEventListener('click', e => {
      e.stopPropagation();
      openTrackMenu(t);
    });

    el.appendChild(div);
  });
}

// ── TRACK MENU ────────────────────────────────────────────────────
function openTrackMenu(track) {
  if (!track) return;
  const isFav = S.favs.some(f => f.id === track.id);

  const overlay = document.createElement('div');
  overlay.className = 'sheet-overlay';
  overlay.style.zIndex = '600';

  const sheet = document.createElement('div');
  sheet.className = 'bottom-sheet';
  sheet.style.zIndex = '610';
  sheet.innerHTML = `
    <div class="sheet-handle"></div>
    <div style="display:flex;align-items:center;gap:12px;padding:14px 16px 12px;border-bottom:1px solid var(--border)">
      <img src="${track.cover||''}" style="width:46px;height:46px;border-radius:8px;object-fit:cover;background:var(--card)" onerror="this.style.background='var(--card)'"/>
      <div style="flex:1;min-width:0">
        <p style="font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(track.title)}</p>
        <p style="font-size:12px;color:var(--txt2);margin-top:2px">${escHtml(track.artist)}</p>
      </div>
    </div>
    <div class="track-list" style="padding:8px 8px 0">
      <div class="titem tm-item" id="tm-fav">
        <div class="titem-num"><i class="fa-${isFav?'solid':'regular'} fa-heart" style="color:${isFav?'var(--red)':''}"></i></div>
        <div class="titem-info"><p class="titem-title">${isFav?'Hapus dari Favorit':'Tambah ke Favorit'}</p></div>
      </div>
      <div class="titem tm-item" id="tm-play">
        <div class="titem-num"><i class="fa-solid fa-play"></i></div>
        <div class="titem-info"><p class="titem-title">Putar Sekarang</p></div>
      </div>
      <div class="titem tm-item" id="tm-queue">
        <div class="titem-num"><i class="fa-solid fa-list-ul"></i></div>
        <div class="titem-info"><p class="titem-title">Tambah ke Antrean</p></div>
      </div>
      <div class="titem tm-item" id="tm-dl">
        <div class="titem-num"><i class="fa-solid fa-download"></i></div>
        <div class="titem-info"><p class="titem-title">Unduh Lagu</p></div>
      </div>
    </div>
    <div style="height:20px"></div>`;

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  sheet.querySelector('#tm-fav').onclick = () => { toggleFavTrack(track); overlay.remove(); };
  sheet.querySelector('#tm-play').onclick = () => { play(track,[track],0); overlay.remove(); };
  sheet.querySelector('#tm-queue').onclick = () => { addToQueue(track); overlay.remove(); };
  sheet.querySelector('#tm-dl').onclick = () => { downloadTrack(track); overlay.remove(); };
  overlay.appendChild(sheet);
  document.body.appendChild(overlay);
}

// ── PLAY ─────────────────────────────────────────────────────────
async function play(track, queue, idx) {
  // Reset flag
  S.isTransitioning = false;
  S.failStreak = 0;

  S.current = track;
  S.queue = Array.isArray(queue) && queue.length ? [...queue] : [track];
  S.idx = typeof idx === 'number' ? idx : 0;

  // Tambah ke recent
  S.recent = [track, ...S.recent.filter(r => r.id !== track.id)].slice(0, 30);
  localStorage.setItem('nada_recent', JSON.stringify(S.recent));
  renderRecent();

  updatePlayerUI(track);

  // Stop audio dulu sebelum ganti src
  audio.pause();
  audio.src = '';

  const url = `/api/stream?title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(track.artist)}`;

  // Set src baru
  audio.src = url;
  audio.load();

  toast(`⏳ ${track.title} — ${track.artist}`);

  try {
    await audio.play();
    S.playing = true;
    S.failStreak = 0;
    updatePlayBtns(true);
    spinDisc(true);
    markPlaying(track.id);
  } catch(e) {
    console.error('Play error:', e.message);
    // Jangan langsung auto-next di sini, biarkan error event handle
    S.playing = false;
    updatePlayBtns(false);
    spinDisc(false);
  }
}

function updatePlayerUI(t) {
  const ph = '';
  // Mini player
  $('mpTitle').textContent = t.title;
  $('mpArtist').textContent = t.artist;
  $('mpCover').src = t.cover || ph;
  $('miniPlayer').classList.remove('hidden');
  // Full player
  $('fpTitle').textContent = t.title;
  $('fpArtist').textContent = t.artist;
  $('fpCover').src = t.cover || ph;
  $('fpBg').style.backgroundImage = `url(${t.cover})`;
  // Fav icon
  const on = S.favs.some(f => f.id === t.id);
  $('fpFavIcon').className = on ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
  $('fpFav').classList.toggle('on', on);
  document.title = `${t.title} — dimusik`;
}

function updatePlayBtns(playing) {
  $('mpPlayIcon').className = playing ? 'fa-solid fa-pause' : 'fa-solid fa-play';
  $('fpPlayIcon').className = playing ? 'fa-solid fa-pause' : 'fa-solid fa-play';
}

function spinDisc(on) {
  const d = document.querySelector('.disc-circle');
  if (d) d.classList.toggle('spin', on);
}

function markPlaying(id) {
  document.querySelectorAll('.titem').forEach(el => {
    const isNow = el.dataset.tid == id;
    el.classList.toggle('now-playing', isNow);
  });
}

// ── CONTROLS ─────────────────────────────────────────────────────
function togglePlay() {
  if (!S.current) return;
  if (S.playing) {
    audio.pause();
    S.playing = false;
    spinDisc(false);
    updatePlayBtns(false);
  } else {
    audio.play()
      .then(() => { S.playing = true; spinDisc(true); updatePlayBtns(true); })
      .catch(e => console.error(e));
  }
}

function nextTrack() {
  // Jika sedang transisi, abaikan
  if (S.isTransitioning) return;

  const pool = S.queue.length > 1 ? S.queue : S.globalPool;
  if (!pool.length) return;

  let nextIdx;
  if (S.shuffle || S.queue.length <= 1) {
    // Random dari pool, hindari lagu yang sama
    let tries = 0;
    do {
      nextIdx = Math.floor(Math.random() * pool.length);
      tries++;
    } while (pool[nextIdx]?.id === S.current?.id && tries < 10);
  } else {
    nextIdx = S.idx + 1;
    if (nextIdx >= S.queue.length) {
      if (S.repeat === 'all') {
        nextIdx = 0;
      } else {
        // End of queue → random dari global pool
        const globalPool = S.globalPool.filter(t => t.id !== S.current?.id);
        if (!globalPool.length) return;
        const rIdx = Math.floor(Math.random() * globalPool.length);
        const track = globalPool[rIdx];
        play(track, globalPool, rIdx);
        return;
      }
    }
  }

  const track = pool[nextIdx];
  if (!track) return;

  if (pool === S.queue) {
    S.idx = nextIdx;
    play(track, S.queue, nextIdx);
  } else {
    play(track, pool, nextIdx);
  }
}

function prevTrack() {
  if (audio.currentTime > 3) { audio.currentTime = 0; return; }
  if (!S.queue.length) return;
  const prev = Math.max(0, S.idx - 1);
  S.idx = prev;
  play(S.queue[prev], S.queue, prev);
}

function playRandom() {
  const pool = S.globalPool.filter(t => t.id !== S.current?.id);
  if (!pool.length) return;
  const idx = Math.floor(Math.random() * pool.length);
  play(pool[idx], pool, idx);
}

function addToQueue(track) {
  if (!S.queue.find(t => t.id === track.id)) {
    S.queue.push(track);
  }
  const poolIds = new Set(S.globalPool.map(t => t.id));
  if (!poolIds.has(track.id)) S.globalPool.push(track);
  toast('✅ Ditambahkan ke antrean');
}

function toggleShuffle() {
  S.shuffle = !S.shuffle;
  const btn = $('btnShuffle');
  btn.classList.toggle('on', S.shuffle);
  btn.style.color = S.shuffle ? 'var(--red)' : '';
  toast(S.shuffle ? '🔀 Acak aktif' : '🔀 Acak nonaktif');
}

function toggleRepeat() {
  const modes = ['none','all','one'];
  S.repeat = modes[(modes.indexOf(S.repeat)+1)%3];
  const btn = $('btnRepeat');
  btn.querySelector('i').className = S.repeat === 'one' ? 'fa-solid fa-repeat-1' : 'fa-solid fa-repeat';
  btn.classList.toggle('on', S.repeat !== 'none');
  btn.style.color = S.repeat !== 'none' ? 'var(--red)' : '';
  const msgs = { none:'Ulang nonaktif', all:'🔁 Ulang semua', one:'🔂 Ulang lagu ini' };
  toast(msgs[S.repeat]);
}

// ── AUDIO EVENTS ──────────────────────────────────────────────────
audio.addEventListener('timeupdate', () => {
  if (!audio.duration || isNaN(audio.duration)) return;
  const pct = (audio.currentTime / audio.duration) * 100;
  $('seekBar').value = pct;
  $('seekFill').style.width = pct + '%';
  $('mpFill').style.width = pct + '%';
  $('fpCur').textContent = fmt(audio.currentTime);
  $('fpDur').textContent = fmt(audio.duration);
});

audio.addEventListener('ended', () => {
  // Guard: cegah dipanggil dua kali
  if (S.isTransitioning) return;
  S.isTransitioning = true;

  S.playing = false;
  spinDisc(false);
  updatePlayBtns(false);

  if (S.repeat === 'one') {
    S.isTransitioning = false;
    audio.currentTime = 0;
    audio.play().then(() => { S.playing = true; spinDisc(true); updatePlayBtns(true); });
    return;
  }

  // Delay sedikit sebelum next supaya tidak loop terlalu cepat
  setTimeout(() => {
    S.isTransitioning = false;
    nextTrack();
  }, 800);
});

audio.addEventListener('error', (e) => {
  // Hanya handle jika ada src (bukan saat reset)
  if (!audio.src || audio.src === window.location.href) return;

  S.playing = false;
  updatePlayBtns(false);
  spinDisc(false);

  S.failStreak = (S.failStreak || 0) + 1;

  // Jika gagal terlalu banyak berturut-turut, berhenti
  if (S.failStreak >= 4) {
    toast('❌ Banyak lagu gagal dimuat. Coba cari lagu lain.');
    S.failStreak = 0;
    return;
  }

  toast(`⚠️ Gagal memuat, lanjut ke berikutnya...`);

  // Delay sebelum next supaya tidak loop panik
  setTimeout(() => {
    if (!S.isTransitioning) {
      S.isTransitioning = true;
      setTimeout(() => {
        S.isTransitioning = false;
        nextTrack();
      }, 200);
    }
  }, 1500);
});

audio.addEventListener('waiting', () => {
  $('fpPlayIcon').className = 'fa-solid fa-spinner fa-spin';
  $('mpPlayIcon').className = 'fa-solid fa-spinner fa-spin';
});

audio.addEventListener('playing', () => {
  S.playing = true;
  S.failStreak = 0;
  S.isTransitioning = false;
  updatePlayBtns(true);
  spinDisc(true);
});

audio.addEventListener('stalled', () => {
  // Stream stuck, tapi jangan langsung skip
  console.warn('Audio stalled');
});

// Seekbar
$('seekBar').addEventListener('input', e => {
  if (audio.duration && !isNaN(audio.duration)) {
    audio.currentTime = (e.target.value/100) * audio.duration;
    $('seekFill').style.width = e.target.value + '%';
  }
});

// Volume
const volBar = $('volBar');
const volFill = $('volFill');
volBar.addEventListener('input', e => {
  audio.volume = e.target.value / 100;
  if (volFill) volFill.style.width = e.target.value + '%';
});

// ── FULL PLAYER ───────────────────────────────────────────────────
function openPlayer() {
  $('fullPlayer').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  setTimeout(() => { if ($('fpCover')) $('fpCover').classList.add('enlarged'); }, 100);
}
function closePlayer() {
  $('fullPlayer').classList.add('hidden');
  document.body.style.overflow = '';
  if ($('fpCover')) $('fpCover').classList.remove('enlarged');
}

$('miniPlayer').addEventListener('click', e => {
  if (!e.target.closest('.mp-btns')) openPlayer();
});

// ── QUEUE ─────────────────────────────────────────────────────────
function showQueue() {
  const list = $('qList');
  list.innerHTML = '';
  const ph = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='50' height='50'><rect fill='%23282828' width='50' height='50' rx='6'/></svg>`;

  S.queue.forEach((t, i) => {
    const div = document.createElement('div');
    div.className = `titem${i === S.idx ? ' now-playing' : ''}`;
    div.dataset.tid = t.id;
    div.innerHTML = `
      <div class="titem-num">
        ${i === S.idx
          ? `<div class="eq-wrap"><span class="eq-bar"></span><span class="eq-bar" style="height:10px;animation-delay:.15s"></span><span class="eq-bar" style="animation-delay:.3s"></span></div>`
          : `<span>${i+1}</span>`}
      </div>
      <img class="titem-cover" src="${t.cover||ph}" alt="" onerror="this.style.background='var(--card)'"/>
      <div class="titem-info">
        <p class="titem-title">${escHtml(t.title)}</p>
        <p class="titem-artist">${escHtml(t.artist)}</p>
      </div>`;
    div.addEventListener('click', () => { S.idx=i; play(t,S.queue,i); hideQueue(); });
    list.appendChild(div);
  });

  $('qSheet').classList.remove('hidden');
  $('qOverlay').classList.remove('hidden');
}
function hideQueue() {
  $('qSheet').classList.add('hidden');
  $('qOverlay').classList.add('hidden');
}

// ── FAVORITES ─────────────────────────────────────────────────────
function toggleFav() {
  if (!S.current) return;
  toggleFavTrack(S.current);
}
function toggleFavTrack(track) {
  const idx = S.favs.findIndex(f => f.id === track.id);
  if (idx === -1) { S.favs.unshift(track); toast('❤ Ditambahkan ke favorit'); }
  else { S.favs.splice(idx,1); toast('Dihapus dari favorit'); }
  localStorage.setItem('nada_favs', JSON.stringify(S.favs));
  if (S.current && S.current.id === track.id) {
    const on = S.favs.some(f => f.id === track.id);
    $('fpFavIcon').className = on ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
    $('fpFav').classList.toggle('on', on);
  }
}
function renderFavs() {
  if (!S.favs.length) {
    showEmpty('favList','fa-heart','Belum ada favorit','Tekan ♡ saat memutar lagu');
    return;
  }
  renderTrackList('favList', S.favs);
}

// ── DOWNLOADS ─────────────────────────────────────────────────────
function downloadCurrent() { if (S.current) downloadTrack(S.current); }
function downloadTrack(track) {
  toast(`⬇ Mengunduh ${track.title}...`, 3500);
  const a = document.createElement('a');
  a.href = `/api/download?title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(track.artist)}`;
  a.download = `${track.title} - ${track.artist}.mp3`;
  document.body.appendChild(a); a.click(); a.remove();
  if (!S.dls.find(d => d.id === track.id)) {
    S.dls.unshift(track);
    localStorage.setItem('nada_dls', JSON.stringify(S.dls));
  }
}
function renderDls() {
  if (!S.dls.length) {
    showEmpty('dlList','fa-download','Belum ada unduhan','Ketuk ⋮ pada lagu lalu pilih Unduh');
    return;
  }
  renderTrackList('dlList', S.dls);
}

// ── SHARE ─────────────────────────────────────────────────────────
function shareCurrent() {
  if (!S.current) return;
  const txt = `${S.current.title} - ${S.current.artist}`;
  if (navigator.share) navigator.share({ title: S.current.title, text: txt }).catch(()=>{});
  else { navigator.clipboard?.writeText(txt).catch(()=>{}); toast('📋 Disalin ke clipboard'); }
}

// ── THEME ─────────────────────────────────────────────────────────
$('themeBtn').addEventListener('click', () => {
  document.body.classList.toggle('light');
  const l = document.body.classList.contains('light');
  $('themeBtn').innerHTML = l ? '<i class="fa-solid fa-moon"></i>' : '<i class="fa-solid fa-sun"></i>';
  localStorage.setItem('nada_theme', l ? 'light' : 'dark');
});
if (localStorage.getItem('nada_theme') === 'light') {
  document.body.classList.add('light');
  $('themeBtn').innerHTML = '<i class="fa-solid fa-moon"></i>';
}

// ── KEYBOARD ─────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
  if (e.code === 'ArrowRight' && e.ctrlKey) { e.preventDefault(); nextTrack(); }
  if (e.code === 'ArrowLeft' && e.ctrlKey) { e.preventDefault(); prevTrack(); }
  if (e.code === 'KeyF') toggleFav();
  if (e.key === 'Escape') { closePlayer(); hideQueue(); }
});

// ── INIT ──────────────────────────────────────────────────────────
loadHome();
