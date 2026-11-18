# Gen: src/data/traits.json — gender, age and style of each voice model.
#
# Sources, from most to least reliable:
#   1. the Hugging Face model card, when the repository holds a single model
#      and the card names a single gender;
#   2. the pitch of the pre-rendered samples (fox3000foxy/piper-samples):
#      only clear-cut values are kept, the overlap zone stays unlabelled.
# Speaker names are handled at build time by src/lib/voices.ts.
#
# Usage: python scripts/generate_traits.py [--force]
# Already analysed models are kept unless --force is given.
import io, json, os, re, sys, wave, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'src', 'data')
OUT = os.path.join(DATA, 'traits.json')
MIRROR_REPO = 'fox3000foxy/piper-voices-collection'
SAMPLES = 'https://huggingface.co/datasets/fox3000foxy/piper-samples/resolve/main/'
UA = {'User-Agent': 'PiperHub/1.0'}
MAX_SPEAKERS = 8          # speakers analysed per multi-speaker model
MALE_MAX_HZ = 150         # median F0 below this: male voice
FEMALE_MIN_HZ = 188       # median F0 from this: female voice

FEMALE = re.compile(r'\b(female|woman|women|girl|feminine|féminine?|femme|weiblich|mujer|donna|kadın)\b|женск|女性|女声', re.I)
MALE = re.compile(r'\b(male|man|men|boy|masculine?|homme|männlich|hombre|uomo|erkek)\b|мужск|男性|男声', re.I)
CHILD = re.compile(r"\b(child|kid)('s)? voice\b|\bvoix d'enfant\b|\bchildren'?s voice\b", re.I)
# Speakers named after emotions are one person acting: judge them together.
EMOTION = re.compile(r'\b(joy|joyeuse|happy|amused|angry|colere|colère|sad|triste|surprised?|suprised|fear|disgust(ed)?|whisper|storytelling|excited|sleepy|drunk|interrogative|neutral)\b', re.I)
NARRATION = re.compile(r'\b(audiobooks?|librivox|narrat(or|ion|ive)|storytell(er|ing))\b', re.I)
# Lines about the checkpoint a model was fine-tuned from say nothing about its own voice.
NOT_ABOUT_VOICE = re.compile(r'base model|checkpoint|fine-?tun|pre-?train|initiali[sz]ed from|resumed from', re.I)


def get(url, timeout=30):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
        return r.read()


def source_repo(m):
    # Mirror rows: onnx = "<author>--<repo>/<file>"
    head = m['onnx'].split('/')[0]
    if m['repo'] == MIRROR_REPO and '--' in head:
        return head.replace('--', '/', 1)
    return m['repo']


def card_text(repo):
    try:
        text = get(f'https://huggingface.co/{repo}/raw/main/README.md', 20).decode('utf-8', 'replace')
    except Exception:
        return ''
    return '\n'.join(l for l in text.splitlines() if not NOT_ABOUT_VOICE.search(l))


def sample_url(repo, onnx, sid=0, n=0):
    # Same naming as src/lib/voices.ts sampleUrl()
    base = re.sub(r'[^a-zA-Z0-9\-_.]', '_', repo.replace('/', '--', 1) + '__' + re.sub(r'\.onnx$', '', onnx.replace('/', '_', 1)))
    return f'{SAMPLES}{base}__sp{sid}__{n}.wav'


