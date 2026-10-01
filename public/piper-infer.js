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
  onStatus?.('téléchargement voix…');
  const url = `https://huggingface.co/${repo}/resolve/main/${onnx.split('/').map(encodeURIComponent).join('/')}`;
  const session = await O.InferenceSession.create(url, { executionProviders: ['wasm'] });
  sessions.set(key, session);
  return session;
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
