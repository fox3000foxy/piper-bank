// Site Piper TTS Explorer — static dist/ + API /api/infer (pipertts natif JS)
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const DIST = path.join(__dirname, 'dist');
const PORT = 8280;
const CSV_PATH = path.join(os.homedir(), 'huggingface-crawler/models_mapping.csv');
const DATA_MODELS = path.join(DIST, 'data', 'models.json');
const CACHE_DIR = path.join(os.homedir(), '.piper-web-cache');
const HF_TOKEN = (() => {
  try {
    for (const line of fs.readFileSync(path.join(os.homedir(), 'huggingface-crawler/.env'), 'utf8').split('\n'))
      if (line.startsWith('HF_TOKEN=') && !line.trim().startsWith('#')) return line.split('=')[1].trim();
  } catch {}
  return process.env.HF_TOKEN || '';
})();

let models = [];
try { models = JSON.parse(fs.readFileSync(DATA_MODELS, 'utf8')); } catch {}
if (!models.length) {
  try { models = JSON.parse(fs.readFileSync(path.join(__dirname, 'src', 'data', 'models.json'), 'utf8')); } catch {}
}

const { execFileSync, execFile } = require('child_process');

const MODEL_LOADERS = new Map(); // key -> Promise<PiperNativeTTS>
const { PiperNativeTTS } = require('pipertts/dist/native/voice.js');

function lookupModel(name) {
  const n = String(name || '').toLowerCase().trim();
  return models.find((m) => m.usable && m.name.toLowerCase().trim() === n);
}

function ensureDownloaded(m) {
  const dir = path.join(CACHE_DIR, (m.repo + '--' + m.onnx).replace(/[/]/g, '--'));
  const modelFile = path.join(dir, m.onnx);
  const jsonFile = path.join(dir, m.json);
  if (!fs.existsSync(modelFile) || !fs.existsSync(jsonFile)) {
    fs.mkdirSync(dir, { recursive: true });
    execFileSync('hf', ['download', m.repo, m.onnx, m.json, '--local-dir', dir, '--quiet'],
      { env: { ...process.env, HF_TOKEN }, timeout: 600_000 });
  }
  // piper compat: <model>.json adjacent
  const expected = modelFile + '.json';
  if (path.resolve(expected) !== path.resolve(jsonFile) && !fs.existsSync(expected))
    fs.symlinkSync(jsonFile, expected);
  return { modelFile, jsonFile };
}

function getVoice(m, speakerName) {
  const key = m.repo + '|' + m.onnx + '|' + (speakerName || '');
  if (!MODEL_LOADERS.has(key)) {
    const p = (async () => {
      const { modelFile, jsonFile } = ensureDownloaded(m);
      return PiperNativeTTS.load({ modelPath: modelFile, configPath: jsonFile, numThreads: 2 });
    })();
    MODEL_LOADERS.set(key, p);
    p.catch(() => MODEL_LOADERS.delete(key));
  }
  return MODEL_LOADERS.get(key);
}

function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  const file = path.join(DIST, p);
  if (!file.startsWith(DIST)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { // SPA fallback
      fs.readFile(path.join(DIST, 'index.html'), (e2, buf2) => {
        if (e2) { res.writeHead(404); return res.end('404'); }
        res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(buf2);
      });
      return;
    }
    const ext = path.extname(file);
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
      '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.wav': 'audio/wav', '.ico': 'image/x-icon' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': 'public, max-age=600' });
    res.end(buf);
  });
}

async function readBody(req) {
  let chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/api/models') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(models.filter((m) => m.usable)));
  }

  if (req.method === 'POST' && url.pathname === '/api/infer') {
    try {
      const body = await readBody(req);
      const m = lookupModel(body.model);
      if (!m) { res.writeHead(404, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'Model not found' })); }
      const text = String(body.text || '').trim();
      if (!text) { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'Empty text' })); }
      // optional voice selection by name
      const speakerName = String(body.voice || '').trim();
      let loadOpts = {};
      let synOpts = {};
      if (speakerName && m.voiceNames.includes(speakerName)) {
        loadOpts = {}; // single load; speaker passed at synthesis
        synOpts.speakerId = m.voiceNames.indexOf(speakerName);
      }
      if (body.lengthScale != null) synOpts.lengthScale = Number(body.lengthScale);
      if (body.noiseScale != null) synOpts.noiseScale = Number(body.noiseScale);
      if (body.noiseW != null) synOpts.noiseW = Number(body.noiseW);
      const voice = await getVoice(m, speakerName);
      const t0 = Date.now();
      const result = await voice.synthesize(text, { outputFormat: 'wav', ...synOpts });
      res.writeHead(200, {
        'Content-Type': 'audio/wav',
        'X-Sample-Rate': String(result.sampleRate),
        'X-Duration-Ms': String(Date.now() - t0),
      });
      return res.end(result.audio);
    } catch (e) {
      console.error('[/api/infer]', e);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  serveStatic(req, res, url);
});

server.listen(PORT, '0.0.0.0', () => console.log(`piper-site on :${PORT}`));
