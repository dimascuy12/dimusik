'use strict';

const S = {
  track:null, queue:[], qi:-1,
  repeat:'none', shuffle:false,
  favs: JSON.parse(localStorage.getItem('favs')||'[]'),
  dls:  JSON.parse(localStorage.getItem('dls') ||'[]'),
  recent: JSON.parse(localStorage.getItem('recent')||'[]'),
  pool:[], trans:false, fails:0,
  indoCache:null, chartCache:null,
  theme: localStorage.getItem('theme')||'dark',
  vol: parseFloat(localStorage.getItem('vol')||'1'),
  sleepEnd:null, sleepInt:null,
};

const AUD = new Audio();
AUD.volume = S.vol;
AUD.preload = 'none';

const $ = id => document.getElementById(id);
const fmt = s => { if(!s||isNaN(s))return'0:00'; return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`; };
const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

function norm(t) {
  const artist = typeof t.artist==='object' ? (t.artist?.name||'Unknown') : (t.artist||'Unknown');
  const album  = typeof t.album==='object'  ? (t.album?.title||'')        : (t.album||'');
  const cover  = (typeof t.album==='object' ? t.album?.cover_big : null) || t.cover || t.cover_big || '';
  return { id:t.id, title:t.title||'Unknown', artist, album, cover, duration:t.duration||0 };
}

function addPool(list) {
  const ids = new Set(S.pool.map(x=>x.id));
  list.forEach(t => { if(!ids.has(t.id)){ S.pool.push(t); ids.add(t.id); } });
}

// TOAST
let _tt;
function toast(msg) {
  const el = $('toast'); if(!el)return;
  el.textContent = msg; el.style.opacity = '1';
  clearTimeout(_tt); _tt = setTimeout(()=>el.style.opacity='0', 2600);
}

// THEME
function applyTheme() {
  document.body.classList.toggle('light', S.theme==='light');
  const ic = $('themeIcon');
  if(ic) ic.className = S.theme==='light' ? 'fas fa-moon' : 'fas fa-sun';
}
function toggleTheme() {
  S.theme = S.theme==='dark' ? 'light' : 'dark';
  localStorage.setItem('theme', S.theme);
  applyTheme();
}
applyTheme();

// GREETING
function setGreeting() {
  const h = new Date().getHours();
  const el = $('heroGreeting'); if(!el)return;
  if(h<5)       el.textContent = '🌙 Selamat malam';
  else if(h<12) el.textContent = '🌅 Selamat pagi';
  else if(h<15) el.textContent = '☀️ Selamat siang';
  else if(h< 18)el.textContent = '🌤️ Selamat sore';
  else          el.textContent = '🌙 Selamat malam';
}

// NAV
function goTo(pg) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  const p=$('pg-'+pg); if(p)p.classList.add('active');
  const b=$('nb-'+pg); if(b)b.classList.add('active');
}
function goSearch() {
  goTo('cari');
  setTimeout(()=>{ const si=$('searchInput'); if(si)si.focus(); }, 150);
}

// SKELETON
function skelCards(id, n=5) {
  const el=$(id); if(!el)return;
  el.innerHTML = Array(n).fill(`
    <div class="skel-card">
      <div class="skel skel-sq"></div>
      <div class="skel skel-ln" style="width:85%"></div>
      <div class="skel skel-ln" style="width:60%"></div>
    </div>`).join('');
}

// RENDER CARDS (horizontal)
function renderCards(id, tracks) {
  const el=$(id); if(!el)return;
  const list = tracks.map(norm);
  addPool(list);
  if(!list.length){
    el.innerHTML='<div class="empty" style="padding:16px 0"><i class="fas fa-music"></i><p>Tidak ada lagu</p></div>';
    return;
  }
  el.innerHTML = list.map(t => {
    const tj = JSON.stringify(JSON.stringify(t));
    return `<div class="card" onclick='playT(${tj})'>
      <div class="card-img">
        ${t.cover
          ? `<img src="${esc(t.cover)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/>
             <div class="card-ic" style="display:none"><i class="fas fa-music"></i></div>`
          : `<div class="card-ic"><i class="fas fa-music"></i></div>`}
        <div class="card-ov"><div class="card-ov-ic"><i class="fas fa-play"></i></div></div>
      </div>
      <div class="card-t">${esc(t.title)}</div>
      <div class="card-a">${esc(t.artist)}</div>
    </div>`;
  }).join('');
}

// RENDER ROWS (vertical)
function renderRows(id, tracks) {
  const el=$(id); if(!el)return;
  const list = tracks.map(norm);
  addPool(list);
  if(!list.length){
    el.innerHTML='<div class="empty"><i class="fas fa-music"></i><p>Tidak ada lagu</p><small>Coba kata kunci lain</small></div>';
    return;
  }
  el.innerHTML = list.map((t,i) => {
    const tj = JSON.stringify(JSON.stringify(t));
    const playing = S.track && S.track.id===t.id;
    return `<div class="trow${playing?' playing':''}" onclick='playTList(${tj},"${id}",${i})'>
      <div class="trow-img">
        ${t.cover
          ? `<img src="${esc(t.cover)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/>
             <div class="trow-ic" style="display:none"><i class="fas fa-music"></i></div>`
          : `<div class="trow-ic"><i class="fas fa-music"></i></div>`}
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

// PLAY
function playT(tj) {
  const t = typeof tj==='string' ? JSON.parse(tj) : tj;
  _play(norm(t));
}

function playTList(tj, listId, idx) {
  const t = typeof tj==='string' ? JSON.parse(tj) : tj;
  S.qi = idx;
  _play(norm(t));
}

function _play(t) {
  S.track = t;
  S.trans = false;
  S.fails = 0;

  // Recently played
  S.recent = S.recent.filter(x=>x.id!==t.id);
  S.recent.unshift(t);
  if(S.recent.length>30) S.recent.pop();
  localStorage.setItem('recent', JSON.stringify(S.recent));
  renderRecent();

  // Update UI
  updateFPUI(t);
  updateMP(t);

  // Stream audio
  const url = `/api/stream?title=${encodeURIComponent(t.title)}&artist=${encodeURIComponent(t.artist)}`;
  AUD.src = url;
  AUD.load();
  AUD.play().catch(e => {
    console.error('Play error:', e);
    toast('❌ Gagal memutar, mencoba lagi...');
    setTimeout(() => {
      AUD.load();
      AUD.play().catch(() => toast('❌ Gagal memutar lagu ini'));
    }, 1000);
  });

  updateQueueNext();

  // Media Session
  if(navigator.mediaSession) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title, artist: t.artist,
      album: t.album||'dimusik',
      artwork: t.cover ? [{src:t.cover,sizes:'512x512',type:'image/jpeg'}] : []
    });
    navigator.mediaSession.setActionHandler('play', ()=>AUD.play());
    navigator.mediaSession.setActionHandler('pause', ()=>AUD.pause());
    navigator.mediaSession.setActionHandler('nexttrack', nextTrack);
    navigator.mediaSession.setActionHandler('previoustrack', prevTrack);
  }
}

