# Gen: data/models.json depuis models_mapping.csv + compteur de voix des configs multimodèles
import csv, json, os, re as _re, subprocess, urllib.request, urllib.parse, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'src', 'data')
os.makedirs(OUT, exist_ok=True)
CACHE = os.path.join(OUT, 'speakers_cache.json')
def _hf_token():
    if os.environ.get('HF_TOKEN'):
        return os.environ['HF_TOKEN']
    try:
        return open(os.path.expanduser('~/huggingface-crawler/.env')).read().split('HF_TOKEN=')[1].split('\n')[0]
    except Exception:
        return ''
HF_TOKEN = _hf_token()
CSV_MODELS = os.environ.get('CSV_MODELS', '/home/lsannier/huggingface-crawler/models_mapping.csv')
CSV_DATASETS = os.environ.get('CSV_DATASETS', '/home/lsannier/huggingface-crawler/datasets_mapping.csv')

def fetch_speakers(repo, jsonf):
    url = f"https://huggingface.co/{repo}/resolve/main/{urllib.parse.quote(jsonf, safe='/')}"
    headers = {"User-Agent": "PiperBot/1.0", "Authorization": f"Bearer {HF_TOKEN}"}
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=10) as resp:
            cfg = json.load(resp)
        sm = cfg.get('speaker_id_map') or {}
        n = len(sm) if sm else int(cfg.get('num_speakers') or 1)
        ordered = sorted(sm.items(), key=lambda kv: kv[1] if isinstance(kv[1], int) else (kv[1][0] if isinstance(kv[1], list) else 0))
        names = [k for k, _ in ordered]
        ids = [v if isinstance(v, int) else (v[0] if isinstance(v, list) else 0) for _, v in ordered]
        if not names:
            names = [f'voice-{i}' for i in range(max(n, 1))]
            ids = list(range(max(n, 1)))
        return {'n': n, 'names': names, 'ids': ids, 'cfg': cfg}
    except Exception:
        return {'n': 1, 'names': [], 'ids': [0], 'cfg': {}}

cache = {}
if os.path.realpath(CACHE):
    try: cache = json.load(open(CACHE))
    except Exception: cache = {}

lang_names = {'fr':'Français','en':'English','de':'Deutsch','es':'Español','ru':'Русский','it':'Italiano','zh':'中文',
              'ar':'العربية','tr':'Türkçe','pl':'Polski','sv':'Svenska','pt':'Português','hi':'हिन्दी','hu':'Magyar','fi':'Suomi','brx':'Bodo','si':'Sinhala','tet':'Tetun','kmr':'Kurmanci','ha':'Hausa'}

_DS_SLUG = {}
datasets = []
for d in csv.DictReader(open(CSV_DATASETS, newline='')):
    name = d['thread_name'].strip()
    slug = _re.sub(r'[^a-z0-9]+', '-', name.lower().encode('ascii', 'ignore').decode()).strip('-')[:80] or 'dataset'
    datasets.append({
        'name': name, 'slug': slug, 'repo': d['hf_repo'].strip(),
        'lang': (d['language'] or '').strip().lower() or 'xx',
        'langName': lang_names.get((d['language'] or '').strip().lower(), (d['language'] or 'XX').upper()),
        'class': d['class_name'].strip(), 'source': d['source'].strip(),
        'status': d['status'].strip(), 'thread': d['thread_id'].strip(),
        'private': (d.get('private') or '').strip() in ('1', 'true', 'yes'),
        'model': None, 'modelSlug': None,
    })
# slugs uniques + lien inverse modèle -> dataset (rempli après calcul des liens)
_seen_ds = set()
for dd in datasets:
    s_, k = dd['slug'], 1
    while s_ in _seen_ds:
        s_ = f"{dd['slug']}-{k}"; k += 1
    _seen_ds.add(s_)
    dd['slug'] = s_
json.dump(datasets, open(os.path.join(OUT, 'datasets.json'), 'w'), ensure_ascii=False)
print(f"{len(datasets)} datasets")
_DS_SLUG.update({dd['name']: dd['slug'] for dd in datasets})

