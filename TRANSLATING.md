# Translating PiperHub

PiperHub speaks 16 languages: `en`, `fr`, `de`, `es`, `it`, `pt`, `ru`,
`tr`, `ja`, `ko`, `zh` (simplified), `id`, `hi`, `ar`, `vi`, `th`.
Native speakers are welcome to review and fix translations by opening
a pull request. No account beyond GitHub is needed.

## Files

| Directory | Content | Keys per locale |
|---|---|---|
| `src/i18n/locales/` | UI strings (navigation, catalog, model pages) | 213 |
| `src/i18n/guides/` | Guide pages (tutorials, code samples) | 113 |
| `src/i18n/contact/` | Contact form | 15 |
| `src/i18n/legal/` | Privacy, terms, legal notice | 25 |

`fr.json` is the reference in each directory. English lives in `en.json`.
Pages without their locale file fall back to English automatically.

## Workflow

1. Fork `fox3000foxy/piper-bank` and edit the `<code>.json` files of your
   language (one pull request per language is easiest to review).
2. Run the validator before committing:
   `node scripts/i18n-check.mjs`
3. Open the pull request against `main` with a short description of what
   you fixed. Screenshots of the rendered page help but are optional.

## Rules (pull requests breaking them will be asked for changes)

1. **Key parity**: never add, remove, or rename keys. Every file must hold
   exactly the same keys as `fr.json` in its directory.
2. **Placeholders**: `{name}`, `{count}`, `{models}` and similar tokens
   stay verbatim (ASCII, same order as the grammar of your language
   requires). Never translate or drop them.
3. **No em-dashes**: the character `—` (U+2014) is banned site-wide.
   Use commas, colons, or parentheses instead.
4. **Frozen code**: in `guides/`, these keys are byte-identical everywhere
   and must never be translated: `archive`, `yaml`, `synthCommand`,
   `rawCommand`, `pythonExample`, `slowCommand`, `ppInstallCommand`,
   `ppDownloadCommand`, `ppSynthCommand`, `npmInstallCommand`,
   `npmExample`, `npmCustomExample`, `npmLegacyExample`. The validator
   does not cover them, so double-check by hand.
5. **Do not translate**: brand and technical names (PiperHub, Piper TTS,
   Piper Plus, Hugging Face, Discord, ONNX, JSON, WAV, LJSpeech, espeak,
   GitHub, RSS, Kaggle, Node.js, Python), URLs, model names, commands,
   digits (Latin 0-9 everywhere).
6. **Legal pages** (`legal/`): faithful, formal translation only. When in
   doubt, prefer the plainer wording and say so in the pull request.

## New language?

Opening a new locale means translating all four directories plus routes,
sitemap, and metadata. Please open an issue first so maintainers can
prepare the scaffolding.