function updateFPUI(t) {
  $('fp-bg').style.backgroundImage = t.cover ? `url('${esc(t.cover)}')` : '';
  const img = $('fpImg');
  if(img){ img.src = t.cover||''; img.style.display = t.cover?'block':'none'; }
  $('fpTitle').textContent = t.title;
  $('fpArtist').textContent = t.artist;
  const alb = $('fpAlbum'); if(alb) alb.textContent = t.album||'';
  updateFavBtns();
}

function updateFavBtns() {
  const t = S.track;
  const fav = t && S.favs.some(f=>f.id===t.id);
  const fpFav = $('fpFav');
  if(fpFav){ fpFav.innerHTML=`<i class="fa${fav?'s':'r'} fa-heart"></i>`; fpFav.classList.toggle('active',fav); }
  const mpFav = $('mpFav');
  if(mpFav){ mpFav.innerHTML=`<i class="fa${fav?'s':'r'} fa-heart" style="font-size:18px${fav?';color:var(--accent)':''}"></i>`; }
}

function updateMP(t) {
  const mp = $('miniPlayer');
  if(mp) mp.style.display = 'flex';
  const img = $('mpImg');
  if(img){ img.src=t.cover||''; img.style.display=t.cover?'block':'none'; }
  $('mpTitle').textContent = t.title;
  $('mpArtist').textContent = t.artist;
  updPlayUI();
  updateFavBtns();
}