models = []
for r in csv.DictReader(open(CSV_MODELS, newline='')):
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
        'piperPlus': 'piper-plus' in (r['hf_repo'] + r['onnx_file']).strip().lower(),
        'voices': 1,
        'voiceNames': [],
    }
    models.append(model)

# speakers cache update for usable multiVoice (+ modèles Piper+, visibles sans synthèse)
import concurrent.futures
need = [m for m in models if m['usable'] or m['piperPlus']]
def get_speakers(m):
    key = m['repo'] + '|' + m['json']
    ent = cache.get(key) or {}
    if 'cfg' not in ent or 'ids' not in ent:
        # backfill ids depuis le cfg en cache si possible (évite un refetch)
        old_cfg = ent.get('cfg') or {}
        old_sm = old_cfg.get('speaker_id_map') or {}
        if old_sm and 'ids' not in ent:
            ordered = sorted(old_sm.items(), key=lambda kv: kv[1] if isinstance(kv[1], int) else 0)
            ent['ids'] = [v if isinstance(v, int) else (v[0] if isinstance(v, list) else 0) for _, v in ordered]
            ent['names'] = [k for k, _ in ordered]
            ent['n'] = len(ordered)
            cache[key] = ent
        if 'cfg' not in ent or 'ids' not in ent:
            d = fetch_speakers(m['repo'], m['json'])
            n, names = d['n'], d['names']
            cfg = d.get('cfg') or {}
            ent = {'n': n, 'names': names, 'ids': d.get('ids') or list(range(n)), 'cfg': cfg}
            cache[key] = ent
    _n, _names = int(ent.get('n', 1)), ent.get('names') or []
    if not _names:
        _names = [f'voice-{i}' for i in range(max(_n, 1))]
    m['voices'], m['voiceNames'] = _n, _names
    m['voiceIds'] = ent.get('ids') or list(range(ent.get('n', 1)))
    cfg = ent.get('cfg') or {}
    # lightweight config for browser inference (text phoneme voices)
    m['phonemeType'] = cfg.get('phoneme_type') or ('text' if not cfg.get('espeak') else 'espeak')
    m['sampleRate'] = (cfg.get('audio') or {}).get('sample_rate') or 22050
    m['configs'] = {'inference': cfg.get('inference') or {}, 'audio': {'sample_rate': m['sampleRate']},
                    'espeak': cfg.get('espeak') or {}}
    if cfg.get('phoneme_id_map'):
        m['phonemeIdMap'] = cfg['phoneme_id_map']
        m['inference'] = cfg.get('inference') or {}

with concurrent.futures.ThreadPoolExecutor(24) as ex:
    list(ex.map(get_speakers, need))

# Dates de mise à jour HF (badges fraîcheur) : date du dernier commit du
# fichier ONNX lui-même (le lastModified du repo bouge pour un rien).
# Cache 7 jours.
UCACHE = os.path.join(OUT, 'updated_cache.json')
try: ucache = json.load(open(UCACHE))
except Exception: ucache = {}
def get_updated(m):
    key = m['repo'] + '|' + m['onnx']
    ent = ucache.get(key) or {}
    if ent.get('updated') and (time.time() - ent.get('fetched', 0)) < 7 * 86400:
        m['updated'] = ent['updated']
        return
    try:
        import json as _json
        body = _json.dumps({"paths": [m['onnx']], "expand": True}).encode()
        req = urllib.request.Request(f"https://huggingface.co/api/models/{m['repo']}/paths-info/main",
            data=body, headers={"User-Agent": "PiperBot/1.0", "Authorization": f"Bearer {HF_TOKEN}",
                                "Content-Type": "application/json"})
        info = _json.load(urllib.request.urlopen(req, timeout=20))
        date = (((info[0] if info else {}).get('lastCommit') or {}).get('date') or '')[:10]
        ent = {'updated': date, 'fetched': time.time()}
    except Exception:
        ent = {'updated': ent.get('updated', ''), 'fetched': time.time()}
    ucache[key] = ent
    m['updated'] = ent['updated']
with concurrent.futures.ThreadPoolExecutor(24) as ex:
    list(ex.map(get_updated, need))
json.dump(ucache, open(UCACHE, 'w'))
print(f"dates: {sum(1 for m in need if m.get('updated'))}/{len(need)}")

