// Inférence Piper 100% navigateur : onnxruntime-web (vendored) + piper espeak wasm (vendored).
// Utilisé par les pages modèle. Aucun serveur requis.
let ortMod = null;
let phonemizeFactory = null;
const sessions = new Map(); // key -> InferenceSession
const ASSET_BASE = (import.meta.env.BASE_URL || '/');

// ── Lituanien ─────────────────────────────────────────────────────────────
// Port de phonemize_lithuanian.py (piper1-gpl, GPL-3.0-or-later) via pipertts.
// Données : public/piper-data/lithuanian/*.tsv (CC-BY-4.0, OHF-Voice/piper1-gpl).
const LT_ESPEAK_VOICE = 'lt';
const LT_ACUTE = 'ˈ';
const LT_CIRCUMFLEX = 'ˌ';
const LT_GRAVE = 'ˋ';
const LT_STRESS_MARKS = LT_ACUTE + LT_CIRCUMFLEX + LT_GRAVE;
const LT_IPA_VOWELS = 'aeiouɑɐɔɛɪʊæøɘəɜ';
const LT_LENGTH = 'ː';
const LT_CONSONANT_MODIFIERS = 'ʲʷʰ̩';
const LT_WORD_CLEAN = /[^a-zA-ZąčęėįšųūžĄČĘĖĮŠŲŪŽ0-9]/g;
const LT_KEEP_PUNCT = '.,!?:;';
const LT_SENTENCE_SPLIT = /(?<=[.!?…])\s+/;
const LT_STRIP_DIACRITICS = new Map([..."ąčęėįšųūžĄČĘĖĮŠŲŪŽ"].map((c, i) => [c, "aceeisuuzACEEISUUZ"[i]]));
const LT_VOCATIVE_OPENERS = [",", ":", "-", "–", "—"];
const LT_VOCATIVE_CLOSERS = [",", ".", "!", "?", "…"];
function stripLtDiacritics(word) {
  return [...word].map((c) => LT_STRIP_DIACRITICS.get(c) ?? c).join("");
}
function loadLtDictionary(content) {
  const entries = new Map();
  for (const line of content.split("\n")) {
    if (line.startsWith("#")) continue;
    const parts = line.replace(/\n$/, "").split("\t");
    if ((parts.length === 3 || parts.length === 4) && LT_STRESS_MARKS.includes(parts[2])) {
      const group = parts.length === 4 ? parts[3] : parts[1];
      entries.set(parts[0], { groupIndex: parseInt(group, 10), mark: parts[2] });
    }
  }
  return entries;
}
function loadLtLetters(content) {
  const letters = new Map();
  for (const line of content.split("\n")) {
    if (line.startsWith("#")) continue;
    const parts = line.replace(/\n$/, "").split("\t");
    if (parts.length < 2 || !parts[1]) continue;
    const prefixes = parts.length > 2 ? parts[2].split(",").filter(Boolean) : [];
    letters.set(parts[0].toLowerCase(), { ipa: parts[1], prefixes });
  }
  return letters;
}
function loadLtVocatives(content) {
  const words = new Set();
  for (const line of content.split("\n")) {
    if (line.startsWith("#")) continue;
    const word = line.replace(/\n$/, "").split("\t")[0].trim().toLowerCase();
    if (word) words.add(stripLtDiacritics(word));
  }
  return words;
}
function ltLetterIpa(word, nextWord, letters) {
  const entry = letters.get(word.toLowerCase());
  if (!entry) return null;
  for (const prefix of entry.prefixes) {
    if (nextWord.toLowerCase().startsWith(prefix)) return null;
  }
  return entry.ipa;
}
function ltIsVocative(words, tokens, i, vocatives) {
  if (vocatives.size === 0) return false;
  if (!vocatives.has(stripLtDiacritics(words[i].toLowerCase()))) return false;
  const opened = i === 0 || LT_VOCATIVE_OPENERS.some((op) => tokens[i - 1].trimEnd().endsWith(op));
  const closed = i === tokens.length - 1 || LT_VOCATIVE_CLOSERS.some((cl) => tokens[i].trimEnd().endsWith(cl));
  return opened && closed;
}
function ltIpaVowelGroups(ipa) {
  const chars = [...ipa];
  const groups = [];
  let i = 0;
  while (i < chars.length) {
    if (LT_IPA_VOWELS.includes(chars[i])) {
      const start = i;
      while (i + 1 < chars.length && (LT_IPA_VOWELS.includes(chars[i + 1]) || chars[i + 1] === LT_LENGTH)) i += 1;
      groups.push(start);
    }
    i += 1;
  }
  return groups;
}
function ltPlaceAccent(ipa, groupIndex, mark) {
  const clean = [...ipa].filter((c) => !LT_STRESS_MARKS.includes(c));
  const groups = ltIpaVowelGroups(clean.join(""));
  if (groupIndex === null || groupIndex === undefined || groupIndex >= groups.length) return ipa;
  const p = groups[groupIndex];
  let i = p - 1;
  while (i >= 0 && LT_CONSONANT_MODIFIERS.includes(clean[i])) i -= 1;
  if (i >= 0 && !LT_IPA_VOWELS.includes(clean[i]) && clean[i] !== " " && clean[i] !== LT_LENGTH) i -= 1;
  let boundary = i + 1;
  const jStop = i;
  let j = jStop;
  while (j >= 0 && !LT_IPA_VOWELS.includes(clean[j]) && clean[j] !== " ") j -= 1;
  if (j < 0 || clean[j] === " ") boundary = j + 1;
  return clean.slice(0, boundary).join("") + mark + clean.slice(boundary).join("");
}
function ltVocativeAccent(ipa) {
  const accented = ltPlaceAccent(ipa, 0, LT_ACUTE);
  const chars = [...accented];
  const groups = ltIpaVowelGroups(accented);
  if (groups.length === 0) return accented;
  const start = groups[0];
  let end = start;
  while (end + 1 < chars.length && (LT_IPA_VOWELS.includes(chars[end + 1]) || chars[end + 1] === LT_LENGTH)) end += 1;
  if (end !== start) return accented;
  return chars.slice(0, end + 1).join("") + LT_LENGTH + LT_LENGTH + chars.slice(end + 1).join("");
}
let ltData = null;
async function ltLoadData() {
  if (ltData) return ltData;
  const base = ASSET_BASE + 'piper-data/lithuanian/';
  const get = async (f) => {
    try {
      const r = await fetch(base + f);
      if (r.ok) return await r.text();
    } catch {}
    return '';
  };
  const [d, l, v] = await Promise.all([get('lt_kirciai.tsv'), get('lt_raides.tsv'), get('lt_kreipiniai.tsv')]);
  ltData = { dictionary: loadLtDictionary(d), letters: loadLtLetters(l), vocatives: loadLtVocatives(v) };
  return ltData;
}
const ltWordCache = new Map();
async function ltEspeakWord(word, idToSym) {
  const hit = ltWordCache.get(word);
  if (hit !== undefined) return hit;
  if (ltWordCache.size > 50000) ltWordCache.clear();
  const ids = await phonemizeEspeak(LT_ESPEAK_VOICE, word);
  const ipa = ids.filter((id) => id !== 0 && id !== 1 && id !== 2).map((id) => idToSym[id] ?? '').join('').replace(/ʂ/g, 's');
  ltWordCache.set(word, ipa);
  return ipa;
}
async function ltPhonemizeWord(word, data, idToSym) {
  let ipa = await ltEspeakWord(word, idToSym);
  const entry = data.dictionary.get(word.toLowerCase());
  if (!entry) {
    if (![...ipa].some((c) => LT_STRESS_MARKS.includes(c))) {
      const groups = ltIpaVowelGroups(ipa);
      if (groups.length > 0) {
        const chars = [...ipa];
        const p = groups[0];
        ipa = chars.slice(0, p).join('') + LT_ACUTE + chars.slice(p).join('');
      }
    }
    return ipa;
  }
  return ltPlaceAccent(ipa, entry.groupIndex, entry.mark);
}
async function phonemizeLithuanian(text, idMap) {
  const data = await ltLoadData();
  const idToSym = {};
  for (const [sym, arr] of Object.entries(idMap)) idToSym[arr[0]] = sym;
  const sentences = [];
  for (const sentence of text.trim().split(LT_SENTENCE_SPLIT)) {
    if (!sentence) continue;
    const tokens = sentence.split(/\s+/).filter(Boolean);
    const words = tokens.map((t) => t.replace(LT_WORD_CLEAN, ''));
    const pieces = [];
    for (let i = 0; i < tokens.length; i++) {
      const word = words[i];
      const punct = [...tokens[i]].filter((c) => LT_KEEP_PUNCT.includes(c)).join('');
      if (!word) {
        if (punct && pieces.length > 0) pieces[pieces.length - 1] += punct;
        continue;
      }
      const override = ltLetterIpa(word, words[i + 1] ?? '', data.letters);
      let ipa = override ?? (await ltPhonemizeWord(word, data, idToSym));
      if (override === null && ltIsVocative(words, tokens, i, data.vocatives)) ipa = ltVocativeAccent(ipa);
      pieces.push(ipa + punct);
    }
    if (pieces.length > 0) sentences.push(pieces.join(' '));
  }
  const out = [];
  for (const ch of sentences.join(' ')) {
    const arr = idMap[ch];
    if (arr) out.push(...arr);
  }
  return out;
}


