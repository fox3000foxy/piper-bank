# PiperHub – Piper TTS voices catalogue

**[piperhub.org](https://piperhub.org)** is a free, open-source catalogue of voices for [Piper TTS](https://github.com/OHF-Voice/piper1-gpl).
Browse 490+ models and 3,600+ speakers in 70 languages, listen to samples, check where each voice comes from (model ↔ dataset), and synthesize speech locally in your browser.

**[piperhub.org](https://piperhub.org)** est un catalogue libre et open source de voix pour Piper TTS : parcourez les modèles, écoutez des extraits, identifiez la source de chaque voix et générez de la parole localement dans votre navigateur.

- 🎧 [Voices / Voix](https://piperhub.org/voices/)
- 📦 [Datasets](https://piperhub.org/datasets/)
- 📖 [Guides](https://piperhub.org/guides/) · [Piper Plus](https://piperhub.org/guides-piper-plus/)
- 🌍 16 langues : English (racine) + fr, de, es, it, pt, ru, tr, ja, ko, zh, id, hi, ar, vi, th

## Development

```bash
npm install
npm run data    # regenerate src/data/*.json (python3 scripts/generate_data.py)
npx astro dev   # local dev server
npm run build   # static build in dist/
```

Built with [Astro](https://astro.build). Static site, no server: English lives at `/`, other locales under `/<code>/`.

Data pipeline: the catalog source of truth is the crawler repo (`models_mapping.csv`, `datasets_mapping.csv`), mirrored voices on Hugging Face, samples as audio files. `npm run data` pulls it all into `src/data/*.json`. See `scripts/` for the tooling.

## Translating

UI, guides, contact, and legal pages are translated per locale (`src/i18n/`). Native speakers welcome: see [TRANSLATING.md](TRANSLATING.md) to review strings and open a pull request.

## Licenses

Site code: MIT (see [LICENSE](LICENSE)). Voice models, samples and datasets keep their authors' licenses; see each model page and Hugging Face repository.
