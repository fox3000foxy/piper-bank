// Inférence Piper 100% navigateur : onnxruntime-web (vendored) + piper espeak wasm (vendored).
// Utilisé par les pages modèle. Aucun serveur requis.
const HERE = new URL('.', import.meta.url).href;
let ortMod = null;
let phonemizeFactory = null;
const sessions = new Map(); // key -> InferenceSession

export async function loadStack(onStatus) {
  if (!ortMod) {
    onStatus?.('chargement moteur onnx…');
    ortMod = await import(/* @vite-ignore */ HERE + 'vendor-ort/ort.web.min.mjs');
    try { ortMod.env.wasm.wasmPaths = HERE + 'vendor-ort/'; } catch {}
  }
  if (!phonemizeFactory) {
    onStatus?.('chargement phonémiseur…');
    phonemizeFactory = (await import(/* @vite-ignore */ HERE + 'vendor-piper/piper-o91UDS6e.js')).createPiperPhonemize;
  }
  return ortMod;
}

export async function getSession(repo, onnx, onStatus) {
  const key = repo + '|' + onnx;
  if (sessions.has(key)) return sessions.get(key);
  const ort = (await loadStack(onStatus)).default ?? (await loadStack(onStatus));
  const O = ort.InferenceSession ? ort : ort.default;
  const url = `https://huggingface.co/${repo}/resolve/main/${onnx.split('/').map(encodeURIComponent).join('/')}`;
  const open = (bytes) => O.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
  const cached = await idbGet(key);
  if (cached && cached.data) {
    onStatus?.('voix en cache…');
    const session = await open(cached.data);
    sessions.set(key, session);
    refreshVoice(key, url, cached.size, onStatus);
    return session;
  }
  onStatus?.('téléchargement voix…');
  const res = await fetch(url);
  if (!res.ok) throw new Error('voix introuvable (' + res.status + ')');
  const data = await res.arrayBuffer();
  idbPut({ key, data, size: data.byteLength, savedAt: Date.now() });
  const session = await open(data);
  sessions.set(key, session);
  return session;
}

// Revalide en arrière-plan : si le fichier HF a changé de taille, on
// retélécharge et on remplace la session (les modèles en entraînement bougent).
async function refreshVoice(key, url, cachedSize, onStatus) {
  try {
    const head = await fetch(url, { method: 'HEAD' });
    const len = Number(head.headers.get('content-length') || 0);
    if (!len || len === cachedSize) return;
    onStatus?.('mise à jour voix…');
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.arrayBuffer();
    idbPut({ key, data, size: data.byteLength, savedAt: Date.now() });
    const ort = await loadStack();
    const O = ort.InferenceSession ? ort : ort.default;
    sessions.set(key, await O.InferenceSession.create(data, { executionProviders: ['wasm'] }));
    onStatus?.('voix à jour.');
  } catch {}
}

const IDB_DB = 'piper-bank', IDB_STORE = 'voices', IDB_MAX = 15;

function idb() {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(IDB_DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE, { keyPath: 'key' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (e) { reject(e); }
  });
}

async function idbGet(key) {
  try {
    const db = await idb();
    return await new Promise((resolve, reject) => {
      const rq = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key);
      rq.onsuccess = () => resolve(rq.result || null);
      rq.onerror = () => reject(rq.error);
    });
  } catch { return null; }
}