# Licences affichées sur la fiche modèle : cardData des dépôts du Hub, API
# GitHub pour les voix miroitées (leur source est un dépôt git, pas un dépôt
# HF). Cache 30 jours, et un échec n'est jamais mis en cache (on retente).
LCACHE = os.path.join(OUT, 'licenses_cache.json')
try: lcache = json.load(open(LCACHE))
except Exception: lcache = {}
MIRROR_REPO = 'fox3000foxy/piper-voices-collection'
def _lic_keys_of(m):
    # ligne hébergée dans le miroir : onnx = "<auteur>--<depot>/<fichier>"
    # le dépôt source existe potentiellement sur HF ET/OU sur GitHub
    if m['repo'] == MIRROR_REPO and '/' in m['onnx'] and '--' in m['onnx'].split('/')[0]:
        slug = m['onnx'].split('/')[0].replace('--', '/', 1)
        return ['hf:' + slug, 'gh:' + slug]
    return ['hf:' + m['repo']]
def _fetch_hf(repo):
    req = urllib.request.Request(f"https://huggingface.co/api/models/{repo}",
        headers={"User-Agent": "PiperHub/1.0", "Authorization": f"Bearer {HF_TOKEN}"})
    cd = json.load(urllib.request.urlopen(req, timeout=25)).get('cardData') or {}
    lic = cd.get('license')
    # 'other' seul ne veut rien dire : le libellé réel est dans license_name
    return (cd.get('license_name') or 'other') if lic == 'other' else (lic or '')
def _fetch_gh(slug):
    req = urllib.request.Request(f"https://api.github.com/repos/{slug}",
        headers={"User-Agent": "PiperHub/1.0", "Accept": "application/vnd.github+json"})
    lic = json.load(urllib.request.urlopen(req, timeout=25)).get('license') or {}
    return lic.get('spdx_id') or lic.get('name') or ''
def get_license(key):
    ent = lcache.get(key) or {}
    if 'value' in ent and (time.time() - ent.get('fetched', 0)) < 30 * 86400:
        return
    try:
        val = _fetch_gh(key[3:]) if key.startswith('gh:') else _fetch_hf(key[3:])
        lcache[key] = {'value': val, 'fetched': time.time()}
    except Exception:
        lcache[key] = {'value': ent.get('value', ''), 'fetched': ent.get('fetched', 0)}
# Libellés lisibles : on n'affiche ni 'mit' ni 'apache-2.0' en vrac.
_LIC_LABEL = {
    'mit': 'MIT', 'apache-2.0': 'Apache-2.0', 'gpl-3.0': 'GPL-3.0',
    'cc-by-4.0': 'CC BY 4.0', 'cc-by-nc-4.0': 'CC BY-NC 4.0', 'cc-by-nc-nd-4.0': 'CC BY-NC-ND 4.0',
    'cc0-1.0': 'CC0 1.0', 'openrail': 'OpenRAIL',
    'cc-by-nc-sa-4.0': 'CC BY-NC-SA 4.0', 'other': 'Autre',
}
def _lic_label(v):
    v = (v or '').strip()
    if not v or v.upper() == 'NOASSERTION':
        return ''
    return _LIC_LABEL.get(v.lower(), v)
_lic_keys = sorted({k for m in models for k in _lic_keys_of(m)})
with concurrent.futures.ThreadPoolExecutor(12) as ex:
    list(ex.map(get_license, _lic_keys))
# Licences etablies par audit (scripts/licenses_audit.json) : ces depots ne
# declarent rien sur le Hub, mais la source des poids en declare une. L'audit
# ne comble que les trous, une licence reellement lue garde la priorite.
try:
    _audit = json.load(open(os.path.join(ROOT, 'scripts', 'licenses_audit.json'))).get('licenses', {})
except Exception:
    _audit = {}
for m in models:
    m['license'] = next((_lic_label(lcache.get(k, {}).get('value', '')) for k in _lic_keys_of(m)
                         if _lic_label(lcache.get(k, {}).get('value', ''))), '')
    if not m['license']:
        m['license'] = next((_lic_label(_audit[k]) for k in _lic_keys_of(m) if _audit.get(k)), '')