function updPlayUI() {
  const pl = !AUD.paused;
  const ic = `<i class="fas fa-${pl?'pause':'play'}"></i>`;
  const mp = $('mpPlay'); if(mp) mp.innerHTML = ic;
  const fp = $('fpPlayBtn'); if(fp) fp.innerHTML = ic;
}

function updateQueueNext() {
  const el = $('fpQueueNext'); if(!el)return;
  const nxt = S.queue[S.qi+1];
  el.textContent = nxt ? `${nxt.title} — ${nxt.artist}` : 'Lagu acak berikutnya';
}

// AUDIO EVENTS
AUD.addEventListener('play', updPlayUI);
AUD.addEventListener('pause', updPlayUI);
AUD.addEventListener('timeupdate', () => {
  if(!AUD.duration) return;
  const p = (AUD.currentTime/AUD.duration)*100;
  const sk=$('fpSeek'); if(sk) sk.value=p;
  const cur=$('fpCur'); if(cur) cur.textContent=fmt(AUD.currentTime);
  const dur=$('fpDur'); if(dur) dur.textContent=fmt(AUD.duration);
  const prog=$('mpProg'); if(prog) prog.style.width=p+'%';
  // Sleep timer
  if(S.sleepEnd && Date.now()>=S.sleepEnd) {
    AUD.pause(); S.sleepEnd=null;
    clearInterval(S.sleepInt); S.sleepInt=null;
    toast('😴 Timer tidur selesai, musik berhenti');
  }
});
AUD.addEventListener('ended', () => {
  if(S.repeat==='one'){ AUD.currentTime=0; AUD.play(); return; }
  nextTrack();
});
AUD.addEventListener('error', () => {
  if(S.trans) return;
  S.fails++;
  if(S.fails>=4){ toast('❌ Banyak error, berhenti otomatis'); S.fails=0; return; }
  toast('⚠️ Stream error, mencoba lagu lain...');
  setTimeout(()=>nextTrack(), 1800);
});

// CONTROLS
function togglePlay() {
  if(!S.track){ toast('Pilih lagu dulu'); return; }
  AUD.paused ? AUD.play().catch(()=>{}) : AUD.pause();
}
function nextTrack() {
  if(S.trans) return;
  S.trans=true; setTimeout(()=>S.trans=false, 3000);
  if(S.repeat==='all'&&S.queue.length){ S.qi=(S.qi+1)%S.queue.length; _play(S.queue[S.qi]); return; }
  if(S.queue.length&&S.qi<S.queue.length-1){ S.qi++; _play(S.queue[S.qi]); return; }
  playRandom();
}
function prevTrack() {
  if(AUD.currentTime>3){ AUD.currentTime=0; return; }
  if(S.queue.length&&S.qi>0){ S.qi--; _play(S.queue[S.qi]); return; }
  AUD.currentTime=0;
}
function playRandom() {
  const pool = S.pool.filter(t=>!S.track||t.id!==S.track.id);
  if(!pool.length){ toast('Tidak ada lagu lain'); S.trans=false; return; }
  _play(pool[Math.floor(Math.random()*pool.length)]);
}
function seekTo(v) { if(AUD.duration) AUD.currentTime=(v/100)*AUD.duration; }
function setVol(v) { S.vol=parseFloat(v); AUD.volume=S.vol; localStorage.setItem('vol',v); }
function toggleShuffle() {
  S.shuffle=!S.shuffle;
  $('fpShuffle').classList.toggle('active',S.shuffle);
  toast(S.shuffle?'🔀 Acak aktif':'🔀 Acak nonaktif');
}
function toggleRepeat() {
  const m=['none','all','one'];
  S.repeat=m[(m.indexOf(S.repeat)+1)%m.length];
  const btn=$('fpRepeat');
  btn.classList.toggle('active',S.repeat!=='none');
  btn.innerHTML=S.repeat==='one'?'<i class="fas fa-repeat-1"></i>':'<i class="fas fa-repeat"></i>';
  toast({none:'Ulangi nonaktif',all:'Ulangi semua',one:'Ulangi 1 lagu'}[S.repeat]);
}

