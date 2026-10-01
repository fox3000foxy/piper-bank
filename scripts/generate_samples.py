# Scrape les pièces jointes audio des threads #models -> website/src/data/samples.json
# {thread_id: [cdn_url, ...]} (max 4 par thread)
import csv, json, os, time, urllib.request

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'src', 'data', 'samples.json')
DISCORD_TOKEN = open(os.path.expanduser('~/huggingface-crawler/.env')).read().split('DISCORD_TOKEN=')[1].split('\n')[0]

tids = set()
for r in csv.DictReader(open('/home/lsannier/huggingface-crawler/models_mapping.csv', newline='')):
    if r['thread_id'].strip():
        tids.add(r['thread_id'].strip())

samples = {}
try:
    samples = json.load(open(OUT))
except Exception:
    samples = {}

AUDIO = ('.wav', '.mp3', '.ogg', '.flac', '.opus')
n_new = 0
for tid in sorted(tids):
    if tid in samples and len(samples[tid]) >= 2:
        continue
    try:
        req = urllib.request.Request(f'https://discord.com/api/v10/channels/{tid}/messages?limit=25',
            headers={'Authorization': f'Bot {DISCORD_TOKEN}', 'User-Agent': 'PiperBot/1.0'})
        msgs = json.loads(urllib.request.urlopen(req, timeout=10).read())
        urls = []
        for m in msgs:
            for a in m.get('attachments', []):
                fn = (a.get('filename') or '').lower()
                if fn.endswith(AUDIO) and a.get('url'):
                    urls.append(a['url'])
                if len(urls) >= 4:
                    break
        if urls:
            samples[tid] = urls
            n_new += 1
    except Exception as e:
        print('skip', tid, str(e)[:60])
    time.sleep(0.35)

json.dump(samples, open(OUT, 'w'))
print(f'threads avec échantillons: {len(samples)} (+{n_new} nouveaux)')
