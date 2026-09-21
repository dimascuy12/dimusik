const express = require('express');
const axios = require('axios');
const { spawn, execSync } = require('child_process');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Detect yt-dlp ────────────────────────────────────────────────
function getYtdlpPath() {
  // Semua kemungkinan path
  const candidates = [
    'yt-dlp',
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp',
    '/bin/yt-dlp',
    `${process.env.HOME}/.local/bin/yt-dlp`,
    '/root/.local/bin/yt-dlp',
    '/home/user/.local/bin/yt-dlp',
    '/nix/var/nix/profiles/default/bin/yt-dlp',
    '/nix/store/bin/yt-dlp'
  ];

  // Coba satu per satu
  for (const p of candidates) {
    try {
      const out = execSync(`${p} --version 2>/dev/null`).toString().trim();
      console.log(`✅ yt-dlp found: ${p} (${out})`);
      return p;
    } catch(e) {}
  }

  // Coba via which
  try {
    const found = execSync('which yt-dlp 2>/dev/null').toString().trim();
    if (found) { console.log(`✅ yt-dlp via which: ${found}`); return found; }
  } catch(e) {}

  // Coba via python3 -m yt_dlp
  try {
    execSync('python3 -m yt_dlp --version 2>/dev/null');
    console.log('✅ yt-dlp via python3 -m yt_dlp');
    return 'python3 -m yt_dlp';
  } catch(e) {}

  // Coba via python -m yt_dlp
  try {
    execSync('python -m yt_dlp --version 2>/dev/null');
    console.log('✅ yt-dlp via python -m yt_dlp');
    return 'python -m yt_dlp';
  } catch(e) {}

  // Cari di seluruh sistem
  try {
    const found = execSync('find / -name "yt-dlp" -type f 2>/dev/null | head -1').toString().trim();
    if (found) { console.log(`✅ yt-dlp found via find: ${found}`); return found; }
  } catch(e) {}

  console.error('❌ yt-dlp not found anywhere!');
  return null;
}

let YTDLP = getYtdlpPath();

// Coba install otomatis kalau tidak ketemu
if (!YTDLP) {
  console.log('⏳ Trying to install yt-dlp...');
  try {
    execSync('pip3 install yt-dlp 2>&1', { stdio: 'inherit' });
    YTDLP = getYtdlpPath();
  } catch(e) {
    try {
      execSync('pip install yt-dlp 2>&1', { stdio: 'inherit' });
      YTDLP = getYtdlpPath();
    } catch(e2) {
      console.error('❌ Auto-install failed');
    }
  }
}

function spawnYtdlp(args) {
  const env = {
    ...process.env,
    PATH: `/root/.local/bin:/home/user/.local/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH || ''}`
  };

  // Handle "python3 -m yt_dlp" case
  if (YTDLP && YTDLP.includes(' ')) {
    const parts = YTDLP.split(' ');
    return spawn(parts[0], [...parts.slice(1), ...args], { env });
  }

  if (!YTDLP) {
    // Fallback: coba youtube-dl-exec
    try {
      const ytdl = require('youtube-dl-exec');
      console.log('Using youtube-dl-exec fallback');
    } catch(e) {}
  }

  return spawn(YTDLP || 'yt-dlp', args, { env });
}

// ── TEST endpoint ─────────────────────────────────────────────────
app.get('/api/test', (req, res) => {
  res.json({
    ok: true,
    ytdlp: YTDLP || 'NOT FOUND',
    ytdlpFound: !!YTDLP,
    time: new Date().toISOString(),
    node: process.version,
    platform: process.platform
  });
});