def median_f0(buf):
    """Median fundamental frequency (YIN) over the voiced frames of a WAV file."""
    w = wave.open(io.BytesIO(buf))
    sr = w.getframerate()
    x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float64) / 32768
    if w.getnchannels() > 1:
        x = x.reshape(-1, w.getnchannels()).mean(1)
    W, hop, tmax, tmin = int(sr * 0.03), int(sr * 0.01), int(sr / 60), int(sr / 450)
    n = (len(x) - W - tmax) // hop
    if n <= 0:
        return None
    F = x[np.arange(n)[:, None] * hop + np.arange(W + tmax)[None, :]]
    energy = np.sqrt((F[:, :W] ** 2).mean(1))
    F = F[energy > 0.25 * np.percentile(energy, 90)]
    size = 1 << int(np.ceil(np.log2(2 * (W + tmax))))
    acf = np.fft.irfft(np.conj(np.fft.rfft(F[:, :W], size)) * np.fft.rfft(F, size), size)[:, :tmax + 1]
    c = np.concatenate([np.zeros((len(F), 1)), F ** 2], 1).cumsum(1)
    lags = np.arange(tmax + 1)
    d = (c[:, W][:, None] + c[:, lags + W] - c[:, lags] - 2 * acf)[:, 1:]
    cmnd = d * np.arange(1, tmax + 1) / np.maximum(d.cumsum(1), 1e-12)
    f0 = []
    for row in cmnd:
        cand = np.where(row[tmin - 1:] < 0.15)[0]
        if not len(cand):
            continue
        i = cand[0] + tmin - 1
        while i + 1 < len(row) and row[i + 1] < row[i]:
            i += 1
        f0.append(sr / (i + 1))
    return float(np.median(f0)) if len(f0) >= 15 else None


def pitch_gender(hz):
    if hz is None:
        return None
    return 'm' if hz < MALE_MAX_HZ else 'f' if hz >= FEMALE_MIN_HZ else None


def analyse(m):
    ids = (m.get('voiceIds') or [0])[:MAX_SPEAKERS]
    speakers = {}
    for sid in ids:
        try:
            hz = median_f0(get(sample_url(m['repo'], m['onnx'], sid)))
        except Exception:
            continue
        if hz is not None:
            speakers[str(sid)] = {'hz': round(hz), 'g': pitch_gender(hz)}
    return m['slug'], speakers


def main():
    force = '--force' in sys.argv
    models = [m for m in json.load(open(os.path.join(DATA, 'models.json'), encoding='utf-8')) if m.get('usable') or m.get('piperPlus')]
    try:
        traits = {} if force else json.load(open(OUT, encoding='utf-8'))
    except Exception:
        traits = {}

    per_repo = {}
    for m in models:
        per_repo.setdefault(source_repo(m), []).append(m)
    with ThreadPoolExecutor(12) as ex:
        cards = dict(zip(per_repo, ex.map(card_text, per_repo)))

    todo = [m for m in models if m['slug'] not in traits]
    print(f'{len(models)} models, {len(todo)} to analyse')
    with ThreadPoolExecutor(12) as ex:
        pitch = dict(ex.map(analyse, todo))

    for m in models:
        repo = source_repo(m)
        card = cards.get(repo, '')
        single = len(per_repo[repo]) == 1 and m.get('voices', 1) == 1
        ent = traits.get(m['slug'], {})
        if m['slug'] in pitch:
            ent = {'speakers': pitch[m['slug']]}
        ent.pop('gender', None); ent.pop('source', None)
        ent.pop('child', None); ent.pop('narration', None)

        f, ma = bool(FEMALE.search(card)), bool(MALE.search(FEMALE.sub('', card)))
        if single and f != ma:
            ent['gender'], ent['source'] = ['f' if f else 'm'], 'card'
        else:
            sp = ent.get('speakers', {})
            if sp and EMOTION.search(' '.join(m.get('voiceNames') or [])):
                g = pitch_gender(float(np.median([s['hz'] for s in sp.values()])))
                for s in sp.values():
                    s['g'] = g
            found = sorted({s['g'] for s in sp.values() if s.get('g')})
            if found:
                ent['gender'], ent['source'] = found, 'pitch'
        if single and CHILD.search(card):
            ent['child'] = True
        if (single and NARRATION.search(card)) or NARRATION.search(' '.join(m.get('voiceNames') or [])):
            ent['narration'] = True
        traits[m['slug']] = ent

    json.dump(dict(sorted(traits.items())), open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    n = lambda k, v=None: sum(1 for t in traits.values() if (t.get(k) == v if v else t.get(k)))
    print(f"gender: {sum(1 for t in traits.values() if t.get('gender'))}/{len(traits)} "
          f"(card {n('source', 'card')}, pitch {n('source', 'pitch')}), child {n('child')}, narration {n('narration')}")


if __name__ == '__main__':
    main()
