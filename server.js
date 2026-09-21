const express = require('express');
const axios = require('axios');
const { spawn } = require('child_process');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Cari path yt-dlp
const YTDLP = process.env.YTDLP_PATH || 'yt-dlp';

function spawnYtdlp(args) {
  // coba beberapa lokasi umum di Termux
  const paths = [YTDLP, '/data/data/com.termux/files/usr/bin/yt-dlp', '/usr/local/bin/yt-dlp', `${process.env.HOME}/.local/bin/yt-dlp`];
  for (const p of paths) {
    try {
      const fs = require('fs');
      if (p !== YTDLP && !fs.existsSync(p)) continue;
      return spawn(p, args);
    } catch(e) { continue; }
  }
  return spawn(YTDLP, args);
}

// Indonesia hits
app.get('/api/indonesia', async (req, res) => {
  try {
    const queries = ['pop indonesia 2024','lagu indonesia hits','dangdut viral 2024','indie indonesia terbaik'];
    const all = [];
    for (const q of queries) {
      try {
        const r = await axios.get(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=12`);
        all.push(...(r.data.data || []));
      } catch(e) {}
    }
    const seen = new Set();
    const unique = all.filter(t => { if(seen.has(t.id)) return false; seen.add(t.id); return true; })
      .map(t => ({ id: t.id, title: t.title, artist: t.artist.name, album: t.album.title, cover: t.album.cover_big, duration: t.duration }));
    res.json({ success: true, data: unique });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// Chart global
app.get('/api/chart', async (req, res) => {
  try {
    const r = await axios.get('https://api.deezer.com/chart/0/tracks?limit=25');
    const tracks = (r.data.data || []).map(t => ({ id: t.id, title: t.title, artist: t.artist.name, cover: t.album.cover_big, duration: t.duration }));
    res.json({ success: true, data: tracks });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// Search
app.get('/api/search', async (req, res) => {
  try {
    const { q, limit = 20 } = req.query;
    const r = await axios.get(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=${limit}`);
    const tracks = (r.data.data || []).map(t => ({ id: t.id, title: t.title, artist: t.artist.name, album: t.album.title, cover: t.album.cover_big, duration: t.duration }));
    res.json({ success: true, data: tracks });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// Genre
app.get('/api/genre/:genre', async (req, res) => {
  try {
    const map = { pop:'pop indonesia',dangdut:'dangdut koplo',rock:'rock indonesia',jazz:'jazz',rnb:'rnb',hiphop:'hip hop indonesia',electronic:'electronic',acoustic:'acoustic indonesia',kpop:'kpop',viral:'viral tiktok indonesia' };
    const q = map[req.params.genre] || req.params.genre;
    const r = await axios.get(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=20`);
    const tracks = (r.data.data || []).map(t => ({ id: t.id, title: t.title, artist: t.artist.name, cover: t.album.cover_big, duration: t.duration }));
    res.json({ success: true, data: tracks });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// Stream via yt-dlp
app.get('/api/stream', (req, res) => {
  const { title, artist } = req.query;
  if (!title) return res.status(400).end();
  const query = `${title} ${artist || ''} official audio`;
  
  const proc = spawnYtdlp([
    `ytsearch1:${query}`,
    '--no-playlist',
    '-f', 'bestaudio[ext=m4a]/bestaudio/best',
    '--no-warnings', '--quiet',
    '-o', '-'
  ]);

  res.setHeader('Content-Type', 'audio/mp4');
  res.setHeader('Transfer-Encoding', 'chunked');
  proc.stdout.pipe(res);
  proc.stderr.on('data', d => console.error('[yt-dlp]', d.toString().trim()));
  proc.on('error', e => {
    console.error('[spawn]', e.message);
    if (!res.headersSent) res.status(500).json({ error: 'yt-dlp not found. Run: pip install yt-dlp' });
  });
  req.on('close', () => { try { proc.kill('SIGKILL'); } catch(e) {} });
});

// Download
app.get('/api/download', (req, res) => {
  const { title, artist } = req.query;
  if (!title) return res.status(400).end();
  const query = `${title} ${artist || ''} official audio`;
  const fname = `${title} - ${artist || 'Unknown'}.mp3`.replace(/[<>:"/\\|?*]/g, '');
  res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
  res.setHeader('Content-Type', 'audio/mpeg');
  const proc = spawnYtdlp([`ytsearch1:${query}`,'--no-playlist','-f','bestaudio[ext=m4a]/bestaudio/best','--no-warnings','--quiet','-o','-']);
  proc.stdout.pipe(res);
  proc.stderr.on('data', d => console.error('[dl]', d.toString().trim()));
  proc.on('error', e => { if(!res.headersSent) res.status(500).end(); });
  req.on('close', () => { try { proc.kill('SIGKILL'); } catch(e) {} });
});

app.get('/api/test', (req,res) => res.json({ ok: true, time: new Date().toISOString() }));

app.listen(PORT, () => console.log(`🎵 Nada running → http://localhost:${PORT}`));