# Licences éditoriales par univers (décision du propriétaire, 2026-10-06) :
# les voix Valorant affichent Riot Games et les voix Counter-Strike Valve,
# Y COMPRIS quand le dépôt déclare une autre licence (les 26 checkpoints
# Valorant déclarent MIT sur le Hub). S'applique en dernier, après les
# licences réellement lues et après l'audit.
_UNIVERSE_LICENSE = {
    'RoxasYTB/piper-checkpoints-css-announcer-fr': 'Valve',
    'RoxasYTB/piper-checkpoints-css-announcer-en': 'Valve',
}
for _agent in ('astra breach brimstone chamber clove cypher deadlock fade gekko '
               'harbor iso jett kayo killjoy neon omen phoenix raze reyna sage '
               'skye sova tejo viper vyse yoru').split():
    _UNIVERSE_LICENSE[f'fox3000foxy/piper-checkpoints-{_agent}'] = 'Riot Games'
del _agent
for m in models:
    if m['repo'] in _UNIVERSE_LICENSE:
        m['license'] = _UNIVERSE_LICENSE[m['repo']]
print(f"licences univers: {sum(1 for m in models if m['repo'] in _UNIVERSE_LICENSE)} modeles labellises")
json.dump(lcache, open(LCACHE, 'w'))
print(f"licences: {sum(1 for k in _lic_keys if lcache.get(k, {}).get('value'))}/{len(_lic_keys)} depots renseignes")

# Classement par repo d'abord (exact), puis par mots entiers du NOM (pas le repo).
ICONS = {
 'portal': 'icons/portal.svg', 'tf2': 'icons/tf2.svg', 'valorant': 'icons/valorant.svg',
 'hal': 'icons/hal9000.svg', 'starwars': 'icons/ahsoka.svg', 'fortune': 'icons/fortune.svg',
 'counter-strike': 'icons/counter-strike.svg', 'kurmanci': 'icons/kurmanci.svg',
 'fuze': 'icons/fuze.svg', 'dota': 'icons/dota2.svg',
}
REPO_UNIVERSE = [
 ('fox3000foxy/piper-checkpoints-fortune', 'fortune', '🔮', 300),
 ('fox3000foxy/piper-checkpoints-glados', 'portal', '🌀', 265),
 ('fox3000foxy/piper-checkpoints-wheatley', 'portal', '🌀', 265),
 ('fox3000foxy/piper-checkpoints-css', 'counter-strike', '💣', 35),
 ('fox3000foxy/piper-checkpoints-fuzeiii', 'fuze', '⚡', 0),
 ('fox3000foxy/piper-checkpoints-dota2', 'dota', '🎮', 8),
 ('fox3000foxy/piper-checkpoints-', 'valorant', '🎯', 350),
 ('RoxasYTB/css-radio', 'counter-strike', '💣', 35),
 ('RoxasYTB/glados', 'portal', '🌀', 265),
 ('RoxasYTB/wheatley', 'portal', '🌀', 265),
 ('RoxasYTB/turret', 'portal', '🌀', 265),
 ('RoxasYTB/announcer', 'portal', '🌀', 265),
 ('RoxasYTB/apsap', 'portal', '🌀', 265),
 ('RoxasYTB/caroline', 'portal', '🌀', 265),
 ('RoxasYTB/cavejohnson', 'portal', '🌀', 265),
 ('RoxasYTB/cores', 'portal', '🌀', 265),
 ('RoxasYTB/deskjob', 'portal', '🌀', 265),
 ('RoxasYTB/oracle', 'portal', '🌀', 265),
 ('RoxasYTB/scout', 'tf2', '🔫', 8),
 ('RoxasYTB/soldier', 'tf2', '🔫', 8),
 ('RoxasYTB/pyro', 'tf2', '🔫', 8),
 ('RoxasYTB/demoman', 'tf2', '🔫', 8),
 ('RoxasYTB/heavy', 'tf2', '🔫', 8),
 ('RoxasYTB/engineer', 'tf2', '🔫', 8),
 ('RoxasYTB/medic', 'tf2', '🔫', 8),
 ('RoxasYTB/sniper', 'tf2', '🔫', 8),
 ('RoxasYTB/spy', 'tf2', '🔫', 8),
 ('HAL-9000-Piper', 'hal', '🔴', 0),
 ('hal-9000-piper', 'hal', '🔴', 0),
 ('ahsoka-piper', 'starwars', '⚔️', 210),
 ('kurmanci-tts', 'kurmanci', '🦚', 45),
]
NAME_UNIVERSE = [
 ('portal', [r'glados', r'wheatley', r'\bportal\b', r'\bturrets?\b', r'\bannouncer\b', r'\baperture\b', r'\bchell\b', r'cave johnson', r'\bcaroline\b', r'\bcores\b', r'oracle turret', r'defective turret', r'desk job'], '🌀', 265),
 ('tf2', [r'\bscout\b', r'\bsoldier\b', r'\bpyro\b', r'\bdemoman\b', r'\bheavy\b', r'\bengineer\b', r'\bmedic\b', r'\bsniper\b', r'\bspy\b', r'\btf2\b', r'team fortress'], '🔫', 8),
 ('valorant', [r'\bvalorant\b', r'\bjett\b', r'\bsage\b', r'\breyna\b', r'\bomen\b', r'\bsova\b', r'\braze\b', r'\bphoenix\b', r'\bastra\b', r'\bbreach\b', r'\bbrimstone\b', r'\bchamber\b', r'\bclove\b', r'\bcypher\b', r'\bdeadlock\b', r'\bfade\b', r'\bgekko\b', r'\bharbor\b', r'^iso\b', r'\bkayo\b', r'\bkilljoy\b', r'\bneon\b', r'\bskye\b', r'\btejo\b', r'\bviper\b', r'\bvyse\b', r'\byoru\b'], '🎯', 350),
 ('hal', [r'hal 9000'], '🔴', 0),
 ('starwars', [r'\bahsoka\b'], '⚔️', 210),
 ('fortune', [r'fortune', r'itsrealfortune'], '🔮', 300),
 ('counter-strike', [r'counter.?strike', r'\bcss\b', r'\bannonceur\b', r'\bradio\b'], '💣', 35),
 ('kurmanci', [r'kurmanci', r'kurdish \(kmr\)'], '🦚', 45),
 ('fuze', [r'\bfuze\b'], '⚡', 0),
 ('dota', [r'\bdota\b'], '🎮', 8),
]

