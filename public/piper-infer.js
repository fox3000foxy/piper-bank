// Inférence Piper 100% navigateur : onnxruntime-web (vendored) + piper espeak wasm (vendored).
// Utilisé par les pages modèle. Aucun serveur requis.
const HERE = new URL('.', import.meta.url).href;
let ortMod = null;
let phonemizeFactory = null;
const sessions = new Map(); // key -> InferenceSession
const ASSET_BASE = HERE;

// ── Hébreu ────────────────────────────────────────────────────────────────
// Port de hebrew/__init__.py + hebrew_ipa.py (piper1-gpl, GPL-3.0-or-later)
// via pipertts. Modèle nakdimon.onnx : MIT (elazarg/nakdimon).
// Données : public/piper-data/hebrew/nakdimon.onnx.
/**
 * Hebrew phonemizer (MVP).
 *
 * TypeScript port of piper1-gpl `src/piper/phonemize_hebrew.py`,
 * `src/piper/hebrew/__init__.py` (Nakdimon) and
 * `src/piper/hebrew/hebrew_ipa.py` (GPL-3.0-or-later; Nakdimon model MIT).
 * Model (`nakdimon.onnx`) downloads on demand, see `data.ts`.
 */
// ---------- Nakdimon tables (vendored) ----------
const RAFE = "ֿ";
const HEBREW_LETTERS = Array.from({ length: 0x05ea - 0x05d0 + 1 }, (_, i) => String.fromCharCode(0x05d0 + i));
const NIQQUD_TABLE = [
    RAFE,
    ...Array.from({ length: 0x05bc - 0x05b0 + 1 }, (_, i) => String.fromCharCode(0x05b0 + i)),
    "ַ",
];
const SHIN_YEMANIT = "ׁ";
const SHIN_SMALIT = "ׂ";
const NIQQUD_SIN = [RAFE, SHIN_YEMANIT, SHIN_SMALIT];
const DAGESH_LETTER = "ּ";
const DAGESH_TABLE = [RAFE, DAGESH_LETTER];
const VALID_LETTERS = [
    " ",
    "!",
    '"',
    "'",
    "(",
    ")",
    ",",
    "-",
    ".",
    ":",
    ";",
    "?",
    ...HEBREW_LETTERS,
];
const SPECIAL_TOKENS = ["H", "O", "5"];
const ENDINGS_TO_REGULAR = new Map([..."ךםןףץ"].map((c, i) => [c, [..."כמנפצ"][i]]));
const LETTER_CHARS = ["", ...SPECIAL_TOKENS, ...VALID_LETTERS];
const VALID_LETTER_SET = new Set(VALID_LETTERS);
const NIQQUD_CHARS = ["", ...NIQQUD_TABLE];
const DAGESH_CHARS = ["", ...DAGESH_TABLE];
const SIN_CHARS = ["", ...NIQQUD_SIN];
const CHAR_TO_ID = new Map(LETTER_CHARS.map((c, i) => [c, i]));
const NIQQUD_DETECT = /[ְ-ׇּֿׁׂ]/;
function removeNiqqud(text) {
    return text.replace(NIQQUD_DETECT, "");
}
function normalizeChar(c) {
    if (VALID_LETTER_SET.has(c)) {
        return c;
    }
    const ending = ENDINGS_TO_REGULAR.get(c);
    if (ending) {
        return ending;
    }
    if (c === "\n" || c === "\t") {
        return " ";
    }
    if ("־‒–—―−".includes(c)) {
        return "-";
    }
    if (c === "[") {
        return "(";
    }
    if (c === "]") {
        return ")";
    }
    if ("´‘’".includes(c)) {
        return "'";
    }
    if ("“”״".includes(c)) {
        return '"';
    }
    if (/\d/.test(c)) {
        return "5";
    }
    if (c === "…") {
        return ",";
    }
    if ("ײװױ".includes(c)) {
        return "H";
    }
    return "O";
}
function canDagesh(letter) {
    return DAGESHABLE.has(letter);
}
function canSin(letter) {
    return letter === "ש";
}
function canNiqqud(letter) {
    return NIQQUDABLE.has(letter);
}
const DAGESHABLE = new Set([..."בגדהוזטיכלמנספצקשתךף"]);
const NIQQUDABLE = new Set([..."אבגדהוזחטיכלמנסעפצקרשתךן"]);
/** Nakdimon ONNX diacritizer restoring Hebrew niqqud. Port of hebrew/__init__.py.
 * Version navigateur : session onnxruntime-web, modèle fetché une fois. */