// FULL PLAYER
function openFP(){ $('fullPlayer').classList.add('open'); }
function closeFP(){ $('fullPlayer').classList.remove('open'); }

// HERO
function playHero() { S.pool.length ? playRandom() : toast('⏳ Sedang memuat lagu...'); }
function playIndoRandom() {
  if(S.indoCache&&S.indoCache.length){ _play(S.indoCache[Math.floor(Math.random()*S.indoCache.length)]); }
  else toast('⏳ Indo Hits sedang dimuat...');
}

// MOOD
async function playMood(q) {
  toast('🎵 Memuat lagu sesuai mood...');
  try {
    const r = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=20`);
    const d = await r.json();
    const tracks = (d.data||[]).filter(t=>t.duration>60).map(norm);
    if(tracks.length){ addPool(tracks); _play(tracks[Math.floor(Math.random()*tracks.length)]); }
    else toast('❌ Tidak ada lagu');
  } catch(e){ toast('❌ Koneksi error'); }
}

// FAVORITES
function toggleFav(tj) {
  const t = tj?(typeof tj==='string'?JSON.parse(tj):tj):S.track;
  if(!t){ toast('Tidak ada lagu'); return; }
  const nt=norm(t);
  const idx=S.favs.findIndex(f=>f.id===nt.id);
  if(idx>=0){ S.favs.splice(idx,1); toast('💔 Dihapus dari favorit'); }
  else { S.favs.unshift(nt); toast('❤️ Ditambah ke favorit'); }
  localStorage.setItem('favs',JSON.stringify(S.favs));
  if(S.track&&S.track.id===nt.id) updateFavBtns();
  renderFavs();
}
function renderFavs() {
  const hd=$('favHeader'), cnt=$('favCount');
  if(S.favs.length){
    if(hd) hd.style.display='flex';
    if(cnt) cnt.textContent=`${S.favs.length} lagu`;
    renderRows('favResults',S.favs);
  } else {
    if(hd) hd.style.display='none';
    $('favResults').innerHTML='<div class="empty"><i class="fas fa-heart"></i><p>Belum ada favorit</p><small>Ketuk ❤ pada lagu</small></div>';
  }
}
function shuffleFavs() {
  if(!S.favs.length){ toast('Belum ada favorit'); return; }
  S.queue=[...S.favs].sort(()=>Math.random()-0.5);
  S.qi=0; S.shuffle=true; _play(S.queue[0]);
  toast('🔀 Memutar favorit acak');
}
function playAllFavs() {
  if(!S.favs.length) return;
  S.queue=[...S.favs]; S.qi=0; _play(S.queue[0]);
  toast('▶️ Putar semua favorit');
}

// DOWNLOADS
function dlTrack(tj) {
  const t=tj?(typeof tj==='string'?JSON.parse(tj):tj):S.track;
  if(!t){ toast('Tidak ada lagu'); return; }
  const nt=norm(t);
  toast('⬇️ Mengunduh '+nt.title+'...');
  const a=document.createElement('a');
  a.href=`/api/download?title=${encodeURIComponent(nt.title)}&artist=${encodeURIComponent(nt.artist)}`;
  a.download=`${nt.artist} - ${nt.title}.mp3`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  if(!S.dls.find(d=>d.id===nt.id)){ S.dls.unshift(nt); localStorage.setItem('dls',JSON.stringify(S.dls)); }
  renderDls();
}
function renderDls() {
  const hd=$('dlHeader'), cnt=$('dlCount');
  if(S.dls.length){
    if(hd) hd.style.display='flex';
    if(cnt) cnt.textContent=`${S.dls.length} lagu`;
    renderRows('dlResults',S.dls);
  } else {
    if(hd) hd.style.display='none';
    $('dlResults').innerHTML='<div class="empty"><i class="fas fa-download"></i><p>Belum ada unduhan</p><small>Unduh lagu dari menu ⋯</small></div>';
  }
}
function clearDls() {
  if(!S.dls.length) return;
  S.dls=[]; localStorage.setItem('dls','[]'); renderDls();
  toast('🗑️ Daftar unduhan dikosongkan');
}
function playAllDls() {
  if(!S.dls.length) return;
  S.queue=[...S.dls]; S.qi=0; _play(S.queue[0]);
  toast('▶️ Putar semua unduhan');
}

// RECENTLY PLAYED
function renderRecent() {
  const sec=$('recentSec');
  if(S.recent.length){
    if(sec) sec.style.display='block';
    renderCards('recentCards', S.recent.slice(0,10));
  } else {
    if(sec) sec.style.display='none';
  }
}

// QUICK GRID
function renderQuickGrid() {
  const el=$('quickGrid'); if(!el)return;
  const items=[
    {name:'Favorit Saya', icon:'fas fa-heart', color:'#e91e8c', action:"goTo('favorit');renderFavs()"},
    {name:'Indo Hits', icon:'fas fa-flag', color:'#27ae60', action:"seeAll('indo')"},
    {name:'Chart Global', icon:'fas fa-fire', color:'#e67e22', action:"seeAll('chart')"},
    {name:'Riwayat Putar', icon:'fas fa-clock-rotate-left', color:'#9b59b6', action:"goTo('beranda');document.getElementById('recentSec')?.scrollIntoView({behavior:'smooth'})"},
  ];
  el.innerHTML=items.map(it=>`
    <div class="quick-item" onclick="${it.action}">
      <div class="quick-ic" style="background:${it.color}20;color:${it.color}"><i class="${it.icon}"></i></div>
      <div class="quick-name">${it.name}</div>
    </div>`).join('');
}

// SHARE
function shareTrack() {
  if(!S.track) return;
  const txt=`🎵 "${S.track.title}" - ${S.track.artist}\nDidengarkan di dimusik`;
  if(navigator.share) navigator.share({title:S.track.title,text:txt,url:location.href}).catch(()=>{});
  else navigator.clipboard.writeText(txt).then(()=>toast('📋 Disalin!')).catch(()=>toast('❌ Gagal menyalin'));
}

// QUEUE
function addQueue(tj) {
  const t=typeof tj==='string'?JSON.parse(tj):tj;
  S.queue.push(norm(t)); toast('➕ Ditambah ke antrian');
  renderQueue(); updateQueueNext();
}
function clearQueue() {
  S.queue=[]; S.qi=-1; renderQueue(); updateQueueNext();
  toast('🗑️ Antrian dikosongkan');
}
function renderQueue() {
  const nowEl=$('qNowPlaying');
  if(nowEl&&S.track){
    nowEl.innerHTML=`
      <div class="queue-now-lbl">Sedang Diputar</div>
      <div class="trow" style="cursor:default;border:none;padding:8px 0;margin-bottom:8px">
        <div class="trow-img">
          ${S.track.cover?`<img src="${esc(S.track.cover)}" onerror="this.style.display='none'"/>`:''}
          <div class="trow-ic" style="${S.track.cover?'display:none':''}"><i class="fas fa-music"></i></div>
        </div>
        <div class="trow-info">
          <div class="trow-t" style="color:var(--accent)">${esc(S.track.title)}</div>
          <div class="trow-a">${esc(S.track.artist)}</div>
        </div>
        <i class="fas fa-volume-up" style="color:var(--accent);font-size:13px;padding:8px"></i>
      </div>`;
  }
  const el=$('queueList'); if(!el)return;
  if(!S.queue.length){
    el.innerHTML='<div class="empty"><i class="fas fa-list"></i><p>Antrian kosong</p><small>Tambah lagu dari menu ⋯</small></div>';
    return;
  }
  el.innerHTML=S.queue.map((t,i)=>`
    <div class="trow${i===S.qi?' playing':''}">
      <div class="trow-img">
        ${t.cover?`<img src="${esc(t.cover)}" onerror="this.style.display='none'"/>`:''}
        <div class="trow-ic" style="${t.cover?'display:none':''}"><i class="fas fa-music"></i></div>
      </div>
      <div class="trow-info" onclick="_play(S.queue[${i}]);S.qi=${i};closeQueue()" style="cursor:pointer">
        <div class="trow-t">${esc(t.title)}</div>
        <div class="trow-a">${esc(t.artist)}</div>
      </div>
      <button class="trow-menu" onclick="S.queue.splice(${i},1);if(S.qi>=${i})S.qi=Math.max(0,S.qi-1);renderQueue();updateQueueNext()">
        <i class="fas fa-times"></i>
      </button>
    </div>`).join('');
}
function openQueue(){ $('queueSheet').classList.add('open'); renderQueue(); }
function closeQueue(){ $('queueSheet').classList.remove('open'); }

// TRACK MENU
function openMenu(tj) {
  const t=tj?(typeof tj==='string'?JSON.parse(tj):tj):S.track;
  if(!t)return;
  const nt=norm(t);
  const fav=S.favs.some(f=>f.id===nt.id);
  const ntj=JSON.stringify(JSON.stringify(nt));
  $('menuContent').innerHTML=`
    <div class="bsheet-track">
      ${nt.cover
        ?`<img src="${esc(nt.cover)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/>
           <div class="bsheet-track-ic" style="display:none"><i class="fas fa-music"></i></div>`
        :`<div class="bsheet-track-ic"><i class="fas fa-music"></i></div>`}
      <div class="bsheet-track-info">
        <div>${esc(nt.title)}</div>
        <div>${esc(nt.artist)}</div>
      </div>
    </div>
    <button class="bsheet-btn" onclick='playT(${ntj});closeMenu()'><i class="fas fa-play"></i>Putar Sekarang</button>
    <button class="bsheet-btn" onclick='addQueue(${ntj});closeMenu()'><i class="fas fa-list-end"></i>Tambah ke Antrian</button>
    <button class="bsheet-btn" onclick='toggleFav(${ntj});closeMenu()'><i class="fa${fav?'s':'r'} fa-heart"></i>${fav?'Hapus dari Favorit':'Tambah ke Favorit'}</button>
    <button class="bsheet-btn" onclick='dlTrack(${ntj});closeMenu()'><i class="fas fa-download"></i>Unduh Lagu</button>
    <div class="bsheet-sep"></div>
    <button class="bsheet-btn" onclick='shareTrack();closeMenu()'><i class="fas fa-share-nodes"></i>Bagikan</button>
    <button class="bsheet-btn" onclick='closeMenu();openTimer()'><i class="fas fa-moon"></i>Timer Tidur</button>`;
  $('menuSheet').classList.add('open');
}
function closeMenu(){ $('menuSheet').classList.remove('open'); }

// SLEEP TIMER
function openTimer(){ $('timerSheet').classList.add('open'); updTimerStatus(); }
function closeTimer(){ $('timerSheet').classList.remove('open'); }
function setSleepTimer(min) {
  if(S.sleepInt) clearInterval(S.sleepInt);
  S.sleepEnd = Date.now() + min*60*1000;
  S.sleepInt = setInterval(updTimerStatus, 1000);
  updTimerStatus();
  toast(`😴 Timer ${min} menit aktif`);
}
function cancelSleepTimer() {
  if(S.sleepInt) clearInterval(S.sleepInt);
  S.sleepInt=null; S.sleepEnd=null; updTimerStatus();
  toast('⏰ Timer dibatalkan');
}
function updTimerStatus() {
  const el=$('timerStatus'); if(!el)return;
  if(!S.sleepEnd){ el.textContent='Timer tidak aktif'; return; }
  const rem=Math.max(0,S.sleepEnd-Date.now());
  const m=Math.floor(rem/60000), s=Math.floor((rem%60000)/1000);
  el.textContent=`⏳ Berhenti dalam ${m}:${String(s).padStart(2,'0')}`;
}

// SEARCH
let _st=null;
const si=$('searchInput');
if(si){
  si.addEventListener('input', e=>{
    const q=e.target.value.trim();
    const clr=$('searchClear'); if(clr) clr.style.display=q?'flex':'none';
    const sg=$('searchSugg'), rs=$('searchResults');
    if(!q){ if(sg)sg.style.display='block'; if(rs)rs.style.display='none'; return; }
    if(sg)sg.style.display='none'; if(rs)rs.style.display='flex';
    clearTimeout(_st);
    if(q.length>=2) _st=setTimeout(()=>doSearch(q),500);
  });
  si.addEventListener('keydown',e=>{ if(e.key==='Enter'){ clearTimeout(_st); doSearch(si.value.trim()); } });
}
function clearSearch() {
  if(si) si.value='';
  const clr=$('searchClear'); if(clr) clr.style.display='none';
  const sg=$('searchSugg'),rs=$('searchResults');
  if(sg)sg.style.display='block'; if(rs)rs.style.display='none';
}
async function doSearch(q) {
  if(!q)return;
  const rs=$('searchResults');
  if(rs){ rs.style.display='flex'; rs.innerHTML='<div class="empty"><i class="fas fa-spinner fa-spin"></i><p>Mencari...</p></div>'; }
  try{
    const r=await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=30`);
    const d=await r.json();
    const tracks=(d.data||[]).filter(t=>t.duration>60&&!(t.title||'').toLowerCase().includes('podcast'));
    renderRows('searchResults',tracks);
    if(!tracks.length&&rs) rs.innerHTML='<div class="empty"><i class="fas fa-search"></i><p>Tidak ditemukan</p><small>Coba kata kunci lain</small></div>';
  }catch(e){
    if(rs) rs.innerHTML='<div class="empty"><i class="fas fa-wifi"></i><p>Koneksi error</p></div>';
  }
}