// ── INDONESIA ─────────────────────────────────────────────────────
app.get('/api/indonesia', async (req, res) => {
  try {
    const artists = [
      'Raim Laode','Tulus','Bernadya','Rizky Febian',
      'Raisa','Tiara Andini','Nadin Amizah','Pamungkas',
      'Mahalini','Judika','Afgan','Isyana Sarasvati',
      'Lyodra','Yura Yunita','Hindia','Fourtwnty',
      'Reality Club','Danilla'
    ];
    let all = [];
    for (const q of artists) {
      try {
        const r = await axios.get(
          `https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=3`,
          { timeout: 5000 }
        );
        const filtered = (r.data.data || []).filter(t =>
          t.artist.name.toLowerCase().includes(q.split(' ')[0].toLowerCase()) ||
          q.toLowerCase().includes(t.artist.name.split(' ')[0].toLowerCase())
        );
        all.push(...(filtered.length ? filtered : (r.data.data || []).slice(0,2)));
      } catch(e) {}
    }
    const seen = new Set();
    const unique = all
      .filter(t => { if(seen.has(t.id)) return false; seen.add(t.id); return true; })
      .map(t => ({
        id: t.id, title: t.title,
        artist: t.artist.name, album: t.album.title,
        cover: t.album.cover_big, duration: t.duration
      }));
    res.json({ success: true, data: unique });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── CHART ─────────────────────────────────────────────────────────
app.get('/api/chart', async (req, res) => {
  try {
    const r = await axios.get('https://api.deezer.com/chart/0/tracks?limit=25', { timeout: 5000 });
    const tracks = (r.data.data || []).map(t => ({
      id: t.id, title: t.title,
      artist: t.artist.name,
      cover: t.album.cover_big,
      duration: t.duration
    }));
    res.json({ success: true, data: tracks });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── SEARCH ────────────────────────────────────────────────────────
app.get('/api/search', async (req, res) => {
  try {
    const { q, limit = 25 } = req.query;
    const r = await axios.get(
      `https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=${limit}`,
      { timeout: 5000 }
    );
    const tracks = (r.data.data || []).map(t => ({
      id: t.id, title: t.title,
      artist: t.artist.name, album: t.album.title,
      cover: t.album.cover_big, duration: t.duration
    }));
    res.json({ success: true, data: tracks });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── GENRE ─────────────────────────────────────────────────────────
app.get('/api/genre/:genre', async (req, res) => {
  try {
    const map = {
      pop:'pop indonesia', dangdut:'dangdut koplo',
      rock:'rock indonesia', jazz:'jazz indonesia',
      rnb:'rnb hits', hiphop:'hip hop indonesia',
      electronic:'electronic dance', acoustic:'acoustic indonesia',
      kpop:'kpop', viral:'viral tiktok indonesia'
    };
    const q = map[req.params.genre] || req.params.genre;
    const r = await axios.get(
      `https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=20`,
      { timeout: 5000 }
    );
    const tracks = (r.data.data || []).map(t => ({
      id: t.id, title: t.title,
      artist: t.artist.name,
      cover: t.album.cover_big,
      duration: t.duration
    }));
    res.json({ success: true, data: tracks });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── STREAM ────────────────────────────────────────────────────────
app.get('/api/stream', (req, res) => {
  const { title, artist } = req.query;
  if (!title) return res.status(400).json({ error: 'title required' });

  if (!YTDLP) {
    return res.status(500).json({
      error: 'yt-dlp not available on this server'
    });
  }

  const query = `${title} ${artist || ''} official audio`;
  console.log(`[STREAM] "${query}"`);

  res.setHeader('Content-Type', 'audio/mp4');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');

  const proc = spawnYtdlp([
    `ytsearch1:${query}`,
    '--no-playlist',
    '-f', 'bestaudio[ext=m4a]/bestaudio/best',
    '--no-warnings',
    '--quiet',
    '--no-cache-dir',
    '-o', '-'
  ]);

  proc.stdout.pipe(res);

  proc.stderr.on('data', d => {
    const msg = d.toString().trim();
    if (msg) console.error('[yt-dlp]', msg);
  });

  proc.on('error', e => {
    console.error('[spawn]', e.message);
    if (!res.headersSent) res.status(500).json({ error: e.message });
  });

  req.on('close', () => { try { proc.kill('SIGKILL'); } catch(e) {} });
});

// ── DOWNLOAD ──────────────────────────────────────────────────────
app.get('/api/download', (req, res) => {
  const { title, artist } = req.query;
  if (!title) return res.status(400).json({ error: 'title required' });
  if (!YTDLP) return res.status(500).json({ error: 'yt-dlp not available' });

  const query = `${title} ${artist || ''} official audio`;
  const fname = `${title} - ${artist || 'Unknown'}.mp3`.replace(/[<>:"/\\|?*]/g, '');

  res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
  res.setHeader('Content-Type', 'audio/mpeg');

  const proc = spawnYtdlp([
    `ytsearch1:${query}`,
    '--no-playlist',
    '-f', 'bestaudio[ext=m4a]/bestaudio/best',
    '--no-warnings', '--quiet',
    '--no-cache-dir',
    '-o', '-'
  ]);

  proc.stdout.pipe(res);
  proc.stderr.on('data', d => console.error('[dl]', d.toString().trim()));
  proc.on('error', e => { if (!res.headersSent) res.status(500).end(); });
  req.on('close', () => { try { proc.kill('SIGKILL'); } catch(e) {} });
});

app.listen(PORT, () => {
  console.log(`🎵 dimusik running at http://localhost:${PORT}`);
  console.log(`📦 yt-dlp: ${YTDLP || '❌ NOT FOUND'}`);
});