let nakSession = null, nakInput = '';
async function nakLoad(O) {
  if (nakSession) return;
  const res = await fetch(ASSET_BASE + 'piper-data/hebrew/nakdimon.onnx');
  if (!res.ok) throw new Error('nakdimon.onnx introuvable');
  const bytes = await res.arrayBuffer();
  nakSession = await O.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
  nakInput = nakSession.inputNames[0];
  if (!nakInput) throw new Error('nakdimon.onnx sans entrée.');
}
async function nakDiacritize(O, text) {
  await nakLoad(O);
  const bare = removeNiqqud(text);
  const letters = [...bare];
  if (letters.length === 0) return text;
  const ids = letters.map((c) => CHAR_TO_ID.get(normalizeChar(c)) ?? 0);
  const feeds = { [nakInput]: new O.Tensor('float32', Float32Array.from(ids), [1, ids.length]) };
  const results = await nakSession.run(feeds);
  const nOut = Array.from(results.N?.data ?? []);
  const dOut = Array.from(results.D?.data ?? []);
  const sOut = Array.from(results.S?.data ?? []);
  const n = letters.length;
  const argmax = (data, classes, row) => {
    let best = 0, bestV = -Infinity;
    for (let c = 0; c < classes; c++) {
      const v = data[row * classes + c];
      if (v > bestV) { bestV = v; best = c; }
    }
    return best;
  };
  const out = [];
  for (let i = 0; i < n; i++) {
    const letter = letters[i];
    out.push(letter);
    if (canDagesh(letter)) out.push(DAGESH_CHARS[argmax(dOut, 3, i)]);
    if (canSin(letter)) out.push(SIN_CHARS[argmax(sOut, 4, i)]);
    if (canNiqqud(letter)) out.push(NIQQUD_CHARS[argmax(nOut, 16, i)]);
  }
  return out.join('').replaceAll(RAFE, '');
}
async function phonemizeHebrew(O, text, idMap) {
  let dotted = text;
  if (!NIQQUD_DETECT.test(text)) dotted = await nakDiacritize(O, text);
  const ipa = hebrewToIpa(dotted);
  const out = [];
  for (const ch of ipa) {
    const arr = idMap[ch];
    if (arr) out.push(...arr);
  }
  return out;
}
// ---------- hebrew_ipa rules ----------
const TAAMIM = /[֑-֯]/g;
const DAGESH = "ּ";
const SHIN_DOT = "ׁ";
const SIN_DOT = "ׂ";
const GERESH = "׳";
const SHEVA = "ְ";
const HATAF_SEGOL = "ֱ";
const HATAF_PATAH = "ֲ";
const HATAF_QAMATS = "ֳ";
const HIRIQ = "ִ";
const TSERE = "ֵ";
const SEGOL = "ֶ";
const PATAH = "ַ";
const QAMATS = "ָ";
const HOLAM = "ֹ";
const QUBUTZ = "ֻ";
const QAMATS_QATAN = "ׇ";
const VOWEL_MARKS = new Set([
    SHEVA,
    HATAF_SEGOL,
    HATAF_PATAH,
    HATAF_QAMATS,
    HIRIQ,
    TSERE,
    SEGOL,
    PATAH,
    QAMATS,
    HOLAM,
    QUBUTZ,
    QAMATS_QATAN,
]);
const ALEF = "א";
const BET = "ב";
const GIMEL = "ג";
const DALET = "ד";
const HE = "ה";
const VAV = "ו";
const ZAYIN = "ז";
const HET = "ח";
const TET = "ט";
const YOD = "י";
const KAF = "כ";
const LAMED = "ל";
const MEM = "מ";
const NUN = "נ";
const SAMEKH = "ס";
const AYIN = "ע";
const PE = "פ";
const TSADI = "צ";
const QOF = "ק";
const RESH = "ר";
const SHIN = "ש";
const TAV = "ת";
const FINAL_FORM_BASE = new Map([
    ["ך", KAF],
    ["ם", MEM],
    ["ן", NUN],
    ["ף", PE],
    ["ץ", TSADI],
]);
const GERESH_DIGRAPHS = new Map([
    [GIMEL + GERESH, "d͡ʒ"],
    [ZAYIN + GERESH, "ʒ"],
    [TSADI + GERESH, "t͡ʃ"],
]);
function isCombining(ch) {
    return /\p{M}/u.test(ch);
}
function iterGlyphs(word) {
    const clean = word.normalize("NFC").replace(TAAMIM, "");
    const glyphs = [];
    for (const ch of clean) {
        if (isCombining(ch)) {
            if (glyphs.length > 0) {
                glyphs[glyphs.length - 1].marks.push(ch);
            }
        }
        else {
            glyphs.push({ base: ch, marks: [] });
        }
    }
    return glyphs;
}
function applyGereshDigraphs(glyphs) {
    const out = [];
    let i = 0;
    while (i < glyphs.length) {
        const g = glyphs[i];
        const nxt = glyphs[i + 1];
        if (nxt && nxt.base === GERESH && GERESH_DIGRAPHS.has(g.base + GERESH)) {
            out.push({
                base: `<IPA:${GERESH_DIGRAPHS.get(g.base + GERESH)}>`,
                marks: [],
            });
            i += 2;
            continue;
        }
        out.push(g);
        i += 1;
    }
    return out;
}
function mapConsonant(base, marks, isFinal) {
    const b = FINAL_FORM_BASE.get(base) ?? base;
    if (b === ALEF || b === AYIN) {
        return "<GLT>";
    }
    if (b === HE) {
        if (isFinal && !marks.includes(DAGESH)) {
            return "";
        }
        return "h";
    }
    if (b === YOD) {
        return "j";
    }
    if (b === VAV) {
        return "v";
    }
    if (b === SHIN) {
        if (marks.includes(SHIN_DOT)) {
            return "ʃ";
        }
        if (marks.includes(SIN_DOT)) {
            return "s";
        }
        return "ʃ";
    }
    if (b === BET) {
        return marks.includes(DAGESH) ? "b" : "v";
    }
    if (b === KAF) {
        return marks.includes(DAGESH) ? "k" : "χ";
    }
    if (b === PE) {
        return marks.includes(DAGESH) ? "p" : "f";
    }
    if (b === GIMEL) {
        return "g";
    }
    if (b === DALET) {
        return "d";
    }
    if (b === HET) {
        return "χ";
    }
    if (b === TET) {
        return "t";
    }
    if (b === LAMED) {
        return "l";
    }
    if (b === MEM) {
        return "m";
    }
    if (b === NUN) {
        return "n";
    }
    if (b === SAMEKH) {
        return "s";
    }
    if (b === TSADI) {
        return "t͡s";
    }
    if (b === QOF) {
        return "k";
    }
    if (b === RESH) {
        return "ʁ";
    }
    if (b === TAV) {
        return "t";
    }
    if (b === ZAYIN) {
        return "z";
    }
    return "";
}
function hasVowelMarks(marks) {
    return marks.some((m) => VOWEL_MARKS.has(m));
}
function isHiriqYod(curr, nxt) {
    return (curr.marks.includes(HIRIQ) &&
        !!nxt &&
        nxt.base === YOD &&
        !hasVowelMarks(nxt.marks));
}
function isHolamMale(g) {
    return g.base === VAV && g.marks.includes(HOLAM) && !g.marks.includes(DAGESH);
}
function isShuruk(curr) {
    const nonVowel = [
        HOLAM,
        HIRIQ,
        TSERE,
        SEGOL,
        PATAH,
        QAMATS,
        QUBUTZ,
        QAMATS_QATAN,
        SHEVA,
        HATAF_SEGOL,
        HATAF_PATAH,
        HATAF_QAMATS,
    ];
    return (curr.base === VAV &&
        curr.marks.includes(DAGESH) &&
        !curr.marks.some((m) => nonVowel.includes(m)));
}
function mapBasicVowel(g) {
    if (g.marks.includes(QAMATS_QATAN)) {
        return ["o", true];
    }
    if (g.marks.includes(QUBUTZ)) {
        return ["u", true];
    }
    if (g.marks.includes(HIRIQ)) {
        return ["i", true];
    }
    if (g.marks.includes(TSERE)) {
        return ["e", true];
    }
    if (g.marks.includes(SEGOL)) {
        return ["e", true];
    }
    if (g.marks.includes(PATAH)) {
        return ["a", true];
    }
    if (g.marks.includes(QAMATS)) {
        return ["a", true];
    }
    if (g.marks.includes(HATAF_PATAH)) {
        return ["a", true];
    }
    if (g.marks.includes(HATAF_SEGOL)) {
        return ["e", true];
    }
    if (g.marks.includes(HATAF_QAMATS)) {
        return ["o", true];
    }
    if (g.marks.includes(SHEVA)) {
        return ["ə", false];
    }
    return ["", false];
}
function wordToSegments(word) {
    const glyphs = applyGereshDigraphs(iterGlyphs(word));
    const segs = [];
    let onset = [];
    let i = 0;
    while (i < glyphs.length) {
        const g = glyphs[i];
        const nxt = glyphs[i + 1];
        const isFinal = i === glyphs.length - 1;
        if (isShuruk(g)) {
            segs.push({ onset, nucleus: "u", coda: [], dagesh: false });
            onset = [];
            i += 1;
            continue;
        }
        if (isHiriqYod(g, nxt)) {
            const cons = mapConsonant(g.base, g.marks, false);
            if (cons && cons !== "<GLT>") {
                onset.push(cons);
            }
            segs.push({ onset, nucleus: "i", coda: [], dagesh: false });
            onset = [];
            i += 2;
            continue;
        }
        if (isHolamMale(g)) {
            segs.push({ onset, nucleus: "o", coda: [], dagesh: false });
            onset = [];
            i += 1;
            continue;
        }
        const cons = mapConsonant(g.base, g.marks, isFinal);
        const [v, isVoc] = mapBasicVowel(g);
        if (isVoc) {
            if (cons && cons !== "<GLT>") {
                onset.push(cons);
            }
            segs.push({ onset, nucleus: v, coda: [], dagesh: false });
            onset = [];
        }
        else if (g.marks.includes(SHEVA)) {
            if (cons && cons !== "<GLT>") {
                onset.push(cons);
            }
            segs.push({
                onset,
                nucleus: "ə",
                coda: [],
                dagesh: g.marks.includes(DAGESH),
            });
            onset = [];
        }
        else if (cons === "<GLT>") {
            onset.push("ʔ");
        }
        else if (cons) {
            onset.push(cons);
        }
        i += 1;
    }
    if (onset.length > 0 && segs.length > 0) {
        segs[segs.length - 1].coda.push(...onset);
    }
    return segs;
}
function resolveShevaAndQamats(segs) {
    let prevSilenced = false;
    for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        if (s.nucleus !== "ə") {
            prevSilenced = false;
            continue;
        }
        const dageshChazak = s.dagesh && i > 0;
        const na = i === 0 || dageshChazak || prevSilenced;
        if (na) {
            s.nucleus = "e";
            prevSilenced = false;
        }
        else {
            if (i - 1 >= 0) {
                segs[i - 1].coda.push(...s.onset);
            }
            s.onset = [];
            s.nucleus = "";
            prevSilenced = true;
        }
    }
    const merged = [];
    for (const s of segs) {
        if (s.nucleus === "") {
            if (merged.length > 0) {
                merged[merged.length - 1].coda.push(...s.onset);
            }
            else {
                merged.push(s);
            }
            continue;
        }
        merged.push(s);
    }
    return merged;
}
function syllabifyToIpa(segs) {
    let stressIndex = segs.length - 1;
    if (segs.length === 2 &&
        segs[segs.length - 1].coda.length > 0) {
        stressIndex = 0;
    }
    const pieces = [];
    segs.forEach((s, idx) => {
        const before = s.onset.join("");
        const after = s.coda.join("");
        pieces.push(idx === stressIndex
            ? `${before}ˈ${s.nucleus}${after}`
            : `${before}${s.nucleus}${after}`);
    });
    return pieces.join("");
}
/** Convert one dotted Hebrew word to IPA. Port of hebrew/hebrew_ipa.py. */
function hebrewWordToIpa(word) {
    let ipa = syllabifyToIpa(resolveShevaAndQamats(wordToSegments(word)));
    ipa = ipa
        .replace(/ʔ(?=ˈ?[aeiouə])/g, "ʔ")
        .replace(/^ʔ/, "ʔ")
        .replace(/ʔ(?=[^aeiouəˈ]|$)/g, "");
    return ipa.replace(/͡/g, "");
}
/** Convert dotted Hebrew text to space-joined word IPA. Port of hebrew/hebrew_ipa.py. */
function hebrewToIpa(text) {
    const clean = text.normalize("NFC").replace(TAAMIM, "");
    return clean.split(/\s+/).filter(Boolean).map(hebrewWordToIpa).join(" ");
}

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
    if (url.endsWith('.wasm')) return HERE + 'vendor-piper/piper_phonemize.wasm';
    if (url.endsWith('.data')) return HERE + 'vendor-piper/piper_phonemize.data';
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
    : opts.phonemeType === 'hebrew'
    ? await phonemizeHebrew(O, opts.text, idMap)
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