async function idbPut(entry) {
  try {
    const db = await idb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put(entry);
      const all = store.getAll();
      all.onsuccess = () => {
        const rows = (all.result || []).sort((a, b) => a.savedAt - b.savedAt);
        while (rows.length > IDB_MAX) store.delete(rows.shift().key);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {}
}

export function phonemizeText(text, idMap) {
  const pad = idMap._?.[0] ?? 0, bos = idMap['^']?.[0] ?? 1, eos = idMap['$']?.[0] ?? 2;
  const sp = idMap[' '] || [3];
  const ids = [pad, bos];
  for (const ch of text.toLowerCase()) {
    const v = idMap[ch];
    if (v) ids.push(...v);
    ids.push(...sp);
  }
  ids.push(eos, pad);
  return ids;
}

export async function phonemizeEspeak(voice, text) {
  await loadStack();
  const ids = await new Promise((resolve, reject) => {
    phonemizeFactory({
      print: (data) => { try { resolve(JSON.parse(data).phoneme_ids); } catch (e) { reject(e); } },
      printErr: (msg) => reject(new Error(msg)),
      locateFile: (url) => {
        if (url.endsWith('.wasm')) return HERE + 'vendor-piper/piper_phonemize.wasm';
        if (url.endsWith('.data')) return HERE + 'vendor-piper/piper_phonemize.data';
        return url;
      },
    }).then((mod) => mod.callMain(['-l', voice, '--input', JSON.stringify([{ text: text.trim() }]), '--espeak_data', '/espeak-ng-data']));
  });
  return ids;
}

export function idsToWav(floats, sampleRate) {
  const bpe = 2, n = floats.length;
  const buf = new ArrayBuffer(44 + n * bpe), w = new DataView(buf);
  const wr = (o, s) => { for (let i = 0; i < s.length; i++) w.setUint8(o + i, s.charCodeAt(i)); };
  wr(0, 'RIFF'); w.setUint32(4, 36 + n * bpe, true); wr(8, 'WAVE'); wr(12, 'fmt ');
  w.setUint32(16, 16, true); w.setUint16(20, 1, true); w.setUint16(22, 1, true);
  w.setUint32(24, sampleRate, true); w.setUint32(28, sampleRate * bpe, true);
  w.setUint16(32, bpe, true); w.setUint16(34, 16, true); wr(36, 'data'); w.setUint32(40, n * bpe, true);
  for (let i = 0; i < n; i++) {
    const x = Math.max(-1, Math.min(1, floats[i]));
    w.setInt16(44 + i * bpe, x < 0 ? x * 0x8000 : x * 0x7fff, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}

export async function synthesize(opts, onStatus) {
  // opts: {repo, onnx, configs, phonemeType, phonemeIdMap, sampleRate, text, speakerId, noiseScale, lengthScale, noiseW}
  const ort = await loadStack(onStatus);
  const O = ort.InferenceSession ? ort : ort.default;
  const session = await getSession(opts.repo, opts.onnx, onStatus);
  onStatus?.('phonemisation…');
  const idMap = opts.phonemeIdMap;
  const ids = opts.phonemeType === 'text'
    ? phonemizeText(opts.text, idMap)
    : await phonemizeEspeakVoice(opts, idMap);
  onStatus?.('synthèse…');
  const inf = (opts.configs || {}).inference || {};
  const scales = new Float32Array([
    opts.noiseScale ?? inf.noise_scale ?? 0.667,
    opts.lengthScale ?? inf.length_scale ?? 1.0,
    opts.noiseW ?? inf.noise_w ?? 0.8,
  ]);
  const feeds = {
    input: new O.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
    input_lengths: new O.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
    scales: new O.Tensor('float32', scales, [3]),
  };
  if (opts.speakerId != null) {
    feeds.sid = new O.Tensor('int64', BigInt64Array.from([BigInt(opts.speakerId)]), [1]);
  }
  const out = await session.run(feeds);
  const audio = Object.values(out)[0].data;
  return idsToWav(audio, opts.sampleRate || 22050);
}

async function phonemizeEspeakVoice(opts, idMap) {
  const voice = ((opts.configs || {}).espeak || {}).voice || 'en-us';
  const phonemes = await phonemizeEspeak(voice, opts.text);
  // wasm already returns ids; map defensively if it returned phoneme strings
  if (phonemes.length && typeof phonemes[0] === 'number') return phonemes;
  const pad = idMap._?.[0] ?? 0, bos = idMap['^']?.[0] ?? 1, eos = idMap['$']?.[0] ?? 2;
  const ids = [pad, bos];
  for (const p of phonemes) {
    const v = idMap[p];
    if (v) ids.push(...v);
    ids.push(...(idMap[' '] || [3]));
  }
  ids.push(eos, pad);
  return ids;
}
