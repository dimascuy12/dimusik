const express = require('express');
const axios = require('axios');
const { spawn, execSync } = require('child_process');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Install & detect yt-dlp ──────────────────────────────────────
function installAndDetect() {
  // Coba install yt-dlp terbaru via pip
  const pipCmds = [
    'pip3 install -U yt-dlp',
    'pip install -U yt-dlp',
    'python3 -m pip install -U yt-dlp',
  ];

  for (const cmd of pipCmds) {
    try {
      console.log(`⏳ Trying: ${cmd}`);
      execSync(cmd, { timeout: 60000, stdio: 'pipe' });
      console.log('✅ yt-dlp installed via pip');
      break;
    } catch(e) {}
  }

  // Cari path
  const candidates = [
    '/root/.local/bin/yt-dlp',
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp',
    `${process.env.HOME}/.local/bin/yt-dlp`,
    '/app/.local/bin/yt-dlp',
  ];

  for (const p of candidates) {
    try {
      const v = execSync(`${p} --version 2>/dev/null`).toString().trim();
      console.log(`✅ yt-dlp ready: ${p} v${v}`);
      return p;
    } catch(e) {}
  }

  // Coba python module
  for (const py of ['python3', 'python']) {
    try {
      const v = execSync(`${py} -m yt_dlp --version 2>/dev/null`).toString().trim();
      console.log(`✅ yt-dlp via ${py} -m yt_dlp v${v}`);
      return `${py}::module`;
    } catch(e) {}
  }

  // Fallback ke youtube-dl-exec bawaan
  const fallback = '/app/node_modules/youtube-dl-exec/bin/yt-dlp';
  try {
    execSync(`${fallback} --version 2>/dev/null`);
    console.log(`⚠️ Using fallback: ${fallback}`);
    return fallback;
  } catch(e) {}

  return null;
}

let YTDLP = installAndDetect();

function spawnYtdlp(args) {
  const env = {
    ...process.env,
    PATH: `/root/.local/bin:/home/user/.local/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH || ''}`,
    PYTHONPATH: process.env.PYTHONPATH || '',
  };

  // python3 -m yt_dlp
  if (YTDLP && YTDLP.includes('::module')) {
    const py = YTDLP.replace('::module', '');
    return spawn(py, ['-m', 'yt_dlp', ...args], { env });
  }

  return spawn(YTDLP || 'yt-dlp', args, { env });
}

// ── TEST ─────────────────────────────────────────────────────────
app.get('/api/test', (req, res) => {
  res.json({
    ok: true,
    ytdlp: YTDLP || 'NOT FOUND',
    ytdlpFound: !!YTDLP,
    time: new Date().toISOString(),
    node: process.version
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
      'Reality Club','Danilla','Ardhito Pramono','Nadhif Basalamah'
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
        all.push(...(filtered.length ? filtered : (r.data.data||[]).slice(0,2)));
      } catch(e) {}
    }
    const seen = new Set();
    const data = all
      .filter(t => { if(seen.has(t.id)) return false; seen.add(t.id); return true; })
      .map(t => ({
        id: t.id, title: t.title,
        artist: t.artist.name, album: t.album.title,
        cover: t.album.cover_big, duration: t.duration
      }));
    res.json({ success: true, data });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── CHART ─────────────────────────────────────────────────────────
app.get('/api/chart', async (req, res) => {
  try {
    const r = await axios.get('https://api.deezer.com/chart/0/tracks?limit=25', { timeout: 5000 });
    const data = (r.data.data || []).map(t => ({
      id: t.id, title: t.title,
      artist: t.artist.name,
      cover: t.album.cover_big,
      duration: t.duration
    }));
    res.json({ success: true, data });
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
    const data = (r.data.data || []).map(t => ({
      id: t.id, title: t.title,
      artist: t.artist.name, album: t.album.title,
      cover: t.album.cover_big, duration: t.duration
    }));
    res.json({ success: true, data });
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
    const data = (r.data.data || []).map(t => ({
      id: t.id, title: t.title,
      artist: t.artist.name,
      cover: t.album.cover_big,
      duration: t.duration
    }));
    res.json({ success: true, data });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── STREAM ────────────────────────────────────────────────────────
app.get('/api/stream', (req, res) => {
  const { title, artist } = req.query;
  if (!title) return res.status(400).json({ error: 'title required' });
  if (!YTDLP) return res.status(500).json({ error: 'yt-dlp not available' });

  const query = `${title} ${artist || ''} official audio`;
  console.log(`[STREAM] ${query}`);

  res.setHeader('Content-Type', 'audio/mp4');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const proc = spawnYtdlp([
    `ytsearch1:${query}`,
    '--no-playlist',
    '-f', 'bestaudio[ext=m4a]/bestaudio/best',
    '--no-warnings',
    '--quiet',
    '--no-cache-dir',
    '--geo-bypass',
    '-o', '-'
  ]);

  let started = false;

  proc.stdout.on('data', chunk => {
    started = true;
    if (!res.writableEnded) res.write(chunk);
  });

  proc.stdout.on('end', () => {
    if (!res.writableEnded) res.end();
  });

  proc.stderr.on('data', d => {
    const msg = d.toString().trim();
    if (msg) console.error('[yt-dlp]', msg);
  });

  proc.on('error', e => {
    console.error('[spawn error]', e.message);
    if (!res.headersSent) res.status(500).json({ error: e.message });
    else if (!res.writableEnded) res.end();
  });

  proc.on('close', code => {
    console.log(`[yt-dlp] done (code ${code}), started=${started}`);
    if (!started && !res.headersSent) {
      res.status(500).json({ error: 'yt-dlp produced no output' });
    } else if (!res.writableEnded) {
      res.end();
    }
  });

  req.on('close', () => {
    try { proc.kill('SIGKILL'); } catch(e) {}
  });
});

// ── DOWNLOAD ──────────────────────────────────────────────────────
app.get('/api/download', (req, res) => {
  const { title, artist } = req.query;
  if (!title) return res.status(400).json({ error: 'title required' });
  if (!YTDLP) return res.status(500).json({ error: 'yt-dlp not available' });

  const query = `${title} ${artist || ''} official audio`;
  const fname = `${title} - ${artist || 'Unknown'}.mp3`.replace(/[<>:"/\\|?*]/g,'');

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