def avatar_of(name, repo, certified=False):
    out = _avatar_of(name, repo)
    out['icon'] = ICONS.get(out['universe'])
    out['certified'] = certified
    return out


def _avatar_of(name, repo):
    rl = repo.lower()
    for prefix, uni, emoji, hue in REPO_UNIVERSE:
        if rl.startswith(prefix.lower()):
            return {'emoji': emoji, 'hue': hue, 'universe': uni}
    nl = name.lower()
    for uni, patterns, emoji, hue in NAME_UNIVERSE:
        if any(_re.search(p, nl) for p in patterns):
            return {'emoji': emoji, 'hue': hue, 'universe': uni}
    initial = next((c.upper() for c in name if c.isalnum()), '?')
    hue = sum(ord(c) for c in name) % 360
    return {'emoji': initial, 'hue': hue, 'universe': 'default'}

seen_slugs = set()

def _dataset_link(repo, thread_id):
    """Lien strict modèle -> dataset, ou None. Règles explicites uniquement."""
    import csv as _csv
    if not hasattr(_dataset_link, 'cache'):
        ds = list(_csv.DictReader(open(CSV_DATASETS, newline='')))
        tid2ds, repo_rules = {}, []
        for d in ds:
            mm = _re.search(r'modèle:\s*(\d+)', d['status'])
            if mm:
                tid2ds[mm.group(1)] = d
            dr = d['hf_repo'].strip().lower()
            if dr and '↔' not in dr:
                repo_rules.append(d)
        _dataset_link.cache = (tid2ds, repo_rules)
    tid2ds, repo_rules = _dataset_link.cache
    if thread_id in tid2ds:
        d = tid2ds[thread_id]
        return {'name': d['thread_name'], 'slug': _DS_SLUG.get(d['thread_name']), 'repo': d['hf_repo'], 'source': d['source'], 'lang': d['language']}
    rl = (repo or '').lower()
    for d in repo_rules:
        dr = d['hf_repo'].strip().lower()
        if 'glados_p1_fr-ljspeech' in dr and 'glados_p1_fr' in rl:
            return {'name': d['thread_name'], 'slug': _DS_SLUG.get(d['thread_name']), 'repo': d['hf_repo'], 'source': d['source'], 'lang': d['language']}
        if 'css-radio-french-ljspeech' in dr and 'css-announcer-fr' in rl:
            return {'name': d['thread_name'], 'slug': _DS_SLUG.get(d['thread_name']), 'repo': d['hf_repo'], 'source': d['source'], 'lang': d['language']}
        if 'valorant-ljspeech-piper' in dr and rl.startswith('fox3000foxy/piper-checkpoints-'):
            agent = rl.split('piper-checkpoints-')[-1]
            if agent and agent == (d['class_name'] or '').lower():
                return {'name': d['thread_name'], 'slug': _DS_SLUG.get(d['thread_name']), 'repo': d['hf_repo'], 'source': d['source'], 'lang': d['language']}
        if 'wheatley' in dr and 'wheatley' in rl:
            return {'name': d['thread_name'], 'slug': _DS_SLUG.get(d['thread_name']), 'repo': d['hf_repo'], 'source': d['source'], 'lang': d['language']}
        if 'fuze-eleven-v4-piper' in dr and 'fuzeiii' in rl:
            return {'name': d['thread_name'], 'slug': _DS_SLUG.get(d['thread_name']), 'repo': d['hf_repo'], 'source': d['source'], 'lang': d['language']}
        if dr == 'fox3000foxy/fortune-eleven-v4-piper' and ('fortune-v6' in rl or 'fortune-fr-multi' in rl):
            return {'name': d['thread_name'], 'slug': _DS_SLUG.get(d['thread_name']), 'repo': d['hf_repo'], 'source': d['source'], 'lang': d['language']}
        if dr == 'fox3000foxy/fortune-eleven-v4-piper-en' and 'fortune-en-multi' in rl:
            return {'name': d['thread_name'], 'slug': _DS_SLUG.get(d['thread_name']), 'repo': d['hf_repo'], 'source': d['source'], 'lang': d['language']}
    return None

