# PiperHub – Piper TTS voices catalogue

**[piperhub.org](https://piperhub.org)** is a free, open-source catalogue of voices for [Piper TTS](https://github.com/OHF-Voice/piper1-gpl).
Browse 300+ models and 2,900+ speakers in 60 languages, listen to samples, check where each voice comes from (model ↔ dataset), and synthesize speech locally in your browser.

**[piperhub.org](https://piperhub.org)** est un catalogue libre et open source de voix pour Piper TTS : parcourez les modèles, écoutez des extraits, identifiez la source de chaque voix et générez de la parole localement dans votre navigateur.

- 🎧 [Voices / Voix](https://piperhub.org/voices/)
- 📦 [Datasets](https://piperhub.org/datasets/)
- 📖 [Guides](https://piperhub.org/guides/)
- 🇫🇷 [Version française](https://piperhub.org/fr/)

## Development

```bash
npm install
npm run data    # regenerate src/data/*.json (python3 scripts/generate_data.py)
npx astro dev   # local dev server
npm run build   # static build in dist/
```

Built with [Astro](https://astro.build). Bilingual site: English at `/`, French under `/fr/`.

## Licenses

Site code: MIT (see [LICENSE](LICENSE)). Voice models, samples and datasets keep their authors' licenses; see each model page and Hugging Face repository.
