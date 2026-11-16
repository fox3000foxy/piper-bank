// Per-model synthesis data (config + phoneme map), fetched by the compare page.
import models from '../../data/models.json';

export function getStaticPaths() {
  return models.filter((m) => m.usable).map((m) => ({ params: { slug: m.slug }, props: { m } }));
}

export function GET({ props }) {
  const { m } = props;
  const keep = {
    slug: m.slug, name: m.name, repo: m.repo, onnx: m.onnx, lang: m.lang, langName: m.langName, quality: m.quality,
    author: m.author, voices: m.voices, voiceNames: m.voiceNames, voiceIds: m.voiceIds, phonemeType: m.phonemeType,
    sampleRate: m.sampleRate, configs: m.configs, phonemeIdMap: m.phonemeIdMap, avatar: m.avatar,
  };
  return new Response(JSON.stringify(keep), { headers: { 'Content-Type': 'application/json' } });
}