for mm in models:
    base = _re.sub(r'[^a-z0-9]+', '-', mm['name'].lower().encode('ascii', 'ignore').decode()).strip('-')[:80] or 'model'
    s_ = base; k = 1
    while s_ in seen_slugs:
        s_ = f"{base}-{k}"; k += 1
    seen_slugs.add(s_)
    mm['slug'] = s_
    mm['avatar'] = avatar_of(mm['name'], mm['repo'], certified=(mm['repo'] == 'rhasspy/piper-voices'))
    mm['dataset'] = _dataset_link(mm['repo'], mm['thread'])
# lien inverse : dataset -> modèle (pour les pages dataset)
slug_by_thread = {m['thread']: m['slug'] for m in models if m.get('thread')}
name_by_thread = {m['thread']: m['name'] for m in models if m.get('thread')}
for dd in datasets:
    t = None
    mm_ = _re.search(r'modèle:\s*(\d+)', dd['status'])
    if mm_ and mm_.group(1) in slug_by_thread:
        t = mm_.group(1)
    else:
        # match via _dataset_link inverse : modèle pointant vers ce dataset (nom exact)
        for m in models:
            ds = m.get('dataset')
            if ds and ds.get('name') == dd['name'] and ds.get('repo') == dd['repo']:
                t = m['thread']
                break
    if t and t in slug_by_thread:
        dd['model'] = name_by_thread[t]
        dd['modelSlug'] = slug_by_thread[t]
json.dump(datasets, open(os.path.join(OUT, 'datasets.json'), 'w'), ensure_ascii=False)
json.dump(cache, open(CACHE,'w'), ensure_ascii=False)
json.dump(models, open(os.path.join(OUT,'models.json'),'w'), ensure_ascii=False)
usable_voices = sum(m['voices'] for m in models if m['usable'])
print(f"{len(models)} models, {usable_voices} voices usable, cache configs: {len(cache)}")