// SUGGESTIONS
const SUGG=['Tulus','Bernadya','Raim Laode','Mahalini','Pamungkas','Hindia','Raisa','Afgan','Isyana Sarasvati','Lyodra','Nadhif Basalamah','Reality Club','Rizky Febian','Tiara Andini'];
function renderSugg() {
  const el=$('suggTags'); if(!el)return;
  el.innerHTML=SUGG.map(s=>`<button class="sugg-tag" onclick="si.value='${s}';doSearch('${s}');document.getElementById('searchSugg').style.display='none';document.getElementById('searchResults').style.display='flex'">${s}</button>`).join('');
}

// GENRE
document.querySelectorAll('.gpill').forEach(btn=>{
  btn.addEventListener('click', async()=>{
    document.querySelectorAll('.gpill').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    goSearch();
    const sg=$('searchSugg'),rs=$('searchResults');
    if(sg)sg.style.display='none'; if(rs){rs.style.display='flex';rs.innerHTML='<div class="empty"><i class="fas fa-spinner fa-spin"></i><p>Memuat...</p></div>';}
    try{
      const r=await fetch(`/api/search?q=${encodeURIComponent(btn.dataset.genre)}&limit=25`);
      const d=await r.json();
      const tracks=(d.data||[]).filter(t=>t.duration>60&&!(t.title||'').toLowerCase().includes('podcast'));
      renderRows('searchResults',tracks);
      if(!tracks.length&&rs) rs.innerHTML='<div class="empty"><i class="fas fa-music"></i><p>Tidak ada lagu</p></div>';
    }catch(e){ toast('❌ Gagal memuat genre'); }
  });
});

