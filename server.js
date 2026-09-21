const express = require('express');
const { execSync, spawn } = require('child_process');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

console.log(`🔧 PORT env = ${process.env.PORT}`);
console.log(`🔧 Using PORT = ${PORT}`);

let YTDLP_CMD = null;

function tryInstall() {
  const cmds = [
    'pip3 install -U yt-dlp',
    'pip install -U yt-dlp',
    'python3 -m pip install -U yt-dlp --break-system-packages'
  ];
  for (const cmd of cmds) {
    try {
      console.log(`⏳ Trying: ${cmd}`);
      execSync(cmd, { stdio: 'pipe', timeout: 120000 });
      console.log(`✅ yt-dlp installed via pip`);
      return true;
    } catch (e) { continue; }
  }
  return false;
}

function detectYtdlp() {
  const paths = [
    '/root/.local/bin/yt-dlp',
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp',
    `${process.env.HOME}/.local/bin/yt-dlp`,
    '/app/.local/bin/yt-dlp',
  ];
  for (const p of paths) {
    try {
      execSync(`"${p}" --version`, { stdio: 'pipe', timeout: 10000 });
      console.log(`✅ yt-dlp binary: ${p}`);
      return p;
    } catch (e) { continue; }
  }
  try {
    const v = execSync('python3 -m yt_dlp --version', { stdio: 'pipe', timeout: 10000 }).toString().trim();
    console.log(`✅ yt-dlp via python3 module: ${v}`);
    return 'python3::module';
  } catch (e) {}
  try {
    execSync('python -m yt_dlp --version', { stdio: 'pipe', timeout: 10000 });
    return 'python::module';
  } catch (e) {}
  return null;
}

tryInstall();
YTDLP_CMD = detectYtdlp();

if (!YTDLP_CMD) {
  console.warn('⚠️  yt-dlp tidak ditemukan!');
} else {
  console.log(`📦 yt-dlp: ${YTDLP_CMD}`);
}

function spawnYtdlp(args) {
  if (!YTDLP_CMD) throw new Error('yt-dlp tidak tersedia');
  if (YTDLP_CMD.includes('::module')) {
    const prog = YTDLP_CMD.split('::')[0];
    return spawn(prog, ['-m', 'yt_dlp', ...args]);
  }
  return spawn(YTDLP_CMD, args);
}

function getVersion() {
  try {
    if (!YTDLP_CMD) return 'not found';
    if (YTDLP_CMD.includes('::module')) {
      const prog = YTDLP_CMD.split('::')[0];
      return execSync(`${prog} -m yt_dlp --version`, { stdio: 'pipe', timeout: 10000 }).toString().trim();
    }
    return execSync(`"${YTDLP_CMD}" --version`, { stdio: 'pipe', timeout: 10000 }).toString().trim();
  } catch (e) { return 'error'; }
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/test', (req, res) => {
  res.json({
    status: 'ok',
    ytdlp: YTDLP_CMD || 'not found',
    version: getVersion(),
    node: process.version,
    port: PORT,
    uptime: Math.floor(process.uptime()) + 's'
  });
});

app.get('/api/search', async (req, res) => {
  try {
    const { q, limit = 20 } = req.query;
    if (!q) return res.status(400).json({ error: 'Query wajib diisi' });
    const axios = require('axios');
    const resp = await axios.get(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=${limit}`);
    res.json(resp.data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/chart', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const axios = require('axios');
    const resp = await axios.get(`https://api.deezer.com/chart/0/tracks?limit=${limit}`);
    res.json(resp.data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/stream', (req, res) => {
  const { title, artist } = req.query;
  if (!title) return res.status(400).json({ error: 'title wajib diisi' });
  if (!YTDLP_CMD) return res.status(503).json({ error: 'yt-dlp tidak tersedia' });

  const query = `ytsearch1:${title}${artist ? ' ' + artist : ''} audio`;
  const args = [
    '--no-playlist',
    '--format', 'bestaudio/best',
    '--extract-audio',
    '--audio-format', 'mp3',
    '--audio-quality', '5',
    '-o', '-',
    '--no-part',
    '--no-mtime',
    '--geo-bypass',
    '--quiet',
    query
  ];

  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');

  let proc;
  try { proc = spawnYtdlp(args); }
  catch (e) { return res.status(503).json({ error: e.message }); }

  proc.stdout.pipe(res);
  proc.stderr.on('data', (d) => {
    const msg = d.toString();
    if (!msg.includes('[download]')) console.error('yt-dlp:', msg.trim());
  });
  proc.on('close', () => { if (!res.writableEnded) res.end(); });
  proc.on('error', (err) => {
    if (!res.headersSent) res.status(500).json({ error: err.message });
    else if (!res.writableEnded) res.end();
  });
  req.on('close', () => { if (proc && !proc.killed) proc.kill('SIGKILL'); });
});

app.get('/api/download', (req, res) => {
  const { title, artist } = req.query;
  if (!title) return res.status(400).json({ error: 'title wajib diisi' });
  if (!YTDLP_CMD) return res.status(503).json({ error: 'yt-dlp tidak tersedia' });

  const query = `ytsearch1:${title}${artist ? ' ' + artist : ''} audio`;
  const filename = `${artist ? artist + ' - ' : ''}${title}.mp3`.replace(/[/\\?%*:|"<>]/g, '_');
  const args = [
    '--no-playlist',
    '--format', 'bestaudio/best',
    '--extract-audio',
    '--audio-format', 'mp3',
    '--audio-quality', '3',
    '-o', '-',
    '--no-part',
    '--no-mtime',
    '--geo-bypass',
    '--quiet',
    query
  ];

  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  let proc;
  try { proc = spawnYtdlp(args); }
  catch (e) { return res.status(503).json({ error: e.message }); }

  proc.stdout.pipe(res);
  proc.stderr.on('data', (d) => {
    const msg = d.toString();
    if (!msg.includes('[download]')) console.error('yt-dlp:', msg.trim());
  });
  proc.on('close', () => { if (!res.writableEnded) res.end(); });
  proc.on('error', (err) => {
    if (!res.headersSent) res.status(500).json({ error: err.message });
    else if (!res.writableEnded) res.end();
  });
  req.on('close', () => { if (proc && !proc.killed) proc.kill('SIGKILL'); });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🎵 dimusik running at http://localhost:${PORT}`);
});
