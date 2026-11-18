// Voice traits for build-time pages: what the names say (voices.ts) completed by
// src/data/traits.json (Hugging Face model card, then pitch of the samples).
// Server-only: keeps the JSON out of client bundles.
import data from '../data/traits.json';
import { voiceTraits } from './voices';

type Gender = 'f' | 'm';
type Entry = { gender?: Gender[]; source?: 'card' | 'pitch'; child?: boolean; narration?: boolean; speakers?: Record<string, { hz: number; g: Gender | null }> };
const traits = data as Record<string, Entry>;

export type TraitSource = 'name' | 'card' | 'pitch';
/** Display order: gender first, then age, then style. */
export const TRAIT_ORDER = ['female', 'male', 'child', 'narration', 'expressive', 'character'] as const;

type ModelLike = Parameters<typeof voiceTraits>[0];

export function modelTraits(m: ModelLike): { traits: string[]; genderSource: TraitSource | null } {
  const set = new Set(voiceTraits(m));
  const named = set.has('female') || set.has('male');
  const ent = traits[m.slug] || {};
  if (!named) for (const g of ent.gender || []) set.add(g === 'f' ? 'female' : 'male');
  if (ent.child) set.add('child');
  if (ent.narration) set.add('narration');
  const hasGender = set.has('female') || set.has('male');
  return {
    traits: TRAIT_ORDER.filter((t) => set.has(t)),
    genderSource: !hasGender ? null : named ? 'name' : (ent.source ?? null),
  };
}

/** Gender estimated for one speaker of a multi-speaker model, if clear-cut. */
export function speakerGender(slug: string, sid: number): 'female' | 'male' | null {
  const g = traits[slug]?.speakers?.[String(sid)]?.g;
  return g === 'f' ? 'female' : g === 'm' ? 'male' : null;
}