// SEE ALL
function seeAll(sec) {
  goSearch();
  const sg=$('searchSugg'),rs=$('searchResults');
  if(sg)sg.style.display='none'; if(rs)rs.style.display='flex';
  if(sec==='indo'&&S.indoCache) renderRows('searchResults',S.indoCache);
  else if(sec==='chart'&&S.chartCache) renderRows('searchResults',S.chartCache);
}

// INDONESIA HITS - 1 lagu per artis
const ARTISTS=['Raim Laode','Tulus','Bernadya','Rizky Febian','Raisa','Tiara Andini','Nadin Amizah','Pamungkas','Mahalini','Judika','Afgan','Isyana Sarasvati','Lyodra','Yura Yunita','Hindia','Fourtwnty','Reality Club','Danilla','Ardhito Pramono','Nadhif Basalamah'];

async function loadIndo() {
  skelCards('indoCards');
  try{
    const picked=[...ARTISTS].sort(()=>Math.random()-0.5).slice(0,14);
    const results=await Promise.all(picked.map(async artist=>{
      try{
        const r=await fetch(`/api/search?q=${encodeURIComponent(artist)}&limit=8`);
        const d=await r.json();
        const tracks=(d.data||[]).filter(t=>{
          const an=typeof t.artist==='object'?t.artist.name:t.artist;
          return (an||'').toLowerCase().includes(artist.split(' ')[0].toLowerCase()) && t.duration>60;
        });
        return tracks.length?[tracks[0]]:[];
      }catch(e){return[];}
    }));
    const tracks=results.flat().filter(Boolean);
    if(tracks.length){ S.indoCache=tracks.map(norm); renderCards('indoCards',tracks); }
    else $('indoCards').innerHTML='<div class="empty" style="padding:16px 0"><i class="fas fa-music"></i><p>Gagal memuat</p></div>';
  }catch(e){
    $('indoCards').innerHTML='<div class="empty" style="padding:16px 0"><i class="fas fa-wifi"></i><p>Error koneksi</p></div>';
  }
}