export async function loadStack(onStatus) {
  if (!ortMod) {
    onStatus?.('chargement moteur onnx…');
    ortMod = await import(/* @vite-ignore */ (import.meta.env.BASE_URL || '/') + 'vendor-ort/ort.web.min.mjs');
    try { ortMod.env.wasm.wasmPaths = (import.meta.env.BASE_URL || '/') + 'vendor-ort/'; } catch {}
  }
  if (!phonemizeFactory) {
    onStatus?.('chargement phonémiseur…');
    phonemizeFactory = (await import(/* @vite-ignore */ (import.meta.env.BASE_URL || '/') + 'vendor-piper/piper-o91UDS6e.js')).createPiperPhonemize;
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

let phonMod = null, phonOut = '', phonErr = '';
async function getPhonMod(locateFile) {
  if (!phonMod) {
    await loadStack();
    phonMod = await phonemizeFactory({
      print: (data) => { phonOut += data; },
      printErr: (msg) => { phonErr = msg; },
      locateFile,
    });
  }
  return phonMod;
}
export async function phonemizeEspeak(voice, text) {
  const mod = await getPhonMod((url) => {
    if (url.endsWith('.wasm')) return (import.meta.env.BASE_URL || '/') + 'vendor-piper/piper_phonemize.wasm';
    if (url.endsWith('.data')) return (import.meta.env.BASE_URL || '/') + 'vendor-piper/piper_phonemize.data';
    return url;
  });
  phonOut = '';
  phonErr = '';
  await mod.callMain(['-l', voice, '--input', JSON.stringify([{ text: text.trim() }]), '--espeak_data', '/espeak-ng-data']);
  if (phonErr) throw new Error(phonErr);
  return JSON.parse(phonOut).phoneme_ids;
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
    : opts.phonemeType === 'lithuanian'
    ? await phonemizeLithuanian(opts.text, idMap)
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
