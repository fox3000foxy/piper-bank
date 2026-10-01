# Gen: data/models.json depuis models_mapping.csv + compteur de voix des configs multimodèles
import csv, json, os, subprocess, urllib.request, urllib.parse, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'src', 'data')
os.makedirs(OUT, exist_ok=True)
CACHE = os.path.join(OUT, 'speakers_cache.json')
HF_TOKEN = open(os.path.expanduser('~/huggingface-crawler/.env')).read().split('HF_TOKEN=')[1].split('\n')[0]

def fetch_speakers(repo, jsonf):
    url = f"https://huggingface.co/{repo}/resolve/main/{urllib.parse.quote(jsonf, safe='/')}"
    headers = {"User-Agent": "PiperBot/1.0", "Authorization": f"Bearer {HF_TOKEN}"}
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=10) as resp:
            cfg = json.load(resp)
        sm = cfg.get('speaker_id_map') or {}
        n = len(sm) if sm else int(cfg.get('num_speakers') or 1)
        names = sorted(sm.keys(), key=lambda k: sm[k] if isinstance(sm[k], int) else (sm[k][0] if isinstance(sm[k], list) else 0))
        return {'n': n, 'names': names, 'cfg': cfg}
    except Exception:
        return {'n': 1, 'names': [], 'cfg': {}}

cache = {}
if os.path.realpath(CACHE):
    try: cache = json.load(open(CACHE))
    except Exception: cache = {}

lang_names = {'fr':'Français','en':'English','de':'Deutsch','es':'Español','ru':'Русский','it':'Italiano','zh':'中文',
              'ar':'العربية','tr':'Türkçe','pl':'Polski','sv':'Svenska','pt':'Português','hi':'हिन्दी','hu':'Magyar','fi':'Suomi'}

models = []
for r in csv.DictReader(open('/home/lsannier/huggingface-crawler/models_mapping.csv', newline='')):
    status = r['status'].strip()
    ok = status == '✅ files'
    lang = r['language'].strip().lower() or 'zz'
    model = {
        'name': r['thread_name'].strip(),
        'repo': r['hf_repo'].strip(),
        'onnx': r['onnx_file'].strip(),
        'json': r['json_file'].strip(),
        'author': r['author'].strip(),
        'quality': (r['quality'].strip() or 'unknown').lower(),
        'lang': lang,
        'langName': lang_names.get(lang, lang.upper()),
        'thread': r['thread_id'].strip(),
        'usable': ok,
        'voices': 1,
        'voiceNames': [],
    }
    models.append(model)

# speakers cache update for usable multiVoice
import concurrent.futures
need = [m for m in models if m['usable']]
def get_speakers(m):
    key = m['repo'] + '|' + m['json']
    ent = cache.get(key) or {}
    if 'cfg' not in ent:
        d = fetch_speakers(m['repo'], m['json'])
        n, names = d['n'], d['names']
        cfg = d.get('cfg') or {}
        ent = {'n': n, 'names': names, 'cfg': cfg}
        cache[key] = ent
    m['voices'], m['voiceNames'] = ent.get('n', 1), ent.get('names', [])
    cfg = ent.get('cfg') or {}
    # lightweight config for browser inference (text phoneme voices)
    m['phonemeType'] = cfg.get('phoneme_type') or ('text' if not cfg.get('espeak') else 'espeak')
    m['sampleRate'] = (cfg.get('audio') or {}).get('sample_rate') or 22050
    if m['phonemeType'] == 'text' and cfg.get('phoneme_id_map'):
        m['phonemeIdMap'] = cfg['phoneme_id_map']
        m['inference'] = cfg.get('inference') or {}

with concurrent.futures.ThreadPoolExecutor(24) as ex:
    list(ex.map(get_speakers, need))

json.dump(cache, open(CACHE,'w'), ensure_ascii=False)
json.dump(models, open(os.path.join(OUT,'models.json'),'w'), ensure_ascii=False)
usable_voices = sum(m['voices'] for m in models if m['usable'])
print(f"{len(models)} models, {usable_voices} voices usable, cache configs: {len(cache)}")