async function loadChart() {
  skelCards('chartCards');
  try{
    const r=await fetch('/api/chart?limit=20');
    const d=await r.json();
    const tracks=(d.data||[]).filter(t=>t.duration>60);
    if(tracks.length){ S.chartCache=tracks.map(norm); renderCards('chartCards',tracks); }
    else $('chartCards').innerHTML='<div class="empty" style="padding:16px 0"><i class="fas fa-fire"></i><p>Gagal memuat</p></div>';
  }catch(e){
    $('chartCards').innerHTML='<div class="empty" style="padding:16px 0"><i class="fas fa-wifi"></i><p>Error koneksi</p></div>';
  }
}

// VOL INIT
const vs=$('volSlider'); if(vs) vs.value=S.vol;

// KEYBOARD
document.addEventListener('keydown', e=>{
  if(e.target.tagName==='INPUT') return;
  if(e.code==='Space'){ e.preventDefault(); togglePlay(); }
  if(e.code==='ArrowRight') nextTrack();
  if(e.code==='ArrowLeft') prevTrack();
});

// INIT
window.addEventListener('load', ()=>{
  setTimeout(()=>{
    const sp=$('splash');
    if(sp){ sp.style.opacity='0'; setTimeout(()=>{ sp.style.display='none'; $('app').style.visibility='visible'; },700); }
    else $('app').style.visibility='visible';
  }, 2800);

  setGreeting();
  renderQuickGrid();
  renderSugg();
  renderRecent();
  renderFavs();
  renderDls();
  Promise.all([loadIndo(), loadChart()]);
});
