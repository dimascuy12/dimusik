const express = require('express');
const axios = require('axios');
const { spawn, execSync } = require('child_process');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Auto-detect yt-dlp path ──────────────────────────────────────
function getYtdlpPath() {
  const candidates = [
    'yt-dlp',
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp',
    `${process.env.HOME}/.local/bin/yt-dlp`,
    '/root/.local/bin/yt-dlp',
    '/nix/var/nix/profiles/default/bin/yt-dlp'
  ];
  for (const p of candidates) {
    try {
      execSync(`${p} --version`, { stdio: 'ignore' });
      console.log(`✅ yt-dlp found at: ${p}`);
      return p;
    } catch(e) {}
  }
  // fallback: cari pakai which
  try {
    const found = execSync('which yt-dlp').toString().trim();
    if (found) { console.log(`✅ yt-dlp found via which: ${found}`); return found; }
  } catch(e) {}
  console.error('❌ yt-dlp not found!');
  return 'yt-dlp';
}

const YTDLP = getYtdlpPath();

function spawnYtdlp(args) {
  return spawn(YTDLP, args, {
    env: { ...process.env, PATH: `/root/.local/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH}` }
  });
}

// ── TEST ─────────────────────────────────────────────────────────
app.get('/api/test', (req, res) => {
  res.json({
    ok: true,
    ytdlp: YTDLP,
    time: new Date().toISOString(),
    node: process.version
  });
});

// ── INDONESIA HITS ────────────────────────────────────────────────
app.get('/api/indonesia', async (req, res) => {
  try {
    const queries = [
      'Raim Laode', 'Tulus', 'Bernadya', 'Rizky Febian',
      'Raisa', 'Tiara Andini', 'Nadin Amizah', 'Pamungkas',
      'Mahalini', 'Judika', 'Afgan', 'Isyana Sarasvati',
      'Lyodra', 'Yura Yunita', 'Hindia', 'Fourtwnty'
    ];
    let all = [];
    for (const q of queries) {
      try {
        const r = await axios.get(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=3`);
        const filtered = (r.data.data || []).filter(t =>
          t.artist.name.toLowerCase().includes(q.split(' ')[0].toLowerCase()) ||
          q.toLowerCase().includes(t.artist.name.split(' ')[0].toLowerCase())
        );
        all.push(...(filtered.length ? filtered : (r.data.data || []).slice(0, 2)));
      } catch(e) {}
    }
    const seen = new Set();
    const unique = all
      .filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true; })
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
    const r = await axios.get('https://api.deezer.com/chart/0/tracks?limit=25');
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
    const r = await axios.get(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=${limit}`);
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
      pop: 'pop indonesia',
      dangdut: 'dangdut koplo',
      rock: 'rock indonesia',
      jazz: 'jazz indonesia',
      rnb: 'rnb hits',
      hiphop: 'hip hop indonesia',
      electronic: 'electronic dance',
      acoustic: 'acoustic indonesia',
      kpop: 'kpop',
      viral: 'viral tiktok indonesia'
    };
    const q = map[req.params.genre] || req.params.genre;
    const r = await axios.get(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=20`);
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

  const query = `${title} ${artist || ''} official audio`;
  console.log(`[STREAM] ${query}`);

  const proc = spawnYtdlp([
    `ytsearch1:${query}`,
    '--no-playlist',
    '-f', 'bestaudio[ext=m4a]/bestaudio/best',
    '--no-warnings',
    '--quiet',
    '-o', '-'
  ]);

  res.setHeader('Content-Type', 'audio/mp4');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Cache-Control', 'no-cache');

  proc.stdout.pipe(res);

  proc.stderr.on('data', d => {
    const msg = d.toString().trim();
    if (msg) console.error('[yt-dlp stderr]', msg);
  });

  proc.on('error', e => {
    console.error('[spawn error]', e.message);
    if (!res.headersSent) {
      res.status(500).json({ error: `yt-dlp failed: ${e.message}` });
    }
  });

  proc.on('close', code => {
    console.log(`[yt-dlp] exited with code ${code}`);
  });

  req.on('close', () => {
    try { proc.kill('SIGKILL'); } catch(e) {}
  });
});

// ── DOWNLOAD ──────────────────────────────────────────────────────
app.get('/api/download', (req, res) => {
  const { title, artist } = req.query;
  if (!title) return res.status(400).json({ error: 'title required' });

  const query = `${title} ${artist || ''} official audio`;
  const fname = `${title} - ${artist || 'Unknown'}.mp3`.replace(/[<>:"/\\|?*]/g, '');

  res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
  res.setHeader('Content-Type', 'audio/mpeg');

  const proc = spawnYtdlp([
    `ytsearch1:${query}`,
    '--no-playlist',
    '-f', 'bestaudio[ext=m4a]/bestaudio/best',
    '--no-warnings',
    '--quiet',
    '-o', '-'
  ]);

  proc.stdout.pipe(res);
  proc.stderr.on('data', d => console.error('[dl]', d.toString().trim()));
  proc.on('error', e => { if (!res.headersSent) res.status(500).end(); });
  req.on('close', () => { try { proc.kill('SIGKILL'); } catch(e) {} });
});

app.listen(PORT, () => {
  console.log(`🎵 dimusik running at http://localhost:${PORT}`);
  console.log(`📦 yt-dlp path: ${YTDLP}`);
});
