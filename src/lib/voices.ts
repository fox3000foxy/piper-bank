// Shared helpers about voice models: sample URLs and derived traits.

const HF_SAMPLES = 'https://huggingface.co/datasets/fox3000foxy/piper-samples/resolve/main/';

/** URL of a pre-rendered sample (same naming as the sample generator). */
export function sampleUrl(repo: string, onnx: string, sid = 0, n = 0): string {
  const base = (repo.replace('/', '--') + '__' + onnx.replace('/', '_').replace(/\.onnx$/, '')).replace(/[^a-zA-Z0-9\-_.]/g, '_');
  return `${HF_SAMPLES}${base}__sp${sid}__${n}.wav`;
}

const FEMALE = /\b(female|woman|women|girl|feminine|feminin|féminin|femme|weiblich|mujer|donna|kadın|женск)/i;
const MALE = /\b(male|man|men|boy|masculine|masculin|homme|männlich|hombre|uomo|erkek|мужск)/i;
const EMOTION = /\b(joy|joyeuse|happy|amused|angry|colere|colère|sad|triste|surprised?|suprised|fear|disgust(ed)?|whisper|storytelling|excited|sleepy|drunk|interrogative)\b/i;

/**
 * Traits read from what the data actually says (names, speaker names, collections).
 * Only explicit mentions count: a voice without a mention gets no gender trait.
 */
export function voiceTraits(m: { name: string; slug: string; voiceNames?: string[]; avatar?: { universe?: string } | null; dataset?: unknown }): string[] {
  const names = (m.voiceNames || []).join(' ');
  const hay = `${m.name} ${m.slug.replace(/-/g, ' ')} ${names}`;
  const out: string[] = [];
  if (EMOTION.test(names)) out.push('expressive');
  if ((m.avatar?.universe && m.avatar.universe !== 'default') || m.dataset) out.push('character');
  const f = FEMALE.test(hay), ma = MALE.test(hay.replace(FEMALE, ''));
  if (f) out.push('female');
  if (ma) out.push('male');
  return out;
}
